import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import type { PrintJobStatus, Prisma } from "@prisma/client";
import prisma from "../db.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type LocationOption = {
  id: string;
  name: string;
  isActive: boolean;
  fulfillsOnlineOrders: boolean;
};

export type DashboardPrinter = {
  id: string;
  name: string;
  computerName: string;
  state: string;
};

export type DashboardJob = {
  id: string;
  orderName: string;
  locationName: string;
  printerName: string;
  status: PrintJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  printedAt: string | null;
};

type DashboardRule = {
  id: string;
  locationId: string;
  locationName: string;
  printerName: string;
  printerExternalId: string | null;
  enabled: boolean;
} | null;

export type DashboardData = {
  shop: string;
  providerConfigured: boolean;
  providerError: string | null;
  locations: LocationOption[];
  printers: DashboardPrinter[];
  rule: DashboardRule;
  jobs: DashboardJob[];
};

type Address = {
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
};

type PackingSlipLine = {
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
};

type FulfillmentOrderLineItem = {
  totalQuantity: number | null;
  remainingQuantity: number | null;
  lineItem: {
    title: string | null;
    name: string | null;
    sku: string | null;
    variantTitle: string | null;
    quantity: number | null;
    variant: { sku: string | null; barcode: string | null } | null;
    product: { title: string | null } | null;
  } | null;
};

type FulfillmentOrderNode = {
  id: string;
  status: string;
  assignedLocation: {
    name: string | null;
    location: { id: string; name: string } | null;
  } | null;
  lineItems: {
    nodes: FulfillmentOrderLineItem[];
  };
};

type OrderPrinterOrder = {
  id: string;
  name: string;
  createdAt: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  shippingAddress: Address | null;
  lineItems: {
    nodes: {
      title: string | null;
      name: string | null;
      sku: string | null;
      variantTitle: string | null;
      quantity: number | null;
      variant: { sku: string | null; barcode: string | null } | null;
      product: { title: string | null } | null;
    }[];
  };
  fulfillmentOrders: {
    nodes: FulfillmentOrderNode[];
  };
};

const LOCATIONS_QUERY = `#graphql
  query OrderPrinterLocations {
    locations(first: 100, sortKey: NAME) {
      nodes {
        id
        name
        isActive
        fulfillsOnlineOrders
      }
    }
  }
`;

const ORDER_QUERY = `#graphql
  query OrderPrinterOrder($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      email
      phone
      note
      shippingAddress {
        name
        company
        address1
        address2
        city
        provinceCode
        zip
        country
        phone
      }
      lineItems(first: 100) {
        nodes {
          title
          name
          sku
          variantTitle
          quantity
          variant {
            sku
            barcode
          }
          product {
            title
          }
        }
      }
      fulfillmentOrders(first: 25) {
        nodes {
          id
          status
          assignedLocation {
            name
            location {
              id
              name
            }
          }
          lineItems(first: 100) {
            nodes {
              totalQuantity
              remainingQuantity
              lineItem {
                title
                name
                sku
                variantTitle
                quantity
                variant {
                  sku
                  barcode
                }
                product {
                  title
                }
              }
            }
          }
        }
      }
    }
  }
`;

function toIso(date: Date | null) {
  return date ? date.toISOString() : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizePrinterName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 240);
}

async function graphqlJson<T>(
  admin: AdminGraphqlClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as {
    data?: T;
    errors?: { message?: string }[];
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  if (!json.data) {
    throw new Error("Shopify returned an empty GraphQL response.");
  }

  return json.data;
}

type PrintNodePrinter = {
  id: number;
  name: string;
  computer?: {
    name?: string | null;
  } | null;
  state?: string | null;
};

type PrintNodeJobResponse = number | { id?: number | string };

function printNodeApiKey() {
  return process.env.PRINTNODE_API_KEY?.trim() || "";
}

function printNodeAuthHeader() {
  return `Basic ${Buffer.from(`${printNodeApiKey()}:`).toString("base64")}`;
}

function requirePrintNodeApiKey() {
  if (!printNodeApiKey()) {
    throw new Error("PRINTNODE_API_KEY is not configured.");
  }
}

function idempotencyKey(parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

async function printNodeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  requirePrintNodeApiKey();

  const response = await fetch(`https://api.printnode.com${path}`, {
    ...init,
    headers: {
      authorization: printNodeAuthHeader(),
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `PrintNode ${path} failed with ${response.status}: ${text || response.statusText}`,
    );
  }

  return (text ? JSON.parse(text) : null) as T;
}

export async function fetchProviderPrinters(): Promise<DashboardPrinter[]> {
  const printers = await printNodeFetch<PrintNodePrinter[]>("/printers");

  return printers
    .filter((printer) => printer.id && printer.name)
    .map((printer) => ({
      id: String(printer.id),
      name: printer.name,
      computerName: printer.computer?.name || "PrintNode client",
      state: printer.state || "unknown",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function submitPdfToPrintNode({
  printerExternalId,
  title,
  pdfBase64,
  key,
}: {
  printerExternalId: string;
  title: string;
  pdfBase64: string;
  key: string;
}) {
  const printerId = Number(printerExternalId);

  if (!Number.isInteger(printerId) || printerId <= 0) {
    throw new Error(`Invalid PrintNode printer id: ${printerExternalId}`);
  }

  const response = await printNodeFetch<PrintNodeJobResponse>("/printjobs", {
    method: "POST",
    headers: {
      "x-idempotency-key": key,
    },
    body: JSON.stringify({
      printerId,
      title,
      contentType: "pdf_base64",
      content: pdfBase64,
      source: "COG Order Printer",
      expireAfter: 600,
    }),
  });

  if (typeof response === "number") {
    return String(response);
  }

  return response.id ? String(response.id) : null;
}

export async function fetchLocations(admin: AdminGraphqlClient) {
  const data = await graphqlJson<{ locations: { nodes: LocationOption[] } }>(
    admin,
    LOCATIONS_QUERY,
  );

  return data.locations.nodes.filter((location) => location.isActive);
}

export async function loadDashboard(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<DashboardData> {
  const [locations, rule, jobs, printerResult] = await Promise.all([
    fetchLocations(admin),
    prisma.printerRule.findFirst({
      where: { shop },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.printJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    fetchProviderPrinters()
      .then((printers) => ({ printers, error: null }))
      .catch((error) => ({
        printers: [] as DashboardPrinter[],
        error: error instanceof Error ? error.message : "Printer lookup failed.",
      })),
  ]);

  return {
    shop,
    providerConfigured: Boolean(printNodeApiKey()),
    providerError: printerResult.error,
    locations,
    printers: printerResult.printers,
    rule: rule
      ? {
          id: rule.id,
          locationId: rule.locationId,
          locationName: rule.locationName,
          printerName: rule.printerName,
          printerExternalId: rule.printerExternalId,
          enabled: rule.enabled,
        }
      : null,
    jobs: jobs.map((job) => ({
      id: job.id,
      orderName: job.orderName,
      locationName: job.locationName,
      printerName: job.printerName,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError,
      createdAt: job.createdAt.toISOString(),
      printedAt: toIso(job.printedAt),
    })),
  };
}

export async function savePrinterRule(
  admin: AdminGraphqlClient,
  shop: string,
  formData: FormData,
) {
  const locationId = String(formData.get("locationId") || "");
  const printerExternalId = normalizePrinterName(
    formData.get("printerExternalId"),
  );
  const enabled = formData.get("enabled") === "on";

  if (!locationId) {
    throw new Error("Choose a fulfillment location.");
  }

  if (!printerExternalId) {
    throw new Error("Choose a printer.");
  }

  const [locations, printers] = await Promise.all([
    fetchLocations(admin),
    fetchProviderPrinters(),
  ]);

  const location = locations.find((option) => option.id === locationId);
  const printer = printers.find((option) => option.id === printerExternalId);

  if (!location) {
    throw new Error("That fulfillment location is not available.");
  }

  if (!printer) {
    throw new Error("That printer is not available from PrintNode.");
  }

  await prisma.$transaction([
    prisma.printerRule.deleteMany({
      where: {
        shop,
        NOT: { locationId },
      },
    }),
    prisma.printerRule.upsert({
      where: { shop_locationId: { shop, locationId } },
      update: {
        locationName: location.name,
        printerName: printer.name,
        printerProvider: "printnode",
        printerExternalId: printer.id,
        enabled,
      },
      create: {
        shop,
        locationId,
        locationName: location.name,
        printerName: printer.name,
        printerProvider: "printnode",
        printerExternalId: printer.id,
        enabled,
      },
    }),
  ]);
}

export async function retryPrintJob(shop: string, jobId: string) {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId, shop },
  });

  if (!job) {
    throw new Error("Print job was not found.");
  }

  if (!job.printerExternalId || !job.pdfBase64) {
    throw new Error("Print job does not have enough provider data to retry.");
  }

  await prisma.printJob.update({
    where: { id: job.id },
    data: {
      status: "PRINTING",
      lastError: null,
      claimedAt: new Date(),
      printedAt: null,
      attempts: { increment: 1 },
      events: {
        create: {
          shop,
          status: "PRINTING",
          message: "Manual retry submitted to PrintNode.",
        },
      },
    },
  });

  try {
    const providerJobId = await submitPdfToPrintNode({
      printerExternalId: job.printerExternalId,
      title: `Packing slip ${job.orderName}`,
      pdfBase64: job.pdfBase64,
      key: idempotencyKey([shop, job.orderId, job.locationId, String(Date.now())]),
    });

    return prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "SUBMITTED",
        providerJobId,
        lastError: null,
        events: {
          create: {
            shop,
            status: "SUBMITTED",
            message: providerJobId
              ? `PrintNode accepted retry job ${providerJobId}.`
              : "PrintNode accepted retry job.",
          },
        },
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Print provider submission failed.";

    return prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        lastError: message,
        events: {
          create: {
            shop,
            status: "FAILED",
            message,
          },
        },
      },
    });
  }
}

export function orderGidFromWebhookPayload(payload: unknown) {
  const orderPayload = payload as {
    admin_graphql_api_id?: unknown;
    id?: unknown;
  };

  if (typeof orderPayload.admin_graphql_api_id === "string") {
    return orderPayload.admin_graphql_api_id;
  }

  if (typeof orderPayload.id === "number" || typeof orderPayload.id === "string") {
    return `gid://shopify/Order/${orderPayload.id}`;
  }

  throw new Error("The orders/create webhook did not include an order id.");
}

function addressLines(address: Address | null) {
  if (!address) {
    return [];
  }

  return [
    address.name,
    address.company,
    address.address1,
    address.address2,
    [address.city, address.provinceCode, address.zip].filter(Boolean).join(" "),
    address.country,
    address.phone,
  ].filter((line): line is string => Boolean(line));
}

function lineTitle(line: PackingSlipLine) {
  if (!line.variantTitle || line.variantTitle === "Default Title") {
    return line.title;
  }

  return `${line.title} - ${line.variantTitle}`;
}

function renderPackingSlipHtml({
  order,
  locationName,
  lines,
}: {
  order: OrderPrinterOrder;
  locationName: string;
  lines: PackingSlipLine[];
}) {
  const shipTo = addressLines(order.shippingAddress);
  const createdAt = new Date(order.createdAt).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const rows = lines
    .map(
      (line) => `
        <tr>
          <td class="qty">${escapeHtml(line.quantity)}</td>
          <td>
            <strong>${escapeHtml(lineTitle(line))}</strong>
            ${
              line.sku
                ? `<span class="meta">SKU: ${escapeHtml(line.sku)}</span>`
                : ""
            }
          </td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Packing slip ${escapeHtml(order.name)}</title>
    <style>
      @page { size: Letter; margin: 0.45in; }
      * { box-sizing: border-box; }
      body {
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        margin: 0;
      }
      header {
        align-items: flex-start;
        border-bottom: 2px solid #111827;
        display: flex;
        justify-content: space-between;
        padding-bottom: 18px;
      }
      h1 {
        font-size: 28px;
        letter-spacing: 0;
        margin: 0 0 6px;
      }
      h2 {
        font-size: 13px;
        margin: 0 0 8px;
        text-transform: uppercase;
      }
      .order-meta {
        line-height: 1.5;
        text-align: right;
      }
      .grid {
        display: grid;
        gap: 20px;
        grid-template-columns: 1fr 1fr;
        margin: 22px 0;
      }
      .panel {
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        min-height: 120px;
        padding: 14px;
      }
      .address-line {
        line-height: 1.5;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      th {
        border-bottom: 1px solid #111827;
        font-size: 11px;
        padding: 8px;
        text-align: left;
        text-transform: uppercase;
      }
      td {
        border-bottom: 1px solid #e5e7eb;
        padding: 10px 8px;
        vertical-align: top;
      }
      .qty {
        font-size: 18px;
        font-weight: 700;
        text-align: center;
        width: 54px;
      }
      .meta {
        color: #4b5563;
        display: block;
        font-size: 11px;
        margin-top: 4px;
      }
      footer {
        color: #6b7280;
        font-size: 11px;
        margin-top: 22px;
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Packing slip</h1>
        <div>Canadian Off Grid Depot</div>
      </div>
      <div class="order-meta">
        <strong>${escapeHtml(order.name)}</strong><br>
        ${escapeHtml(createdAt)}<br>
        ${escapeHtml(locationName)}
      </div>
    </header>

    <section class="grid">
      <div class="panel">
        <h2>Ship to</h2>
        ${
          shipTo.length
            ? shipTo
                .map((line) => `<div class="address-line">${escapeHtml(line)}</div>`)
                .join("")
            : '<div class="address-line">No shipping address on order.</div>'
        }
      </div>
      <div class="panel">
        <h2>Order notes</h2>
        <div class="address-line">${escapeHtml(order.note || "No notes.")}</div>
      </div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Qty</th>
          <th>Item</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <footer>Generated automatically by COG Order Printer.</footer>
  </body>
</html>`;
}

async function renderPackingSlipPdfBase64({
  order,
  locationName,
  lines,
}: {
  order: OrderPrinterOrder;
  locationName: string;
  lines: PackingSlipLine[];
}) {
  return new Promise<string>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    const shipTo = addressLines(order.shippingAddress);
    const createdAt = new Date(order.createdAt).toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));

    doc.fontSize(24).font("Helvetica-Bold").text("Packing slip", 36, 36);
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Canadian Off Grid Depot", 36, 66);
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(order.name, 360, 36, { align: "right", width: 216 });
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(createdAt, 360, 56, { align: "right", width: 216 })
      .text(locationName, 360, 72, { align: "right", width: 216 });

    doc.moveTo(36, 96).lineTo(576, 96).lineWidth(1.5).stroke("#111827");

    doc.fontSize(10).font("Helvetica-Bold").text("SHIP TO", 36, 118);
    doc.font("Helvetica");
    const addressText = shipTo.length
      ? shipTo.join("\n")
      : "No shipping address on order.";
    doc.text(addressText, 36, 136, { width: 240, lineGap: 3 });

    doc.font("Helvetica-Bold").text("ORDER NOTES", 330, 118);
    doc
      .font("Helvetica")
      .text(order.note || "No notes.", 330, 136, { width: 246, lineGap: 3 });

    let y = 230;
    doc.moveTo(36, y).lineTo(576, y).stroke("#111827");
    y += 12;
    doc.font("Helvetica-Bold").fontSize(10).text("QTY", 36, y);
    doc.text("ITEM", 92, y);
    y += 20;
    doc.moveTo(36, y - 6).lineTo(576, y - 6).stroke("#d1d5db");

    for (const line of lines) {
      if (y > 720) {
        doc.addPage();
        y = 54;
      }

      doc.font("Helvetica-Bold").fontSize(16).text(String(line.quantity), 36, y, {
        width: 36,
        align: "center",
      });
      doc.fontSize(11).text(lineTitle(line), 92, y, { width: 460 });

      if (line.sku) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#4b5563")
          .text(`SKU: ${line.sku}`, 92, y + 16, { width: 460 })
          .fillColor("#111827");
      }

      y += line.sku ? 42 : 30;
      doc.moveTo(36, y - 8).lineTo(576, y - 8).stroke("#e5e7eb");
    }

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6b7280")
      .text("Generated automatically by COG Order Printer.", 36, 742);
    doc.end();
  });
}

function fulfillmentLineToPackingLine(line: FulfillmentOrderLineItem) {
  const orderLine = line.lineItem;
  const quantity =
    line.remainingQuantity ?? line.totalQuantity ?? orderLine?.quantity ?? 0;

  return {
    title:
      orderLine?.product?.title ||
      orderLine?.title ||
      orderLine?.name ||
      "Untitled item",
    variantTitle: orderLine?.variantTitle ?? null,
    sku: orderLine?.sku || orderLine?.variant?.sku || null,
    quantity,
  };
}

function orderLineToPackingLine(
  line: OrderPrinterOrder["lineItems"]["nodes"][number],
) {
  return {
    title: line.product?.title || line.title || line.name || "Untitled item",
    variantTitle: line.variantTitle ?? null,
    sku: line.sku || line.variant?.sku || null,
    quantity: line.quantity ?? 0,
  };
}

export async function createPrintJobForOrder(
  admin: AdminGraphqlClient,
  shop: string,
  orderId: string,
) {
  const rule = await prisma.printerRule.findFirst({
    where: { shop, enabled: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!rule) {
    return { created: false, reason: "No enabled printer rule." };
  }

  if (!rule.printerExternalId) {
    return {
      created: false,
      reason: "The printer rule is missing its PrintNode printer id.",
    };
  }

  const data = await graphqlJson<{ order: OrderPrinterOrder | null }>(
    admin,
    ORDER_QUERY,
    { id: orderId },
  );

  if (!data.order) {
    throw new Error(`Shopify order ${orderId} was not found.`);
  }

  const matchingFulfillmentOrders = data.order.fulfillmentOrders.nodes.filter(
    (fulfillmentOrder) =>
      fulfillmentOrder.assignedLocation?.location?.id === rule.locationId,
  );

  if (!matchingFulfillmentOrders.length) {
    return {
      created: false,
      reason: `Order ${data.order.name} is not assigned to ${rule.locationName}.`,
    };
  }

  const lines = matchingFulfillmentOrders.flatMap((fulfillmentOrder) =>
    fulfillmentOrder.lineItems.nodes.map(fulfillmentLineToPackingLine),
  );
  const printableLines = lines.length
    ? lines
    : data.order.lineItems.nodes.map(orderLineToPackingLine);
  const html = renderPackingSlipHtml({
    order: data.order,
    locationName: rule.locationName,
    lines: printableLines.filter((line) => line.quantity > 0),
  });
  const pdfBase64 = await renderPackingSlipPdfBase64({
    order: data.order,
    locationName: rule.locationName,
    lines: printableLines.filter((line) => line.quantity > 0),
  });

  try {
    const job = await prisma.printJob.create({
      data: {
        shop,
        orderId: data.order.id,
        orderName: data.order.name,
        orderCreatedAt: new Date(data.order.createdAt),
        locationId: rule.locationId,
        locationName: rule.locationName,
        printerName: rule.printerName,
        printerProvider: rule.printerProvider,
        printerExternalId: rule.printerExternalId,
        html,
        pdfBase64,
        events: {
          create: {
            shop,
            status: "QUEUED",
            message: `Preparing provider submission for ${rule.printerName}.`,
          },
        },
      },
    });

    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: "PRINTING",
        attempts: { increment: 1 },
        claimedAt: new Date(),
        events: {
          create: {
            shop,
            status: "PRINTING",
            message: "Submitting directly to PrintNode.",
          },
        },
      },
    });

    try {
      const providerJobId = await submitPdfToPrintNode({
        printerExternalId: rule.printerExternalId,
        title: `Packing slip ${data.order.name}`,
        pdfBase64,
        key: idempotencyKey([shop, data.order.id, rule.locationId]),
      });

      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: "SUBMITTED",
          providerJobId,
          lastError: null,
          events: {
            create: {
              shop,
              status: "SUBMITTED",
              message: providerJobId
                ? `PrintNode accepted job ${providerJobId}.`
                : "PrintNode accepted job.",
            },
          },
        },
      });

      return {
        created: true,
        jobId: job.id,
        reason: "Submitted to PrintNode.",
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Print provider submission failed.";

      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lastError: message,
          events: {
            create: {
              shop,
              status: "FAILED",
              message,
            },
          },
        },
      });

      return { created: true, jobId: job.id, reason: message };
    }
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;

    if (prismaError.code === "P2002") {
      return {
        created: false,
        reason: `Order ${data.order.name} was already queued for ${rule.locationName}.`,
      };
    }

    throw error;
  }
}
