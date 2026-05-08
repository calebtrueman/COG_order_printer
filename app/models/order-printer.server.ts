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
  template: DashboardTemplate;
  reprintOrders: ReprintOrder[];
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

type ImageValue = {
  url: string | null;
  altText: string | null;
} | null;

type TrackingInfo = {
  company: string | null;
  number: string | null;
  url: string | null;
};

type ShippingLine = {
  title: string | null;
  code: string | null;
};

type PackingSlipLine = {
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  imageUrl: string | null;
  imageAlt: string | null;
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
    image: ImageValue;
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
  poNumber: string | null;
  displayFulfillmentStatus: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  shippingLines: {
    nodes: ShippingLine[];
  };
  fulfillments: {
    createdAt: string | null;
    trackingInfo: TrackingInfo[];
  }[];
  lineItems: {
    nodes: {
      title: string | null;
      name: string | null;
      sku: string | null;
      variantTitle: string | null;
      quantity: number | null;
      image: ImageValue;
    }[];
  };
  fulfillmentOrders: {
    nodes: FulfillmentOrderNode[];
  };
};

type OrderListNode = {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string | null;
  shippingAddress: Address | null;
  fulfillmentOrders: {
    nodes: FulfillmentOrderNode[];
  };
};

export type ReprintOrder = {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  shipTo: string;
  fulfillmentOrderCount: number;
};

export type TemplateBlockType = "field" | "text" | "image" | "items";
export type ItemColumnKey = "quantity" | "image" | "title" | "variant" | "sku";

export type ItemColumn = {
  key: ItemColumnKey;
  label: string;
  enabled: boolean;
  width?: number;
};
type NormalizedItemColumn = ItemColumn & { width: number };

export type TemplateBlock = {
  id: string;
  type: TemplateBlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  field?: string;
  text?: string;
  imageUrl?: string;
  label?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  align?: "left" | "center" | "right";
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  lineHeight?: number;
  color?: string;
  background?: string;
  border?: boolean;
  padding?: number;
  showImages?: boolean;
  showSku?: boolean;
  itemColumns?: ItemColumn[];
};

export type TemplatePage = {
  size?: string;
  width: number;
  height: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
};

export type TemplateDesign = {
  version: 1;
  page: TemplatePage;
  blocks: TemplateBlock[];
};

type DashboardTemplate = {
  name: string;
  design: TemplateDesign;
};

type OrderPrinterFulfillmentOrder = {
  id: string;
  status: string;
  assignedLocation: {
    name: string | null;
    location: { id: string; name: string } | null;
  } | null;
  order: {
    id: string;
    name: string;
  };
};

type AgentPrinterInput = {
  name: string;
  isDefault?: boolean;
};

const LOCAL_AGENT_PROVIDER = "local-agent";
const TEMPLATE_PAGE: TemplatePage = {
  size: "letter",
  width: 816,
  height: 1056,
  marginTop: 36,
  marginRight: 36,
  marginBottom: 36,
  marginLeft: 36,
};
const TEMPLATE_STORAGE_PREFIX = "packing-template:";
const TEMPLATE_FONT_FAMILIES = new Set([
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Georgia, serif",
  "'Times New Roman', Times, serif",
  "'Courier New', Courier, monospace",
  "Verdana, Geneva, sans-serif",
  "Tahoma, Geneva, sans-serif",
]);
const DEFAULT_ITEM_COLUMNS: NormalizedItemColumn[] = [
  { key: "quantity", label: "Qty", enabled: true, width: 54 },
  { key: "image", label: "Image", enabled: true, width: 72 },
  { key: "title", label: "Product", enabled: true, width: 260 },
  { key: "variant", label: "Variant", enabled: false, width: 140 },
  { key: "sku", label: "SKU", enabled: true, width: 120 },
];

const DEFAULT_TEMPLATE_DESIGN: TemplateDesign = {
  version: 1,
  page: TEMPLATE_PAGE,
  blocks: [
    {
      id: "title",
      type: "text",
      x: 36,
      y: 34,
      w: 310,
      h: 42,
      text: "Packing slip",
      fontSize: 30,
      fontWeight: "700",
      align: "left",
    },
    {
      id: "order-name",
      type: "field",
      x: 540,
      y: 36,
      w: 238,
      h: 28,
      field: "order.name",
      label: "Order #",
      fontSize: 18,
      fontWeight: "700",
      align: "right",
    },
    {
      id: "order-date",
      type: "field",
      x: 540,
      y: 70,
      w: 238,
      h: 22,
      field: "order.createdAt",
      label: "Order date",
      fontSize: 12,
      align: "right",
    },
    {
      id: "ship-to",
      type: "field",
      x: 36,
      y: 126,
      w: 320,
      h: 150,
      field: "shipping.address",
      label: "Ship to",
      fontSize: 12,
      align: "left",
    },
    {
      id: "bill-to",
      type: "field",
      x: 394,
      y: 126,
      w: 320,
      h: 150,
      field: "billing.address",
      label: "Bill to",
      fontSize: 12,
      align: "left",
    },
    {
      id: "ship-via",
      type: "field",
      x: 36,
      y: 298,
      w: 220,
      h: 42,
      field: "shipping.method",
      label: "Ship via",
      fontSize: 12,
      align: "left",
    },
    {
      id: "po-number",
      type: "field",
      x: 286,
      y: 298,
      w: 200,
      h: 42,
      field: "order.poNumber",
      label: "PO #",
      fontSize: 12,
      align: "left",
    },
    {
      id: "tracking-number",
      type: "field",
      x: 516,
      y: 298,
      w: 220,
      h: 42,
      field: "fulfillment.trackingNumber",
      label: "Tracking #",
      fontSize: 12,
      align: "left",
    },
    {
      id: "items",
      type: "items",
      x: 36,
      y: 372,
      w: 744,
      h: 520,
      fontSize: 12,
      align: "left",
    },
    {
      id: "footer",
      type: "text",
      x: 36,
      y: 948,
      w: 744,
      h: 34,
      text: "Generated automatically by COG Order Printer.",
      fontSize: 11,
      align: "left",
    },
  ],
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
      poNumber
      displayFulfillmentStatus
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
      billingAddress {
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
      shippingLines(first: 5) {
        nodes {
          title
          code
        }
      }
      fulfillments(first: 10) {
        createdAt
        trackingInfo(first: 10) {
          company
          number
          url
        }
      }
      lineItems(first: 100) {
        nodes {
          title
          name
          sku
          variantTitle
          quantity
          image {
            url
            altText
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
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
`;

const ORDER_LIST_QUERY = `#graphql
  query OrderPrinterOrderList($first: Int!, $query: String, $reverse: Boolean!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: $reverse, query: $query) {
      nodes {
        id
        name
        createdAt
        displayFulfillmentStatus
        shippingAddress {
          name
          company
          city
          provinceCode
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
                  image {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const FULFILLMENT_ORDER_ORDER_QUERY = `#graphql
  query OrderPrinterFulfillmentOrder($id: ID!) {
    fulfillmentOrder(id: $id) {
      id
      status
      assignedLocation {
        name
        location {
          id
          name
        }
      }
      order {
        id
        name
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizedAlign(value: unknown): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function normalizedColor(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const color = value.trim();

  if (color === "transparent" || /^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  return fallback;
}

function normalizedFontFamily(value: unknown) {
  return typeof value === "string" && TEMPLATE_FONT_FAMILIES.has(value)
    ? value
    : "Arial, Helvetica, sans-serif";
}

function normalizedLineHeight(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 1.4;
  }

  if (parsed > 10) {
    return Math.min(2.4, Math.max(0.8, Math.round(parsed) / 100));
  }

  return Math.min(2.4, Math.max(0.8, Math.round(parsed * 100) / 100));
}

function normalizedTemplatePage(value: unknown): TemplatePage {
  if (!isRecord(value)) {
    return TEMPLATE_PAGE;
  }

  return {
    size: typeof value.size === "string" ? value.size.slice(0, 40) : "custom",
    width: boundedNumber(value.width, TEMPLATE_PAGE.width, 288, 1344),
    height: boundedNumber(value.height, TEMPLATE_PAGE.height, 288, 1728),
    marginTop: boundedNumber(
      value.marginTop,
      TEMPLATE_PAGE.marginTop || 0,
      0,
      192,
    ),
    marginRight: boundedNumber(
      value.marginRight,
      TEMPLATE_PAGE.marginRight || 0,
      0,
      192,
    ),
    marginBottom: boundedNumber(
      value.marginBottom,
      TEMPLATE_PAGE.marginBottom || 0,
      0,
      192,
    ),
    marginLeft: boundedNumber(
      value.marginLeft,
      TEMPLATE_PAGE.marginLeft || 0,
      0,
      192,
    ),
  };
}

function normalizedItemColumns(value: unknown): NormalizedItemColumn[] {
  const known = new Set(DEFAULT_ITEM_COLUMNS.map((column) => column.key));
  const incoming = Array.isArray(value) ? value : [];
  const normalized = incoming
    .filter(isRecord)
    .map((column) => {
      const key = column.key;

      if (typeof key !== "string" || !known.has(key as ItemColumnKey)) {
        return null;
      }

      const fallback = DEFAULT_ITEM_COLUMNS.find((item) => item.key === key);

      return {
        key: key as ItemColumnKey,
        label:
          typeof column.label === "string" && column.label.trim()
            ? column.label.trim().slice(0, 40)
            : fallback?.label || key,
        enabled: column.enabled !== false,
        width: boundedNumber(column.width, fallback?.width || 120, 32, 420),
      };
    })
    .filter((column): column is NormalizedItemColumn => Boolean(column));
  const seen = new Set(normalized.map((column) => column.key));

  for (const column of DEFAULT_ITEM_COLUMNS) {
    if (!seen.has(column.key)) {
      normalized.push({ ...column });
    }
  }

  return normalized;
}

function normalizedTemplateBlock(
  value: unknown,
  page: TemplatePage,
): TemplateBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = value.type;
  if (
    type !== "field" &&
    type !== "text" &&
    type !== "image" &&
    type !== "items"
  ) {
    return null;
  }

  const id =
    typeof value.id === "string" && value.id.trim()
      ? value.id.trim().slice(0, 80)
      : crypto.randomUUID();

  return {
    id,
    type,
    x: boundedNumber(value.x, 36, 0, page.width),
    y: boundedNumber(value.y, 36, 0, page.height),
    w: boundedNumber(value.w, 180, 24, page.width),
    h: boundedNumber(value.h, 48, 18, page.height),
    field:
      typeof value.field === "string" ? value.field.trim().slice(0, 120) : "",
    text: typeof value.text === "string" ? value.text.slice(0, 2000) : "",
    imageUrl:
      typeof value.imageUrl === "string"
        ? value.imageUrl.trim().slice(0, 2000)
        : "",
    label:
      typeof value.label === "string" ? value.label.trim().slice(0, 120) : "",
    fontSize: boundedNumber(value.fontSize, 12, 8, 72),
    fontFamily: normalizedFontFamily(value.fontFamily),
    fontWeight: value.fontWeight === "700" ? "700" : "400",
    align: normalizedAlign(value.align),
    italic: value.italic === true,
    underline: value.underline === true,
    uppercase: value.uppercase === true,
    lineHeight: normalizedLineHeight(value.lineHeight),
    color: normalizedColor(value.color, "#111827"),
    background: normalizedColor(value.background, "transparent"),
    border: value.border === true,
    padding: boundedNumber(value.padding, 0, 0, 48),
    showImages: value.showImages !== false,
    showSku: value.showSku !== false,
    itemColumns: normalizedItemColumns(value.itemColumns),
  };
}

function normalizeTemplateDesign(value: unknown): TemplateDesign {
  if (!isRecord(value)) {
    return DEFAULT_TEMPLATE_DESIGN;
  }

  const page = normalizedTemplatePage(value.page);
  const blocks = Array.isArray(value.blocks)
    ? value.blocks
        .map((block) => normalizedTemplateBlock(block, page))
        .filter((block): block is TemplateBlock => Boolean(block))
        .slice(0, 80)
    : [];

  if (!blocks.length) {
    return DEFAULT_TEMPLATE_DESIGN;
  }

  return {
    version: 1,
    page,
    blocks,
  };
}

function parseTemplateDesignJson(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_TEMPLATE_DESIGN;
  }

  try {
    return normalizeTemplateDesign(JSON.parse(value));
  } catch {
    throw new Error("Template design JSON is invalid.");
  }
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

function templateFromRule(rule: { printerExternalId: string | null } | null) {
  const raw = rule?.printerExternalId || "";

  if (!raw.startsWith(TEMPLATE_STORAGE_PREFIX)) {
    return {
      name: "Default packing slip",
      design: DEFAULT_TEMPLATE_DESIGN,
    };
  }

  try {
    const parsed = JSON.parse(raw.slice(TEMPLATE_STORAGE_PREFIX.length));

    return {
      name:
        isRecord(parsed) &&
        typeof parsed.name === "string" &&
        parsed.name.trim()
          ? parsed.name.trim().slice(0, 120)
          : "Default packing slip",
      design: normalizeTemplateDesign(
        isRecord(parsed) ? parsed.design : DEFAULT_TEMPLATE_DESIGN,
      ),
    };
  } catch {
    return {
      name: "Default packing slip",
      design: DEFAULT_TEMPLATE_DESIGN,
    };
  }
}

export async function savePrintTemplate(shop: string, formData: FormData) {
  const name = String(formData.get("templateName") || "Default packing slip")
    .trim()
    .slice(0, 120);
  const design = parseTemplateDesignJson(formData.get("templateDesign"));
  const rule = await prisma.printerRule.findFirst({
    where: { shop, printerProvider: LOCAL_AGENT_PROVIDER },
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
  });

  if (!rule) {
    throw new Error(
      "Save the fulfillment location and printer before saving a template.",
    );
  }

  await prisma.printerRule.update({
    where: { id: rule.id },
    data: {
      printerExternalId:
        TEMPLATE_STORAGE_PREFIX +
        JSON.stringify({
          name: name || "Default packing slip",
          design,
        }),
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
  options: { includeReprintOrders?: boolean } = {},
): Promise<DashboardData> {
  const [settings, locations, rule, printers, jobs, reprintOrders] =
    await Promise.all([
      ensureAppSettings(shop),
      fetchLocations(admin),
      prisma.printerRule.findFirst({
        where: { shop, printerProvider: LOCAL_AGENT_PROVIDER },
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
      options.includeReprintOrders
        ? listReprintableOrders(admin, shop)
        : Promise.resolve([]),
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
    template: templateFromRule(rule),
    reprintOrders,
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

  const [locations, printer, existingRule] = await Promise.all([
    fetchLocations(admin),
    prisma.registeredPrinter.findUnique({
      where: { shop_name: { shop, name: printerName } },
    }),
    prisma.printerRule.findFirst({
      where: { shop, printerProvider: LOCAL_AGENT_PROVIDER },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const location = locations.find((option) => option.id === locationId);

  if (!location) {
    throw new Error("That fulfillment location is not available.");
  }

  if (!printer || !printer.active) {
    throw new Error("That printer has not been registered by the print agent.");
  }

  const templateStorage = existingRule?.printerExternalId?.startsWith(
    TEMPLATE_STORAGE_PREFIX,
  )
    ? existingRule.printerExternalId
    : null;

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
        printerProvider: LOCAL_AGENT_PROVIDER,
        enabled,
      },
      create: {
        shop,
        locationId,
        locationName: location.name,
        printerName,
        printerProvider: LOCAL_AGENT_PROVIDER,
        printerExternalId: templateStorage,
        enabled,
      },
    }),
  ]);
}

function isOpenFulfillmentOrder(fulfillmentOrder: FulfillmentOrderNode) {
  const status = fulfillmentOrder.status.toUpperCase();

  return status !== "CLOSED" && status !== "CANCELLED";
}

function fulfillmentOrderHasRemainingItems(
  fulfillmentOrder: FulfillmentOrderNode,
) {
  return fulfillmentOrder.lineItems.nodes.some((line) => {
    const quantity =
      line.remainingQuantity ??
      line.totalQuantity ??
      line.lineItem?.quantity ??
      0;

    return quantity > 0;
  });
}

function matchingOpenFulfillmentOrders(
  order: Pick<OrderPrinterOrder | OrderListNode, "fulfillmentOrders">,
  locationId: string,
) {
  return order.fulfillmentOrders.nodes.filter(
    (fulfillmentOrder) =>
      fulfillmentOrder.assignedLocation?.location?.id === locationId &&
      isOpenFulfillmentOrder(fulfillmentOrder) &&
      fulfillmentOrderHasRemainingItems(fulfillmentOrder),
  );
}

function reprintOrderSummary(
  order: OrderListNode,
  matchingOrders: FulfillmentOrderNode[],
): ReprintOrder {
  const shipTo = [
    order.shippingAddress?.name || order.shippingAddress?.company,
    [order.shippingAddress?.city, order.shippingAddress?.provinceCode]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" - ");

  return {
    id: order.id,
    name: order.name,
    createdAt: order.createdAt,
    status: order.displayFulfillmentStatus || "UNFULFILLED",
    shipTo: shipTo || "No shipping address",
    fulfillmentOrderCount: matchingOrders.length,
  };
}

async function getEnabledRule(shop: string) {
  return prisma.printerRule.findFirst({
    where: { shop, enabled: true, printerProvider: LOCAL_AGENT_PROVIDER },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listReprintableOrders(
  admin: AdminGraphqlClient,
  shop: string,
  limit = 100,
) {
  const rule = await getEnabledRule(shop);

  if (!rule) {
    return [];
  }

  const data = await graphqlJson<{ orders: { nodes: OrderListNode[] } }>(
    admin,
    ORDER_LIST_QUERY,
    { first: limit, query: "status:open", reverse: true },
  );

  return data.orders.nodes
    .map((order) => ({
      order,
      matchingOrders: matchingOpenFulfillmentOrders(order, rule.locationId),
    }))
    .filter(({ matchingOrders }) => matchingOrders.length)
    .map(({ order, matchingOrders }) =>
      reprintOrderSummary(order, matchingOrders),
    );
}

export async function syncMissedAutoPrints(
  admin: AdminGraphqlClient,
  shop: string,
  limit = 100,
) {
  const rule = await getEnabledRule(shop);

  if (!rule) {
    return {
      checked: 0,
      queued: 0,
      skipped: 0,
      reason: "No enabled local-agent printer rule.",
      results: [],
    };
  }

  const latestAutoPrint = await prisma.printJob.findFirst({
    where: {
      shop,
      locationId: rule.locationId,
      orderCreatedAt: { not: null },
    },
    orderBy: { orderCreatedAt: "desc" },
  });

  if (!latestAutoPrint?.orderCreatedAt) {
    return {
      checked: 0,
      queued: 0,
      skipped: 0,
      reason: "No previous automatic print cursor exists yet.",
      results: [],
    };
  }

  const query = `status:open created_at:>${latestAutoPrint.orderCreatedAt.toISOString()}`;
  const data = await graphqlJson<{ orders: { nodes: OrderListNode[] } }>(
    admin,
    ORDER_LIST_QUERY,
    { first: limit, query, reverse: false },
  );
  const candidates = data.orders.nodes.filter(
    (order) => matchingOpenFulfillmentOrders(order, rule.locationId).length,
  );
  const results = [];

  for (const order of candidates) {
    const result = await createPrintJobForOrder(admin, shop, order.id);

    results.push({
      orderName: order.name,
      ...result,
    });
  }

  return {
    checked: candidates.length,
    queued: results.filter((result) => result.created).length,
    skipped: results.filter((result) => !result.created).length,
    reason: "Checked Shopify for missed open fulfillment orders.",
    results,
  };
}

export async function retryPrintJob(shop: string, jobId: string) {
  const job = await prisma.printJob.update({
    where: { id: jobId, shop },
    data: {
      status: "QUEUED",
      printerProvider: LOCAL_AGENT_PROVIDER,
      providerJobId: null,
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

export async function createPrintJobForFulfillmentOrder(
  admin: AdminGraphqlClient,
  shop: string,
  fulfillmentOrderId: string,
) {
  const data = await graphqlJson<{
    fulfillmentOrder: OrderPrinterFulfillmentOrder | null;
  }>(admin, FULFILLMENT_ORDER_ORDER_QUERY, { id: fulfillmentOrderId });

  if (!data.fulfillmentOrder) {
    return {
      created: false,
      reason: `Fulfillment order ${fulfillmentOrderId} was not found.`,
    };
  }

  return createPrintJobForOrder(admin, shop, data.fulfillmentOrder.order.id);
}

export function orderGidFromWebhookPayload(payload: unknown) {
  const orderPayload = payload as {
    admin_graphql_api_id?: unknown;
    id?: unknown;
  };

  if (typeof orderPayload.admin_graphql_api_id === "string") {
    return orderPayload.admin_graphql_api_id;
  }

  if (
    typeof orderPayload.id === "number" ||
    typeof orderPayload.id === "string"
  ) {
    return `gid://shopify/Order/${orderPayload.id}`;
  }

  throw new Error("The orders/create webhook did not include an order id.");
}

export function fulfillmentOrderGidFromWebhookPayload(payload: unknown) {
  const body = payload as {
    fulfillment_order?: { id?: unknown };
    moved_fulfillment_order?: { id?: unknown };
    remaining_fulfillment_order?: { id?: unknown };
    replacement_fulfillment_order?: { id?: unknown };
  };
  const id =
    body.fulfillment_order?.id ||
    body.moved_fulfillment_order?.id ||
    body.remaining_fulfillment_order?.id ||
    body.replacement_fulfillment_order?.id;

  if (typeof id === "string") {
    return id;
  }

  if (typeof id === "number") {
    return `gid://shopify/FulfillmentOrder/${id}`;
  }

  throw new Error(
    "The fulfillment order webhook did not include a fulfillment order id.",
  );
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

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shippingMethod(order: OrderPrinterOrder) {
  const line = order.shippingLines.nodes.find(
    (shippingLine) => shippingLine.title,
  );

  return line?.title || "";
}

function latestTrackingInfo(order: OrderPrinterOrder) {
  for (const fulfillment of order.fulfillments) {
    const tracking = fulfillment.trackingInfo.find(
      (info) => info.number || info.company || info.url,
    );

    if (tracking) {
      return tracking;
    }
  }

  return null;
}

function shipDate(order: OrderPrinterOrder) {
  const fulfillment = order.fulfillments.find((item) => item.createdAt);

  return formatDateTime(fulfillment?.createdAt);
}

function templateFieldValue({
  order,
  locationName,
  lines,
  field,
}: {
  order: OrderPrinterOrder;
  locationName: string;
  lines: PackingSlipLine[];
  field: string | undefined;
}) {
  const tracking = latestTrackingInfo(order);
  const firstLineImage = lines.find((line) => line.imageUrl)?.imageUrl || "";

  switch (field) {
    case "order.name":
      return order.name;
    case "order.poNumber":
      return order.poNumber || "";
    case "order.createdAt":
      return formatDateTime(order.createdAt);
    case "order.email":
      return order.email || "";
    case "order.phone":
      return order.phone || "";
    case "order.note":
      return order.note || "";
    case "order.fulfillmentStatus":
      return order.displayFulfillmentStatus || "";
    case "location.name":
      return locationName;
    case "shipping.address":
      return addressLines(order.shippingAddress).join("\n");
    case "billing.address":
      return addressLines(order.billingAddress).join("\n");
    case "shipping.method":
      return shippingMethod(order);
    case "shipping.shipDate":
      return shipDate(order);
    case "fulfillment.trackingNumber":
      return tracking?.number || "";
    case "fulfillment.trackingCompany":
      return tracking?.company || "";
    case "fulfillment.trackingUrl":
      return tracking?.url || "";
    case "items.count":
      return String(lines.reduce((total, line) => total + line.quantity, 0));
    case "items.firstImage":
      return firstLineImage;
    default:
      return "";
  }
}

function replaceTemplateTokens(
  text: string | undefined,
  context: {
    order: OrderPrinterOrder;
    locationName: string;
    lines: PackingSlipLine[];
  },
) {
  return String(text || "").replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (_match, field) => templateFieldValue({ ...context, field }),
  );
}

function renderTemplateTextValue(value: string) {
  return escapeHtml(value);
}

function blockStyle(block: TemplateBlock) {
  return [
    `left:${block.x}px`,
    `top:${block.y}px`,
    `width:${block.w}px`,
    `height:${block.h}px`,
    `font-family:${normalizedFontFamily(block.fontFamily)}`,
    `font-size:${block.fontSize || 12}px`,
    `font-weight:${block.fontWeight === "700" ? "700" : "400"}`,
    `font-style:${block.italic ? "italic" : "normal"}`,
    `text-decoration:${block.underline ? "underline" : "none"}`,
    `text-transform:${block.uppercase ? "uppercase" : "none"}`,
    `line-height:${normalizedLineHeight(block.lineHeight)}`,
    `text-align:${block.align || "left"}`,
    `color:${normalizedColor(block.color, "#111827")}`,
    `background:${normalizedColor(block.background, "transparent")}`,
    `border:${block.border ? "1px solid #d1d5db" : "0"}`,
    `padding:${boundedNumber(block.padding, 0, 0, 48)}px`,
  ].join(";");
}

function renderItemsBlock(block: TemplateBlock, lines: PackingSlipLine[]) {
  const columns = normalizedItemColumns(block.itemColumns).filter(
    (column) =>
      column.enabled &&
      (column.key !== "image" || block.showImages !== false) &&
      (column.key !== "sku" || block.showSku !== false),
  );
  const rows = lines
    .map(
      (line) => `
        <tr>
          ${columns.map((column) => renderItemCell(column, line)).join("")}
        </tr>
      `,
    )
    .join("");

  return `
    <div class="template-block items-block" style="${blockStyle(block)}">
      <table>
        <thead>
          <tr>
            ${columns
              .map(
                (column) =>
                  `<th style="${column.width ? `width:${column.width}px` : ""}">${escapeHtml(column.label)}</th>`,
              )
              .join("")}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderItemCell(column: ItemColumn, line: PackingSlipLine) {
  if (column.key === "quantity") {
    return `<td class="qty">${escapeHtml(line.quantity)}</td>`;
  }

  if (column.key === "image") {
    return `<td class="item-image-cell">${
      line.imageUrl
        ? `<img src="${escapeHtml(line.imageUrl)}" alt="${escapeHtml(line.imageAlt || lineTitle(line))}">`
        : ""
    }</td>`;
  }

  if (column.key === "title") {
    return `<td><strong>${escapeHtml(line.title)}</strong></td>`;
  }

  if (column.key === "variant") {
    return `<td>${escapeHtml(
      line.variantTitle && line.variantTitle !== "Default Title"
        ? line.variantTitle
        : "",
    )}</td>`;
  }

  return `<td>${escapeHtml(line.sku || "")}</td>`;
}

function safeImageUrl(value: string | undefined) {
  const url = String(value || "").trim();

  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) {
    return url;
  }

  return "";
}

function renderTemplateBlock(
  block: TemplateBlock,
  context: {
    order: OrderPrinterOrder;
    locationName: string;
    lines: PackingSlipLine[];
  },
) {
  if (block.type === "items") {
    return renderItemsBlock(block, context.lines);
  }

  if (block.type === "image") {
    const dataImage = templateFieldValue({ ...context, field: block.field });
    const imageUrl = safeImageUrl(dataImage) || safeImageUrl(block.imageUrl);

    return `
      <div class="template-block image-block" style="${blockStyle(block)}">
        ${
          imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(block.label || "Template image")}">`
            : ""
        }
      </div>
    `;
  }

  const rawValue =
    block.type === "field"
      ? templateFieldValue({ ...context, field: block.field })
      : replaceTemplateTokens(block.text, context);
  const value = renderTemplateTextValue(rawValue);

  return `
    <div class="template-block text-block" style="${blockStyle(block)}">
      <div class="block-value">${value}</div>
    </div>
  `;
}

function renderPackingSlipHtml({
  order,
  locationName,
  lines,
  template,
}: {
  order: OrderPrinterOrder;
  locationName: string;
  lines: PackingSlipLine[];
  template: TemplateDesign;
}) {
  const design = normalizeTemplateDesign(template);
  const page = normalizedTemplatePage(design.page);
  const context = { order, locationName, lines };
  const blocks = design.blocks
    .map((block) => renderTemplateBlock(block, context))
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Packing slip ${escapeHtml(order.name)}</title>
    <style>
      @page { size: ${page.width}px ${page.height}px; margin: 0; }
      * { box-sizing: border-box; }
      body {
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        margin: 0;
      }
      .page {
        background: white;
        height: ${page.height}px;
        overflow: hidden;
        position: relative;
        width: ${page.width}px;
      }
      .template-block {
        overflow: hidden;
        position: absolute;
      }
      .block-value {
        white-space: pre-wrap;
      }
      .image-block img {
        height: 100%;
        object-fit: contain;
        width: 100%;
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
        font-size: 16px;
        font-weight: 700;
        text-align: center;
        width: 48px;
      }
      .item-image-cell {
        width: 72px;
      }
      .item-image-cell img {
        height: 54px;
        object-fit: contain;
        width: 54px;
      }
      .meta {
        color: #4b5563;
        display: block;
        font-size: 11px;
        margin-top: 4px;
      }
    </style>
  </head>
  <body>
    <main class="page">${blocks}</main>
  </body>
</html>`;
}

function fulfillmentLineToPackingLine(line: FulfillmentOrderLineItem) {
  const orderLine = line.lineItem;
  const quantity =
    line.remainingQuantity ?? line.totalQuantity ?? orderLine?.quantity ?? 0;

  return {
    title: orderLine?.title || orderLine?.name || "Untitled item",
    variantTitle: orderLine?.variantTitle ?? null,
    sku: orderLine?.sku || null,
    quantity,
    imageUrl: orderLine?.image?.url || null,
    imageAlt: orderLine?.image?.altText || null,
  };
}

async function buildPackingSlipJob({
  admin,
  shop,
  orderId,
}: {
  admin: AdminGraphqlClient;
  shop: string;
  orderId: string;
}) {
  if (!orderId) {
    return {
      ok: false as const,
      reason: "Missing Shopify order id.",
    };
  }

  const rule = await getEnabledRule(shop);

  if (!rule) {
    return {
      ok: false as const,
      reason: "No enabled local-agent printer rule.",
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

  const matchingFulfillmentOrders = matchingOpenFulfillmentOrders(
    data.order,
    rule.locationId,
  );

  if (!matchingFulfillmentOrders.length) {
    return {
      ok: false as const,
      reason: `Order ${data.order.name} is not assigned to ${rule.locationName}.`,
    };
  }

  const printableLines = matchingFulfillmentOrders
    .flatMap((fulfillmentOrder) =>
      fulfillmentOrder.lineItems.nodes.map(fulfillmentLineToPackingLine),
    )
    .filter((line) => line.quantity > 0);

  if (!printableLines.length) {
    return {
      ok: false as const,
      reason: `Order ${data.order.name} has no unfulfilled items for ${rule.locationName}.`,
    };
  }

  const html = renderPackingSlipHtml({
    order: data.order,
    locationName: rule.locationName,
    lines: printableLines,
    template: templateFromRule(rule).design,
  });

  return {
    ok: true as const,
    order: data.order,
    rule,
    html,
  };
}

export async function createPrintJobForOrder(
  admin: AdminGraphqlClient,
  shop: string,
  orderId: string,
) {
  const payload = await buildPackingSlipJob({ admin, shop, orderId });

  if (!payload.ok) {
    return { created: false, reason: payload.reason };
  }

  try {
    const job = await prisma.printJob.create({
      data: {
        shop,
        orderId: payload.order.id,
        orderName: payload.order.name,
        orderCreatedAt: new Date(payload.order.createdAt),
        locationId: payload.rule.locationId,
        locationName: payload.rule.locationName,
        printerName: payload.rule.printerName,
        printerProvider: LOCAL_AGENT_PROVIDER,
        printerExternalId: null,
        html: payload.html,
        events: {
          create: {
            shop,
            status: "QUEUED",
            message: `Automatically queued for ${payload.rule.printerName}.`,
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
        reason: `Order ${payload.order.name} was already auto-printed for ${payload.rule.locationName}.`,
      };
    }

    throw error;
  }
}

export async function createManualReprintJobForOrder(
  admin: AdminGraphqlClient,
  shop: string,
  orderId: string,
) {
  const payload = await buildPackingSlipJob({ admin, shop, orderId });

  if (!payload.ok) {
    return { created: false, reason: payload.reason };
  }

  const data = {
    orderName: payload.order.name,
    orderCreatedAt: new Date(payload.order.createdAt),
    locationName: payload.rule.locationName,
    printerName: payload.rule.printerName,
    printerProvider: LOCAL_AGENT_PROVIDER,
    printerExternalId: null,
    status: "QUEUED" as const,
    html: payload.html,
    providerJobId: null,
    lastError: null,
    claimedAt: null,
    printedAt: null,
    events: {
      create: {
        shop,
        status: "QUEUED" as const,
        message: `Manual reprint queued for ${payload.rule.printerName}.`,
      },
    },
  };

  try {
    const job = await prisma.printJob.create({
      data: {
        shop,
        orderId: payload.order.id,
        locationId: payload.rule.locationId,
        ...data,
      },
    });

    return { created: true, jobId: job.id, reason: "Queued." };
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;

    if (prismaError.code !== "P2002") {
      throw error;
    }

    const job = await prisma.printJob.update({
      where: {
        shop_orderId_locationId: {
          shop,
          orderId: payload.order.id,
          locationId: payload.rule.locationId,
        },
      },
      data,
    });

    return { created: true, jobId: job.id, reason: "Queued." };
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
      printerProvider: LOCAL_AGENT_PROVIDER,
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
      printerProvider: LOCAL_AGENT_PROVIDER,
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
