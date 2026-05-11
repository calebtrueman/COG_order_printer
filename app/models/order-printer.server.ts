import crypto from "node:crypto";
import type { PrintJobStatus, Prisma } from "@prisma/client";
import QRCode from "qrcode";
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
};

export type DashboardData = {
  shop: string;
  agentToken: string;
  locations: LocationOption[];
  vendorOptions: string[];
  selectedVendorNames: string[];
  selectedLocationIds: string[];
  printers: DashboardPrinter[];
  rule: DashboardRule | null;
  rules: DashboardRule[];
  jobs: DashboardJob[];
  template: DashboardTemplate;
  templates: DashboardTemplate[];
  reprintOrders: ReprintOrder[];
  restockDocumentHtml: string;
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
  productId: string | null;
  variantId: string | null;
  vendor: string | null;
  productType: string | null;
  onHand: number | null;
  qrSvgDataUri: string | null;
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
    product: {
      id: string;
      title: string | null;
      handle: string | null;
      vendor: string | null;
      productType: string | null;
    } | null;
    variant: {
      id: string;
      sku: string | null;
      inventoryItem: {
        inventoryLevel: {
          quantities: {
            name: string;
            quantity: number;
          }[];
        } | null;
      } | null;
    } | null;
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
      product: {
        id: string;
        title: string | null;
        handle: string | null;
        vendor: string | null;
        productType: string | null;
      } | null;
      variant: {
        id: string;
        sku: string | null;
        inventoryItem: {
          inventoryLevel: {
            quantities: {
              name: string;
              quantity: number;
            }[];
          } | null;
        } | null;
      } | null;
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

type OrderListConnection = {
  nodes: OrderListNode[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
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
export type ItemColumnKey =
  | "checkbox"
  | "quantity"
  | "image"
  | "title"
  | "variant"
  | "sku"
  | "onHand"
  | "qr";

export type ItemColumn = {
  key: ItemColumnKey;
  label: string;
  enabled: boolean;
  width?: number;
  align?: "left" | "center" | "right";
  labelFontSize?: number;
  labelFontWeight?: string;
  labelColor?: string;
  valueFontSize?: number;
  valueFontWeight?: string;
  valueColor?: string;
};
type NormalizedItemColumn = Required<
  Pick<
    ItemColumn,
    | "key"
    | "label"
    | "enabled"
    | "width"
    | "align"
    | "labelFontSize"
    | "labelFontWeight"
    | "labelColor"
    | "valueFontSize"
    | "valueFontWeight"
    | "valueColor"
  >
>;

export type TemplateBlock = {
  id: string;
  type: TemplateBlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  field?: string;
  text?: string;
  textHtml?: string;
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

type TemplateStore = {
  activeName: string;
  templates: DashboardTemplate[];
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
const DEFAULT_VENDOR_FILTER = ["EG4 Electronics"];
const PICKUP_SHIP_TO_TEXT = "Pickup in store at Canadian Off Grid";
const RESTOCK_DOCUMENT_DEFAULT_HTML =
  "<h2>COG restock list</h2><p>Scan low-inventory product QR codes from packing slips to add items here.</p>";
const RESTOCK_SCAN_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PRINT_PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;
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
const GOOGLE_FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;600;700&family=Lato:wght@400;700&family=Montserrat:wght@400;600;700&family=Poppins:wght@400;600;700&family=Nunito+Sans:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&family=Work+Sans:wght@400;600;700&family=Noto+Sans:wght@400;600;700&family=Merriweather:wght@400;700&family=Playfair+Display:wght@400;700&family=Roboto+Slab:wght@400;700&family=Oswald:wght@400;600;700&display=swap";
const TEMPLATE_FONT_FAMILIES = new Set([
  "Inter, Arial, sans-serif",
  "Roboto, Arial, sans-serif",
  "'Open Sans', Arial, sans-serif",
  "Lato, Arial, sans-serif",
  "Montserrat, Arial, sans-serif",
  "Poppins, Arial, sans-serif",
  "'Nunito Sans', Arial, sans-serif",
  "'Source Sans 3', Arial, sans-serif",
  "'Work Sans', Arial, sans-serif",
  "'Noto Sans', Arial, sans-serif",
  "Merriweather, Georgia, serif",
  "'Playfair Display', Georgia, serif",
  "'Roboto Slab', Georgia, serif",
  "Oswald, Arial, sans-serif",
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Georgia, serif",
  "'Times New Roman', Times, serif",
  "'Courier New', Courier, monospace",
  "Verdana, Geneva, sans-serif",
  "Tahoma, Geneva, sans-serif",
]);
const DEFAULT_ITEM_COLUMNS: NormalizedItemColumn[] = [
  {
    key: "checkbox",
    label: "",
    enabled: false,
    width: 34,
    align: "center",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 11,
    valueFontWeight: "400",
    valueColor: "#111827",
  },
  {
    key: "quantity",
    label: "Qty",
    enabled: true,
    width: 54,
    align: "left",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 11,
    valueFontWeight: "400",
    valueColor: "#111827",
  },
  {
    key: "image",
    label: "Image",
    enabled: true,
    width: 72,
    align: "left",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 11,
    valueFontWeight: "400",
    valueColor: "#111827",
  },
  {
    key: "title",
    label: "Product",
    enabled: true,
    width: 260,
    align: "left",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 11,
    valueFontWeight: "700",
    valueColor: "#111827",
  },
  {
    key: "variant",
    label: "Variant",
    enabled: false,
    width: 140,
    align: "left",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 11,
    valueFontWeight: "400",
    valueColor: "#111827",
  },
  {
    key: "sku",
    label: "SKU",
    enabled: true,
    width: 120,
    align: "left",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 10,
    valueFontWeight: "400",
    valueColor: "#6b7280",
  },
  {
    key: "onHand",
    label: "On hand",
    enabled: false,
    width: 72,
    align: "right",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 11,
    valueFontWeight: "700",
    valueColor: "#111827",
  },
  {
    key: "qr",
    label: "QR",
    enabled: false,
    width: 72,
    align: "center",
    labelFontSize: 10,
    labelFontWeight: "700",
    labelColor: "#374151",
    valueFontSize: 10,
    valueFontWeight: "400",
    valueColor: "#111827",
  },
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

const PRODUCT_VENDOR_QUERY = `#graphql
  query OrderPrinterProductVendors($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        vendor
      }
    }
  }
`;

const ORDER_QUERY = `#graphql
  query OrderPrinterOrder($id: ID!, $locationId: ID!) {
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
          product {
            id
            title
            handle
            vendor
            productType
          }
          variant {
            id
            sku
            inventoryItem {
              inventoryLevel(locationId: $locationId) {
                quantities(names: ["on_hand"]) {
                  name
                  quantity
                }
              }
            }
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
                product {
                  id
                  title
                  handle
                  vendor
                  productType
                }
                variant {
                  id
                  sku
                  inventoryItem {
                    inventoryLevel(locationId: $locationId) {
                      quantities(names: ["on_hand"]) {
                        name
                        quantity
                      }
                    }
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

const ORDER_LIST_QUERY = `#graphql
  query OrderPrinterOrderList($first: Int!, $after: String, $query: String, $reverse: Boolean!) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: $reverse, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
        fulfillmentOrders(first: 10) {
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
            lineItems(first: 25) {
              nodes {
                totalQuantity
                remainingQuantity
                lineItem {
                  product {
                    vendor
                    productType
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

function decodeHtmlText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

type SignedTokenPayload = {
  kind: "print-preview" | "restock-scan";
  shop: string;
  orderId?: string;
  productId?: string | null;
  variantId?: string | null;
  title?: string;
  variantTitle?: string | null;
  sku?: string | null;
  vendor?: string | null;
  productType?: string | null;
  onHand?: number | null;
  orderName?: string | null;
  exp: number;
};

function signingSecret() {
  return (
    process.env.RESTOCK_TOKEN_SECRET ||
    process.env.SHOPIFY_API_SECRET ||
    "development-only-cog-order-printer"
  );
}

function signPayload(payload: SignedTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", signingSecret())
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifySignedPayload(token: string) {
  const [body, signature] = String(token || "").split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", signingSecret())
    .update(body)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SignedTokenPayload;

    if (!payload.shop || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function appBaseUrl(fallback?: string) {
  const configured = process.env.SHOPIFY_APP_URL?.trim();

  return (configured || fallback || "").replace(/\/+$/, "");
}

export function createSignedPrintPreviewUrl({
  shop,
  orderId,
  baseUrl,
}: {
  shop: string;
  orderId: string;
  baseUrl: string;
}) {
  const token = signPayload({
    kind: "print-preview",
    shop,
    orderId,
    exp: Date.now() + PRINT_PREVIEW_TOKEN_TTL_MS,
  });

  return `${appBaseUrl(baseUrl)}/print-preview/${encodeURIComponent(token)}`;
}

export function verifySignedPrintPreviewToken(token: string) {
  const payload = verifySignedPayload(token);

  if (payload?.kind !== "print-preview" || !payload.orderId) {
    return null;
  }

  return payload;
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
    : "Inter, Arial, sans-serif";
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
          typeof column.label === "string"
            ? column.label.slice(0, 40)
            : fallback?.label || key,
        enabled: column.enabled !== false,
        width: boundedNumber(column.width, fallback?.width || 120, 32, 420),
        align: normalizedAlign(column.align),
        labelFontSize: boundedNumber(
          column.labelFontSize,
          fallback?.labelFontSize || 10,
          7,
          32,
        ),
        labelFontWeight: column.labelFontWeight === "400" ? "400" : "700",
        labelColor: normalizedColor(
          column.labelColor,
          fallback?.labelColor || "#374151",
        ),
        valueFontSize: boundedNumber(
          column.valueFontSize,
          fallback?.valueFontSize || 11,
          7,
          48,
        ),
        valueFontWeight: column.valueFontWeight === "700" ? "700" : "400",
        valueColor: normalizedColor(
          column.valueColor,
          fallback?.valueColor || "#111827",
        ),
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
    textHtml:
      typeof value.textHtml === "string" ? value.textHtml.slice(0, 12000) : "",
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

function normalizedFilterName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function uniqueFilterNames(values: unknown[]) {
  const names = new Map<string, string>();

  for (const value of values) {
    const name = normalizedFilterName(value);

    if (name) {
      names.set(normalizedMatchText(name), name);
    }
  }

  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function parseVendorFilterJson(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_VENDOR_FILTER;
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      const names = uniqueFilterNames(parsed);

      return names.length ? names : DEFAULT_VENDOR_FILTER;
    }
  } catch {
    return DEFAULT_VENDOR_FILTER;
  }

  return DEFAULT_VENDOR_FILTER;
}

function vendorFilterJson(values: unknown[]) {
  return JSON.stringify(uniqueFilterNames(values));
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
  const store = templateStoreFromRule(rule);

  return (
    store.templates.find((template) => template.name === store.activeName) ||
    store.templates[0] || {
      name: "Default packing slip",
      design: DEFAULT_TEMPLATE_DESIGN,
    }
  );
}

function templateStoreFromRule(
  rule: { printerExternalId: string | null } | null,
): TemplateStore {
  const raw = rule?.printerExternalId || "";

  if (!raw.startsWith(TEMPLATE_STORAGE_PREFIX)) {
    return {
      activeName: "Default packing slip",
      templates: [
        {
          name: "Default packing slip",
          design: DEFAULT_TEMPLATE_DESIGN,
        },
      ],
    };
  }

  try {
    const parsed = JSON.parse(raw.slice(TEMPLATE_STORAGE_PREFIX.length));
    const templates =
      isRecord(parsed) && Array.isArray(parsed.templates)
        ? parsed.templates.filter(isRecord).map((template) => ({
            name: normalizedTemplateName(template.name),
            design: normalizeTemplateDesign(template.design),
          }))
        : [];

    if (templates.length) {
      const activeName =
        isRecord(parsed) && typeof parsed.activeName === "string"
          ? normalizedTemplateName(parsed.activeName)
          : templates[0].name;

      return {
        activeName: templates.some((template) => template.name === activeName)
          ? activeName
          : templates[0].name,
        templates,
      };
    }

    const legacyTemplate = {
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

    return {
      activeName: legacyTemplate.name,
      templates: [legacyTemplate],
    };
  } catch {
    return {
      activeName: "Default packing slip",
      templates: [
        {
          name: "Default packing slip",
          design: DEFAULT_TEMPLATE_DESIGN,
        },
      ],
    };
  }
}

function normalizedTemplateName(value: unknown) {
  const name = String(value || "Default packing slip")
    .trim()
    .slice(0, 120);

  return name || "Default packing slip";
}

function serializedTemplateStore(store: TemplateStore) {
  return (
    TEMPLATE_STORAGE_PREFIX +
    JSON.stringify({
      activeName: store.activeName,
      templates: store.templates,
    })
  );
}

function templateStoreWithActiveTemplate(
  rule: { printerExternalId: string | null } | null,
  value: unknown,
) {
  const store = templateStoreFromRule(rule);
  const requestedName = normalizedTemplateName(value);
  const activeName = store.templates.some(
    (template) => template.name === requestedName,
  )
    ? requestedName
    : store.activeName;

  return serializedTemplateStore({
    activeName,
    templates: store.templates,
  });
}

export async function savePrintTemplate(shop: string, formData: FormData) {
  const name = normalizedTemplateName(formData.get("templateName"));
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

  const store = templateStoreFromRule(rule);
  const templates = store.templates.some((template) => template.name === name)
    ? store.templates.map((template) =>
        template.name === name ? { name, design } : template,
      )
    : [...store.templates, { name, design }];

  await prisma.printerRule.update({
    where: { id: rule.id },
    data: {
      printerExternalId: serializedTemplateStore({
        activeName: name,
        templates,
      }),
    },
  });
}

export async function deletePrintTemplate(shop: string, formData: FormData) {
  const name = normalizedTemplateName(formData.get("templateName"));
  const rule = await prisma.printerRule.findFirst({
    where: { shop, printerProvider: LOCAL_AGENT_PROVIDER },
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
  });

  if (!rule) {
    throw new Error("Save the fulfillment location and printer first.");
  }

  const store = templateStoreFromRule(rule);

  if (store.templates.length <= 1) {
    throw new Error("At least one packing slip template is required.");
  }

  if (!store.templates.some((template) => template.name === name)) {
    throw new Error("That template no longer exists.");
  }

  const templates = store.templates.filter(
    (template) => template.name !== name,
  );
  const activeName =
    store.activeName === name
      ? templates[0].name
      : templates.some((template) => template.name === store.activeName)
        ? store.activeName
        : templates[0].name;

  await prisma.printerRule.update({
    where: { id: rule.id },
    data: {
      printerExternalId: serializedTemplateStore({
        activeName,
        templates,
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

export async function fetchProductVendors(
  admin: AdminGraphqlClient,
  limit = 1000,
) {
  type ProductVendorData = {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: { vendor: string | null }[];
    };
  };
  const vendors: string[] = [];
  let after: string | null = null;

  while (vendors.length < limit) {
    const first = Math.min(250, limit - vendors.length);
    const data: ProductVendorData = await graphqlJson<ProductVendorData>(
      admin,
      PRODUCT_VENDOR_QUERY,
      { first, after },
    );

    vendors.push(...data.products.nodes.map((product) => product.vendor || ""));

    if (
      !data.products.pageInfo.hasNextPage ||
      !data.products.pageInfo.endCursor
    ) {
      break;
    }

    after = data.products.pageInfo.endCursor;
  }

  return uniqueFilterNames(vendors);
}

export async function loadDashboard(
  admin: AdminGraphqlClient,
  shop: string,
  options: { includeReprintOrders?: boolean } = {},
): Promise<DashboardData> {
  const [
    settings,
    locations,
    rules,
    vendorOptions,
    printers,
    jobs,
    reprintOrders,
    restockDocumentHtml,
  ] = await Promise.all([
    ensureAppSettings(shop),
    fetchLocations(admin),
    prisma.printerRule.findMany({
      where: { shop, printerProvider: LOCAL_AGENT_PROVIDER },
      orderBy: [{ enabled: "desc" }, { locationName: "asc" }],
    }),
    fetchProductVendors(admin),
    prisma.registeredPrinter.findMany({
      where: { shop, active: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.printJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    loadReprintOrdersForDashboard(admin, shop, options.includeReprintOrders),
    loadRestockDocument(shop),
  ]);
  const selectedVendorNames = parseVendorFilterJson(settings.vendorFilterJson);
  const rule = rules[0] || null;
  const dashboardRules = rules.map((savedRule) => ({
    id: savedRule.id,
    locationId: savedRule.locationId,
    locationName: savedRule.locationName,
    printerName: savedRule.printerName,
    enabled: savedRule.enabled,
  }));

  return {
    shop,
    agentToken: settings.agentToken,
    locations,
    vendorOptions: uniqueFilterNames([...vendorOptions, ...selectedVendorNames]),
    selectedVendorNames,
    selectedLocationIds: rules.map((savedRule) => savedRule.locationId),
    printers: printers.map((printer) => ({
      name: printer.name,
      isDefault: printer.isDefault,
      agentName: printer.agentName,
      lastSeenAt: printer.lastSeenAt.toISOString(),
    })),
    rule: dashboardRules[0] || null,
    rules: dashboardRules,
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
    templates: templateStoreFromRule(rule).templates,
    reprintOrders,
    restockDocumentHtml,
  };
}

export async function savePrinterRule(
  admin: AdminGraphqlClient,
  shop: string,
  formData: FormData,
) {
  const selectedLocationIds = uniqueFilterNames([
    ...formData.getAll("locationIds"),
    formData.get("locationId"),
  ]);
  const selectedVendorNames = uniqueFilterNames(formData.getAll("vendorNames"));
  const printerName = normalizePrinterName(formData.get("printerName"));
  const enabled = formData.get("enabled") === "on";

  if (!selectedLocationIds.length) {
    throw new Error("Choose at least one fulfillment location.");
  }

  if (!selectedVendorNames.length) {
    throw new Error("Choose at least one vendor.");
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

  const selectedLocations = selectedLocationIds.map((locationId) =>
    locations.find((option) => option.id === locationId),
  );

  if (selectedLocations.some((location) => !location)) {
    throw new Error("One of those fulfillment locations is not available.");
  }

  if (!printer || !printer.active) {
    throw new Error("That printer has not been registered by the print agent.");
  }

  const templateStorage = templateStoreWithActiveTemplate(
    existingRule,
    formData.get("activeTemplateName"),
  );

  await prisma.$transaction([
    prisma.appSettings.update({
      where: { shop },
      data: { vendorFilterJson: vendorFilterJson(selectedVendorNames) },
    }),
    prisma.printerRule.deleteMany({
      where: {
        shop,
        NOT: { locationId: { in: selectedLocationIds } },
      },
    }),
    ...selectedLocations.map((location) =>
      prisma.printerRule.upsert({
        where: { shop_locationId: { shop, locationId: location!.id } },
        update: {
          locationName: location!.name,
          printerName,
          printerProvider: LOCAL_AGENT_PROVIDER,
          printerExternalId: templateStorage,
          enabled,
        },
        create: {
          shop,
          locationId: location!.id,
          locationName: location!.name,
          printerName,
          printerProvider: LOCAL_AGENT_PROVIDER,
          printerExternalId: templateStorage,
          enabled,
        },
      }),
    ),
  ]);
}

function isOpenFulfillmentOrder(fulfillmentOrder: FulfillmentOrderNode) {
  const status = fulfillmentOrder.status.toUpperCase();

  return status !== "CLOSED" && status !== "CANCELLED";
}

function normalizedMatchText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function fulfillmentOrderMatchesRuleLocation(
  fulfillmentOrder: FulfillmentOrderNode,
  rule: { locationId: string },
) {
  return fulfillmentOrder.assignedLocation?.location?.id === rule.locationId;
}

function lineRemainingQuantity(line: FulfillmentOrderLineItem) {
  return (
    line.remainingQuantity ?? line.totalQuantity ?? line.lineItem?.quantity ?? 0
  );
}

function lineMatchesVendorFilter(
  line: FulfillmentOrderLineItem,
  vendorNames: string[],
) {
  const product = line.lineItem?.product;
  const selected = new Set(vendorNames.map(normalizedMatchText));

  return selected.size > 0 && selected.has(normalizedMatchText(product?.vendor));
}

function fulfillmentOrderHasRemainingItems(
  fulfillmentOrder: FulfillmentOrderNode,
  vendorNames: string[],
) {
  return fulfillmentOrder.lineItems.nodes.some(
    (line) =>
      lineRemainingQuantity(line) > 0 &&
      lineMatchesVendorFilter(line, vendorNames),
  );
}

function matchingOpenFulfillmentOrders(
  order: Pick<OrderPrinterOrder | OrderListNode, "fulfillmentOrders">,
  rule: { locationId: string },
  vendorNames: string[],
) {
  return order.fulfillmentOrders.nodes.filter(
    (fulfillmentOrder) =>
      fulfillmentOrderMatchesRuleLocation(fulfillmentOrder, rule) &&
      isOpenFulfillmentOrder(fulfillmentOrder) &&
      fulfillmentOrderHasRemainingItems(fulfillmentOrder, vendorNames),
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

async function fetchOrderListPages({
  admin,
  query,
  reverse,
  limit,
  pageSize = 10,
}: {
  admin: AdminGraphqlClient;
  query: string;
  reverse: boolean;
  limit: number;
  pageSize?: number;
}): Promise<OrderListNode[]> {
  const orders: OrderListNode[] = [];
  let after: string | null = null;

  while (orders.length < limit) {
    const first = Math.min(pageSize, limit - orders.length);
    const data: { orders: OrderListConnection } = await graphqlJson(
      admin,
      ORDER_LIST_QUERY,
      { first, after, query, reverse },
    );

    orders.push(...data.orders.nodes);

    if (!data.orders.pageInfo.hasNextPage || !data.orders.pageInfo.endCursor) {
      break;
    }

    after = data.orders.pageInfo.endCursor;
  }

  return orders;
}

async function loadReprintOrdersForDashboard(
  admin: AdminGraphqlClient,
  shop: string,
  includeReprintOrders?: boolean,
) {
  if (!includeReprintOrders) {
    return [];
  }

  try {
    return await listReprintableOrders(admin, shop);
  } catch (error) {
    console.error("Unable to load reprintable orders.", error);
    return [];
  }
}

async function getEnabledRules(shop: string) {
  return prisma.printerRule.findMany({
    where: { shop, enabled: true, printerProvider: LOCAL_AGENT_PROVIDER },
    orderBy: [{ locationName: "asc" }, { updatedAt: "desc" }],
  });
}

async function getAutomationFilter(shop: string) {
  const [settings, rules] = await Promise.all([
    ensureAppSettings(shop),
    getEnabledRules(shop),
  ]);

  return {
    rules,
    vendorNames: parseVendorFilterJson(settings.vendorFilterJson),
  };
}

export async function listReprintableOrders(
  admin: AdminGraphqlClient,
  shop: string,
  limit = 100,
) {
  const { rules, vendorNames } = await getAutomationFilter(shop);

  if (!rules.length || !vendorNames.length) {
    return [];
  }

  const orders = await fetchOrderListPages({
    admin,
    query: "status:open",
    reverse: true,
    limit,
  });

  return orders
    .map((order) => {
      const matchingOrders = rules.flatMap((rule) =>
        matchingOpenFulfillmentOrders(order, rule, vendorNames),
      );

      return { order, matchingOrders };
    })
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
  const { rules, vendorNames } = await getAutomationFilter(shop);
  const locationIds = rules.map((rule) => rule.locationId);

  if (!rules.length) {
    return {
      checked: 0,
      queued: 0,
      skipped: 0,
      reason: "No enabled local-agent printer rule.",
      results: [],
    };
  }

  if (!vendorNames.length) {
    return {
      checked: 0,
      queued: 0,
      skipped: 0,
      reason: "No automation vendors selected.",
      results: [],
    };
  }

  const latestAutoPrint = await prisma.printJob.findFirst({
    where: {
      shop,
      locationId: { in: locationIds },
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
  const orders = await fetchOrderListPages({
    admin,
    query,
    reverse: false,
    limit,
  });
  const candidates = orders.filter(
    (order) =>
      rules.some(
        (rule) => matchingOpenFulfillmentOrders(order, rule, vendorNames).length,
      ),
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

function isPickupOrder(order: Pick<OrderPrinterOrder, "shippingAddress" | "shippingLines">) {
  const method = order.shippingLines.nodes
    .map((shippingLine) => shippingLine.title || shippingLine.code || "")
    .join(" ")
    .toLowerCase();

  return (
    method.includes("pickup") ||
    method.includes("pick up") ||
    (!order.shippingAddress && method.includes("local"))
  );
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
      if (isPickupOrder(order)) {
        return PICKUP_SHIP_TO_TEXT;
      }

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

function sanitizedInlineStyle(value: string) {
  return value
    .split(";")
    .map((rule) => rule.trim())
    .map((rule) => {
      const [rawName, ...rawValueParts] = rule.split(":");
      const name = rawName?.trim().toLowerCase();
      const styleValue = rawValueParts.join(":").trim();

      if (!name || !styleValue) {
        return "";
      }

      if (
        name === "font-weight" &&
        /^(400|500|600|700|bold|normal)$/i.test(styleValue)
      ) {
        return `${name}:${styleValue}`;
      }

      if (name === "font-style" && /^(italic|normal)$/i.test(styleValue)) {
        return `${name}:${styleValue}`;
      }

      if (
        name === "text-decoration" &&
        /^(underline|none|line-through)$/i.test(styleValue)
      ) {
        return `${name}:${styleValue}`;
      }

      if (
        (name === "color" || name === "background-color") &&
        (/^#[0-9a-fA-F]{3,6}$/.test(styleValue) ||
          /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(styleValue))
      ) {
        return `${name}:${styleValue}`;
      }

      if (
        name === "font-size" &&
        /^([8-9]|[1-6]\d|72)(px)?$/.test(styleValue)
      ) {
        return `${name}:${Number.parseInt(styleValue, 10)}px`;
      }

      if (name === "line-height") {
        const lineHeight = Number.parseFloat(styleValue);

        if (
          Number.isFinite(lineHeight) &&
          lineHeight >= 0.8 &&
          lineHeight <= 2.4
        ) {
          return `${name}:${normalizedLineHeight(lineHeight)}`;
        }
      }

      if (
        name === "font-family" &&
        /^[\w\s'",-]+$/.test(styleValue) &&
        styleValue.length < 120
      ) {
        return `${name}:${styleValue}`;
      }

      return "";
    })
    .filter(Boolean)
    .join(";");
}

function attributeValue(markup: string, name: string) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const match = markup.match(pattern);

  return match?.[2] || match?.[3] || "";
}

function sanitizeTemplateHtml(html: string) {
  const allowedTags = new Set([
    "b",
    "strong",
    "i",
    "em",
    "u",
    "span",
    "br",
    "div",
    "p",
    "font",
  ]);

  return String(html || "")
    .slice(0, 12000)
    .replace(/<[^>]*>|[^<]+/g, (chunk) => {
      if (!chunk.startsWith("<")) {
        return escapeHtml(decodeHtmlText(chunk));
      }

      const closing = chunk.match(/^<\/\s*([a-z0-9]+)\s*>$/i);

      if (closing) {
        const tag = closing[1].toLowerCase();

        if (tag === "font") {
          return "</span>";
        }

        return allowedTags.has(tag) && tag !== "br" ? `</${tag}>` : "";
      }

      const opening = chunk.match(/^<\s*([a-z0-9]+)([^>]*)\/?\s*>$/i);

      if (!opening) {
        return "";
      }

      const tag = opening[1].toLowerCase();
      const attrs = opening[2] || "";

      if (!allowedTags.has(tag)) {
        return "";
      }

      if (tag === "br") {
        return "<br>";
      }

      if (tag === "font") {
        const color = attributeValue(attrs, "color");
        const face = attributeValue(attrs, "face");
        const size = Number(attributeValue(attrs, "size"));
        const styles = [
          color ? sanitizedInlineStyle(`color:${color}`) : "",
          face ? sanitizedInlineStyle(`font-family:${face}`) : "",
          Number.isFinite(size)
            ? sanitizedInlineStyle(
                `font-size:${Math.min(72, Math.max(8, size * 4 + 4))}px`,
              )
            : "",
        ].filter(Boolean);

        return styles.length ? `<span style="${styles.join(";")}">` : "<span>";
      }

      if (tag !== "span") {
        return `<${tag}>`;
      }

      const style = sanitizedInlineStyle(attributeValue(attrs, "style"));

      return style ? `<span style="${style}">` : "<span>";
    });
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
                  `<th style="${itemColumnHeaderStyle(column)}">${escapeHtml(column.label)}</th>`,
              )
              .join("")}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function itemColumnHeaderStyle(column: NormalizedItemColumn) {
  return [
    column.width ? `width:${column.width}px` : "",
    `font-size:${boundedNumber(column.labelFontSize, 10, 7, 32)}px`,
    `font-weight:${column.labelFontWeight === "400" ? "400" : "700"}`,
    `color:${normalizedColor(column.labelColor, "#374151")}`,
    `text-align:${normalizedAlign(column.align)}`,
  ]
    .filter(Boolean)
    .join(";");
}

function itemColumnValueStyle(column: ItemColumn) {
  return [
    `font-size:${boundedNumber(column.valueFontSize, 11, 7, 48)}px`,
    `font-weight:${column.valueFontWeight === "700" ? "700" : "400"}`,
    `color:${normalizedColor(column.valueColor, "#111827")}`,
    `text-align:${normalizedAlign(column.align)}`,
  ].join(";");
}

function renderItemCell(column: ItemColumn, line: PackingSlipLine) {
  if (column.key === "checkbox") {
    return `<td class="checkbox-cell" style="${itemColumnValueStyle(column)}"><span class="print-checkbox"></span></td>`;
  }

  if (column.key === "quantity") {
    return `<td class="qty" style="${itemColumnValueStyle(column)}">${escapeHtml(line.quantity)}</td>`;
  }

  if (column.key === "image") {
    return `<td class="item-image-cell" style="${itemColumnValueStyle(column)}">${
      line.imageUrl
        ? `<img src="${escapeHtml(line.imageUrl)}" alt="${escapeHtml(line.imageAlt || lineTitle(line))}">`
        : ""
    }</td>`;
  }

  if (column.key === "onHand") {
    return `<td class="on-hand-cell" style="${itemColumnValueStyle(column)}">${line.onHand ?? ""}</td>`;
  }

  if (column.key === "qr") {
    return `<td class="qr-cell" style="${itemColumnValueStyle(column)}">${
      line.qrSvgDataUri
        ? `<img class="restock-qr" src="${escapeHtml(line.qrSvgDataUri)}" alt="${escapeHtml(`Restock QR for ${lineTitle(line)}`)}">`
        : ""
    }</td>`;
  }

  if (column.key === "title") {
    return `<td style="${itemColumnValueStyle(column)}">${escapeHtml(line.title)}</td>`;
  }

  if (column.key === "variant") {
    return `<td style="${itemColumnValueStyle(column)}">${escapeHtml(
      line.variantTitle && line.variantTitle !== "Default Title"
        ? line.variantTitle
        : "",
    )}</td>`;
  }

  return `<td style="${itemColumnValueStyle(column)}">${escapeHtml(line.sku || "")}</td>`;
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
  const value =
    block.type === "text" && block.textHtml
      ? sanitizeTemplateHtml(replaceTemplateTokens(block.textHtml, context))
      : renderTemplateTextValue(rawValue);

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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="${escapeHtml(GOOGLE_FONT_STYLESHEET)}">
    <style>
      @page { size: ${page.width}px ${page.height}px; margin: 0; }
      * { box-sizing: border-box; }
      body {
        color: #111827;
        font-family: Inter, Arial, Helvetica, sans-serif;
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
      .qr-cell {
        text-align: center;
      }
      .restock-qr {
        display: inline-block;
        height: 58px;
        width: 58px;
      }
      .checkbox-cell {
        text-align: center;
      }
      .print-checkbox {
        border: 1.5px solid currentColor;
        display: inline-block;
        height: 13px;
        width: 13px;
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
  const quantity = lineRemainingQuantity(line);
  const inventoryQuantities =
    orderLine?.variant?.inventoryItem?.inventoryLevel?.quantities || [];
  const onHand =
    inventoryQuantities.find(
      (quantityValue) => quantityValue.name === "on_hand",
    )?.quantity ?? null;

  return {
    title: orderLine?.title || orderLine?.name || "Untitled item",
    variantTitle: orderLine?.variantTitle ?? null,
    sku: orderLine?.variant?.sku || orderLine?.sku || null,
    quantity,
    imageUrl: orderLine?.image?.url || null,
    imageAlt: orderLine?.image?.altText || null,
    productId: orderLine?.product?.id || null,
    variantId: orderLine?.variant?.id || null,
    vendor: orderLine?.product?.vendor || null,
    productType: orderLine?.product?.productType || null,
    onHand,
    qrSvgDataUri: null,
  };
}

function createRestockScanUrl({
  shop,
  orderName,
  line,
}: {
  shop: string;
  orderName: string;
  line: PackingSlipLine;
}) {
  const token = signPayload({
    kind: "restock-scan",
    shop,
    productId: line.productId,
    variantId: line.variantId,
    title: lineTitle(line),
    variantTitle: line.variantTitle,
    sku: line.sku,
    vendor: line.vendor,
    productType: line.productType,
    onHand: line.onHand,
    orderName,
    exp: Date.now() + RESTOCK_SCAN_TOKEN_TTL_MS,
  });
  const baseUrl = appBaseUrl();

  if (!baseUrl) {
    return "";
  }

  return `${baseUrl}/restock/scan?token=${encodeURIComponent(token)}`;
}

async function qrDataUri(value: string) {
  if (!value) {
    return null;
  }

  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    width: 96,
    errorCorrectionLevel: "M",
  });

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function linesWithRestockQrCodes({
  shop,
  order,
  lines,
}: {
  shop: string;
  order: OrderPrinterOrder;
  lines: PackingSlipLine[];
}) {
  return Promise.all(
    lines.map(async (line) => ({
      ...line,
      qrSvgDataUri: await qrDataUri(
        createRestockScanUrl({ shop, orderName: order.name, line }),
      ),
    })),
  );
}

type PackingSlipJobPayload = {
  ok: true;
  order: OrderPrinterOrder;
  rule: Prisma.PrinterRuleGetPayload<object>;
  html: string;
};

async function buildPackingSlipJobs({
  admin,
  shop,
  orderId,
}: {
  admin: AdminGraphqlClient;
  shop: string;
  orderId: string;
}): Promise<
  | { ok: false; reason: string }
  | { ok: true; jobs: PackingSlipJobPayload[]; orderName: string }
> {
  if (!orderId) {
    return {
      ok: false,
      reason: "Missing Shopify order id.",
    };
  }

  const { rules, vendorNames } = await getAutomationFilter(shop);

  if (!rules.length) {
    return {
      ok: false,
      reason: "No enabled local-agent printer rule.",
    };
  }

  if (!vendorNames.length) {
    return {
      ok: false,
      reason: "No automation vendors selected.",
    };
  }

  const jobs: PackingSlipJobPayload[] = [];
  let orderName = "";

  for (const rule of rules) {
    const data = await graphqlJson<{ order: OrderPrinterOrder | null }>(
      admin,
      ORDER_QUERY,
      { id: orderId, locationId: rule.locationId },
    );

    if (!data.order) {
      throw new Error(`Shopify order ${orderId} was not found.`);
    }

    orderName = data.order.name;
    const matchingFulfillmentOrders = matchingOpenFulfillmentOrders(
      data.order,
      rule,
      vendorNames,
    );

    if (!matchingFulfillmentOrders.length) {
      continue;
    }

    const printableLines = matchingFulfillmentOrders
      .flatMap((fulfillmentOrder) =>
        fulfillmentOrder.lineItems.nodes.map(fulfillmentLineToPackingLine),
      )
      .filter(
        (line) =>
          line.quantity > 0 &&
          vendorNames
            .map(normalizedMatchText)
            .includes(normalizedMatchText(line.vendor)),
      );

    if (!printableLines.length) {
      continue;
    }

    const lines = await linesWithRestockQrCodes({
      shop,
      order: data.order,
      lines: printableLines,
    });

    jobs.push({
      ok: true,
      order: data.order,
      rule,
      html: renderPackingSlipHtml({
        order: data.order,
        locationName: rule.locationName,
        lines,
        template: templateFromRule(rule).design,
      }),
    });
  }

  if (!jobs.length) {
    return {
      ok: false,
      reason: orderName
        ? `Order ${orderName} has no unfulfilled items for the selected fulfillment locations and vendors.`
        : "No matching order was found.",
    };
  }

  return { ok: true, jobs, orderName };
}

async function buildPackingSlipJob(args: {
  admin: AdminGraphqlClient;
  shop: string;
  orderId: string;
}) {
  const payload = await buildPackingSlipJobs(args);

  if (!payload.ok) {
    return payload;
  }

  return payload.jobs[0];
}

export async function createPrintJobForOrder(
  admin: AdminGraphqlClient,
  shop: string,
  orderId: string,
) {
  const payload = await buildPackingSlipJobs({ admin, shop, orderId });

  if (!payload.ok) {
    return { created: false, reason: payload.reason };
  }

  const results = [];

  for (const jobPayload of payload.jobs) {
    try {
      const job = await prisma.printJob.create({
        data: {
          shop,
          orderId: jobPayload.order.id,
          orderName: jobPayload.order.name,
          orderCreatedAt: new Date(jobPayload.order.createdAt),
          locationId: jobPayload.rule.locationId,
          locationName: jobPayload.rule.locationName,
          printerName: jobPayload.rule.printerName,
          printerProvider: LOCAL_AGENT_PROVIDER,
          printerExternalId: null,
          html: jobPayload.html,
          events: {
            create: {
              shop,
              status: "QUEUED",
              message: `Automatically queued for ${jobPayload.rule.printerName}.`,
            },
          },
        },
      });

      results.push({
        created: true,
        jobId: job.id,
        locationName: jobPayload.rule.locationName,
        reason: "Queued.",
      });
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;

      if (prismaError.code === "P2002") {
        results.push({
          created: false,
          locationName: jobPayload.rule.locationName,
          reason: `Order ${jobPayload.order.name} was already auto-printed for ${jobPayload.rule.locationName}.`,
        });
        continue;
      }

      throw error;
    }
  }

  const created = results.filter((result) => result.created);

  return {
    created: created.length > 0,
    jobId: created[0]?.jobId,
    reason: results.map((result) => result.reason).join(" "),
  };
}

export async function buildPackingSlipPreviewHtml(
  admin: AdminGraphqlClient,
  shop: string,
  orderId: string,
) {
  const payload = await buildPackingSlipJob({ admin, shop, orderId });

  if (!payload.ok) {
    return {
      ok: false as const,
      reason: payload.reason,
    };
  }

  return {
    ok: true as const,
    orderName: payload.order.name,
    html: payload.html,
  };
}

export async function createManualReprintJobForOrder(
  admin: AdminGraphqlClient,
  shop: string,
  orderId: string,
) {
  const payload = await buildPackingSlipJobs({ admin, shop, orderId });

  if (!payload.ok) {
    return { created: false, reason: payload.reason };
  }

  const results = [];

  for (const jobPayload of payload.jobs) {
    const data = {
      orderName: jobPayload.order.name,
      orderCreatedAt: new Date(jobPayload.order.createdAt),
      locationName: jobPayload.rule.locationName,
      printerName: jobPayload.rule.printerName,
      printerProvider: LOCAL_AGENT_PROVIDER,
      printerExternalId: null,
      status: "QUEUED" as const,
      html: jobPayload.html,
      providerJobId: null,
      lastError: null,
      claimedAt: null,
      printedAt: null,
      events: {
        create: {
          shop,
          status: "QUEUED" as const,
          message: `Manual reprint queued for ${jobPayload.rule.printerName}.`,
        },
      },
    };

    try {
      const job = await prisma.printJob.create({
        data: {
          shop,
          orderId: jobPayload.order.id,
          locationId: jobPayload.rule.locationId,
          ...data,
        },
      });

      results.push({ created: true, jobId: job.id, reason: "Queued." });
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;

      if (prismaError.code !== "P2002") {
        throw error;
      }

      const job = await prisma.printJob.update({
        where: {
          shop_orderId_locationId: {
            shop,
            orderId: jobPayload.order.id,
            locationId: jobPayload.rule.locationId,
          },
        },
        data,
      });

      results.push({ created: true, jobId: job.id, reason: "Queued." });
    }
  }

  return {
    created: results.some((result) => result.created),
    jobId: results.find((result) => result.jobId)?.jobId,
    reason: `Queued ${results.length} packing slip${results.length === 1 ? "" : "s"}.`,
  };
}

function sanitizeRestockDocumentHtml(html: string) {
  const allowedTags = new Set([
    "b",
    "strong",
    "i",
    "em",
    "u",
    "span",
    "br",
    "div",
    "p",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "section",
  ]);

  return String(html || RESTOCK_DOCUMENT_DEFAULT_HTML)
    .slice(0, 200000)
    .replace(/<[^>]*>|[^<]+/g, (chunk) => {
      if (!chunk.startsWith("<")) {
        return escapeHtml(decodeHtmlText(chunk));
      }

      const closing = chunk.match(/^<\/\s*([a-z0-9]+)\s*>$/i);

      if (closing) {
        const tag = closing[1].toLowerCase();

        return allowedTags.has(tag) && tag !== "br" ? `</${tag}>` : "";
      }

      const opening = chunk.match(/^<\s*([a-z0-9]+)([^>]*)\/?\s*>$/i);

      if (!opening) {
        return "";
      }

      const tag = opening[1].toLowerCase();
      const attrs = opening[2] || "";

      if (!allowedTags.has(tag)) {
        return "";
      }

      if (tag === "br") {
        return "<br>";
      }

      const style = sanitizedInlineStyle(attributeValue(attrs, "style"));
      const dataSku = attributeValue(attrs, "data-sku")
        .replace(/[^\w./:-]+/g, " ")
        .trim()
        .slice(0, 120);
      const attributes = [
        style ? `style="${escapeHtml(style)}"` : "",
        dataSku ? `data-sku="${escapeHtml(dataSku)}"` : "",
      ]
        .filter(Boolean)
        .join(" ");

      return attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
    });
}

export async function loadRestockDocument(shop: string) {
  const document = await prisma.restockDocument.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      contentHtml: RESTOCK_DOCUMENT_DEFAULT_HTML,
    },
  });

  return document.contentHtml;
}

export async function saveRestockDocument(shop: string, formData: FormData) {
  const contentHtml = sanitizeRestockDocumentHtml(
    String(formData.get("restockDocumentHtml") || ""),
  );

  await prisma.restockDocument.upsert({
    where: { shop },
    update: { contentHtml },
    create: { shop, contentHtml },
  });
}

export async function clearRestockDocument(shop: string) {
  await prisma.restockDocument.upsert({
    where: { shop },
    update: { contentHtml: RESTOCK_DOCUMENT_DEFAULT_HTML },
    create: { shop, contentHtml: RESTOCK_DOCUMENT_DEFAULT_HTML },
  });
}

function restockScanEntryHtml(payload: SignedTokenPayload) {
  const title = payload.title || "Untitled product";
  const details = [
    payload.sku ? `SKU: ${payload.sku}` : "",
    Number.isFinite(payload.onHand) ? `On hand: ${payload.onHand}` : "",
    payload.vendor ? `Vendor: ${payload.vendor}` : "",
    payload.productType ? `Type: ${payload.productType}` : "",
    payload.orderName ? `Order: ${payload.orderName}` : "",
  ].filter(Boolean);

  return `
    <section class="restock-line" data-sku="${escapeHtml(payload.sku || "")}">
      <h3>${escapeHtml(title)}</h3>
      ${details.length ? `<p>${details.map(escapeHtml).join(" | ")}</p>` : ""}
      <p>Needed: <strong>____</strong></p>
    </section>
  `;
}

export async function appendRestockScanToken(token: string) {
  const payload = verifySignedPayload(token);

  if (payload?.kind !== "restock-scan" || !payload.title) {
    return {
      ok: false as const,
      reason: "This restock QR code is invalid or expired.",
    };
  }

  const current = await loadRestockDocument(payload.shop);
  const contentHtml = sanitizeRestockDocumentHtml(
    `${current}\n${restockScanEntryHtml(payload)}`,
  );

  await prisma.restockDocument.upsert({
    where: { shop: payload.shop },
    update: { contentHtml },
    create: { shop: payload.shop, contentHtml },
  });

  return {
    ok: true as const,
    shop: payload.shop,
    title: payload.title,
    sku: payload.sku || "",
  };
}

export async function restockDocumentDownloadHtml(shop: string) {
  const contentHtml = await loadRestockDocument(shop);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>COG restock list</title>
    <style>
      body { color: #111827; font-family: Arial, sans-serif; margin: 32px; }
      h1, h2, h3 { margin-bottom: 0.35rem; }
      .restock-line { border-bottom: 1px solid #d1d5db; padding: 12px 0; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
    </style>
  </head>
  <body>${contentHtml}</body>
</html>`;
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
