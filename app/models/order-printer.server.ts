import crypto from "node:crypto";
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
  name: string;
  isDefault: boolean;
  agentName: string | null;
  lastSeenAt: string;
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
  enabled: boolean;
} | null;

export type DashboardData = {
  shop: string;
  agentToken: string;
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

type AgentPrinterInput = {
  name: string;
  isDefault?: boolean;
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

function newAgentToken() {
  return crypto.randomBytes(32).toString("base64url");
}

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

export async function ensureAppSettings(shop: string) {
  const existing = await prisma.appSettings.findUnique({ where: { shop } });

  if (existing) {
    return existing;
  }

  return prisma.appSettings.create({
    data: {
      shop,
      agentToken: newAgentToken(),
    },
  });
}

export async function rotateAgentToken(shop: string) {
  await ensureAppSettings(shop);

  return prisma.appSettings.update({
    where: { shop },
    data: { agentToken: newAgentToken() },
  });
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
  const [settings, locations, rule, printers, jobs] = await Promise.all([
    ensureAppSettings(shop),
    fetchLocations(admin),
    prisma.printerRule.findFirst({
      where: { shop },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.registeredPrinter.findMany({
      where: { shop, active: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.printJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    shop,
    agentToken: settings.agentToken,
    locations,
    printers: printers.map((printer) => ({
      name: printer.name,
      isDefault: printer.isDefault,
      agentName: printer.agentName,
      lastSeenAt: printer.lastSeenAt.toISOString(),
    })),
    rule: rule
      ? {
          id: rule.id,
          locationId: rule.locationId,
          locationName: rule.locationName,
          printerName: rule.printerName,
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
  const printerName = normalizePrinterName(formData.get("printerName"));
  const enabled = formData.get("enabled") === "on";

  if (!locationId) {
    throw new Error("Choose a fulfillment location.");
  }

  if (!printerName) {
    throw new Error("Choose a printer.");
  }

  const [locations, printer] = await Promise.all([
    fetchLocations(admin),
    prisma.registeredPrinter.findUnique({
      where: { shop_name: { shop, name: printerName } },
    }),
  ]);

  const location = locations.find((option) => option.id === locationId);

  if (!location) {
    throw new Error("That fulfillment location is not available.");
  }

  if (!printer || !printer.active) {
    throw new Error("That printer has not been registered by the print agent.");
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
        printerName,
        enabled,
      },
      create: {
        shop,
        locationId,
        locationName: location.name,
        printerName,
        enabled,
      },
    }),
  ]);
}

export async function retryPrintJob(shop: string, jobId: string) {
  const job = await prisma.printJob.update({
    where: { id: jobId, shop },
    data: {
      status: "QUEUED",
      lastError: null,
      claimedAt: null,
      printedAt: null,
      events: {
        create: {
          shop,
          status: "QUEUED",
          message: "Manually queued for retry.",
        },
      },
    },
  });

  return job;
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
        html,
        events: {
          create: {
            shop,
            status: "QUEUED",
            message: `Queued for ${rule.printerName}.`,
          },
        },
      },
    });

    return { created: true, jobId: job.id, reason: "Queued." };
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

export async function authenticateAgentToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || new URL(request.url).searchParams.get("token") || "";

  if (!token) {
    return null;
  }

  return prisma.appSettings.findUnique({
    where: { agentToken: token },
  });
}

export async function registerAgentPrinters({
  shop,
  agentName,
  printers,
}: {
  shop: string;
  agentName: string;
  printers: AgentPrinterInput[];
}) {
  const now = new Date();
  const normalized = printers
    .map((printer) => ({
      name: normalizePrinterName(printer.name),
      isDefault: Boolean(printer.isDefault),
    }))
    .filter((printer) => printer.name);

  await prisma.registeredPrinter.updateMany({
    where: { shop },
    data: { active: false },
  });

  await prisma.$transaction(
    normalized.map((printer) =>
      prisma.registeredPrinter.upsert({
        where: { shop_name: { shop, name: printer.name } },
        update: {
          active: true,
          isDefault: printer.isDefault,
          agentName,
          lastSeenAt: now,
        },
        create: {
          shop,
          name: printer.name,
          isDefault: printer.isDefault,
          agentName,
          lastSeenAt: now,
        },
      }),
    ),
  );

  return normalized.length;
}

export async function claimPrintJobs(shop: string, agentName: string) {
  const staleClaimedAt = new Date(Date.now() - 10 * 60 * 1000);

  await prisma.printJob.updateMany({
    where: {
      shop,
      status: "PRINTING",
      claimedAt: { lt: staleClaimedAt },
    },
    data: {
      status: "QUEUED",
      lastError: "The print agent did not report completion in time.",
      claimedAt: null,
    },
  });

  const activePrinters = await prisma.registeredPrinter.findMany({
    where: { shop, active: true },
    select: { name: true },
  });
  const printerNames = activePrinters.map((printer) => printer.name);

  if (!printerNames.length) {
    return [];
  }

  const queued = await prisma.printJob.findMany({
    where: {
      shop,
      status: "QUEUED",
      printerName: { in: printerNames },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  const claimed = [];

  for (const job of queued) {
    const updated = await prisma.printJob.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: {
        status: "PRINTING",
        attempts: { increment: 1 },
        claimedAt: new Date(),
        lastError: null,
      },
    });

    if (updated.count === 1) {
      await prisma.printEvent.create({
        data: {
          shop,
          jobId: job.id,
          status: "PRINTING",
          message: `Claimed by ${agentName}.`,
        },
      });

      claimed.push({
        id: job.id,
        orderName: job.orderName,
        printerName: job.printerName,
        html: job.html,
      });
    }
  }

  return claimed;
}

export async function completePrintJob({
  shop,
  jobId,
  printed,
  message,
}: {
  shop: string;
  jobId: string;
  printed: boolean;
  message: string | null;
}) {
  const status = printed ? "PRINTED" : "FAILED";

  return prisma.printJob.update({
    where: { id: jobId, shop },
    data: {
      status,
      printedAt: printed ? new Date() : null,
      lastError: printed ? null : message || "Print failed.",
      events: {
        create: {
          shop,
          status,
          message,
        },
      },
    },
  });
}
