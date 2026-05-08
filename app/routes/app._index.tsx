import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  WheelEvent,
} from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  createManualReprintJobForOrder,
  loadDashboard,
  retryPrintJob,
  rotateAgentToken,
  savePrintTemplate,
  savePrinterRule,
} from "../models/order-printer.server";
import type {
  TemplateBlock,
  TemplateDesign,
} from "../models/order-printer.server";

type ActionData = {
  ok: boolean;
  message: string;
};

type TemplateField = {
  value: string;
  label: string;
  sample: string;
};

const DEFAULT_PAGE_WIDTH = 816;
const DEFAULT_PAGE_HEIGHT = 1056;
const GRID_SIZE = 8;
const MIN_BLOCK_WIDTH = 32;
const MIN_BLOCK_HEIGHT = 24;
const MIN_TEMPLATE_ZOOM = 0.35;
const MAX_TEMPLATE_ZOOM = 1.4;
const MIN_OPERATIONS_HEIGHT = 112;
const DEFAULT_OPERATIONS_HEIGHT = 190;
const MAX_OPERATIONS_HEIGHT = 360;
const PAGE_SIZE_OPTIONS = [
  { value: "letter", label: "Letter", width: 816, height: 1056 },
  { value: "a4", label: "A4", width: 794, height: 1123 },
  { value: "label-4x6", label: "4 x 6 Label", width: 384, height: 576 },
  { value: "custom", label: "Custom", width: 816, height: 1056 },
];
const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
];
const DEFAULT_ITEM_COLUMNS = [
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
] as const;
type ItemColumnKey = (typeof DEFAULT_ITEM_COLUMNS)[number]["key"];
type EditorItemColumn = {
  key: ItemColumnKey;
  label: string;
  enabled: boolean;
  width: number;
  align: "left" | "center" | "right";
  labelFontSize: number;
  labelFontWeight: string;
  labelColor: string;
  valueFontSize: number;
  valueFontWeight: string;
  valueColor: string;
};

const TEMPLATE_FIELD_GROUPS: { label: string; fields: TemplateField[] }[] = [
  {
    label: "Order",
    fields: [
      { value: "order.name", label: "Order #", sample: "#1042" },
      { value: "order.poNumber", label: "PO #", sample: "PO-7834" },
      {
        value: "order.createdAt",
        label: "Order date",
        sample: "May 8, 2026, 9:42 a.m.",
      },
      {
        value: "order.email",
        label: "Customer email",
        sample: "buyer@example.com",
      },
      { value: "order.phone", label: "Customer phone", sample: "555-0128" },
      {
        value: "order.note",
        label: "Order note",
        sample: "Call before delivery.",
      },
    ],
  },
  {
    label: "Shipping",
    fields: [
      {
        value: "shipping.address",
        label: "Ship to address",
        sample: "Alex Smith\n14 Market St\nOttawa ON K1A 0B1\nCanada",
      },
      {
        value: "billing.address",
        label: "Bill to address",
        sample: "Alex Smith\n14 Market St\nOttawa ON K1A 0B1\nCanada",
      },
      { value: "shipping.shipDate", label: "Ship date", sample: "May 8, 2026" },
      {
        value: "shipping.method",
        label: "Ship via",
        sample: "Expedited Parcel",
      },
      {
        value: "fulfillment.trackingNumber",
        label: "Tracking #",
        sample: "1Z999AA10123456784",
      },
      {
        value: "fulfillment.trackingCompany",
        label: "Tracking company",
        sample: "UPS",
      },
      {
        value: "fulfillment.trackingUrl",
        label: "Tracking URL",
        sample: "https://carrier.example/track/1Z999",
      },
    ],
  },
  {
    label: "Fulfillment",
    fields: [
      {
        value: "location.name",
        label: "Fulfillment location",
        sample: "COG Warehouse",
      },
      { value: "items.count", label: "Total item quantity", sample: "3" },
      {
        value: "items.firstImage",
        label: "First product image",
        sample: "",
      },
    ],
  },
];
const TEMPLATE_FIELDS = TEMPLATE_FIELD_GROUPS.flatMap((group) => group.fields);
const SAMPLE_LINES = [
  { quantity: 1, title: "EG4 6000XP inverter", sku: "EG4-6000XP" },
  { quantity: 2, title: "Server rack battery cable set", sku: "CAB-RACK-2/0" },
];

export const links = () => [{ rel: "stylesheet", href: "/order-printer.css" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const showReprintOrders = url.searchParams.get("reprint") === "1";
  const data = await loadDashboard(admin, session.shop, {
    includeReprintOrders: showReprintOrders,
  });

  return {
    ...data,
    appUrl: new URL(request.url).origin,
    showReprintOrders,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "save-rule") {
      await savePrinterRule(admin, session.shop, formData);
      return { ok: true, message: "Printer rule saved." } satisfies ActionData;
    }

    if (intent === "rotate-token") {
      await rotateAgentToken(session.shop);
      return {
        ok: true,
        message: "Print agent token rotated.",
      } satisfies ActionData;
    }

    if (intent === "retry-job") {
      await retryPrintJob(session.shop, String(formData.get("jobId") || ""));
      return {
        ok: true,
        message: "Print job queued again.",
      } satisfies ActionData;
    }

    if (intent === "manual-reprint-order") {
      const result = await createManualReprintJobForOrder(
        admin,
        session.shop,
        String(formData.get("orderId") || ""),
      );

      return {
        ok: result.created,
        message: result.created
          ? "Packing slip queued for reprint."
          : result.reason,
      } satisfies ActionData;
    }

    if (intent === "save-template") {
      await savePrintTemplate(session.shop, formData);
      return {
        ok: true,
        message: "Packing slip template saved.",
      } satisfies ActionData;
    }

    return { ok: false, message: "Unknown action." } satisfies ActionData;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Action failed.",
    } satisfies ActionData;
  }
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

function normalizeZoom(value: number) {
  return clampFloat(value, MIN_TEMPLATE_ZOOM, MAX_TEMPLATE_ZOOM);
}

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type CanvasOperation =
  | {
      mode: "move";
      id: string;
      startX: number;
      startY: number;
      original: TemplateBlock;
    }
  | {
      mode: "resize";
      id: string;
      startX: number;
      startY: number;
      original: TemplateBlock;
      handle: ResizeHandle;
    };

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

function copyDesign(design: TemplateDesign): TemplateDesign {
  const next = JSON.parse(JSON.stringify(design)) as TemplateDesign;
  const page = normalizePageSettings(next.page);

  return {
    ...next,
    page,
    blocks: next.blocks.map((block) => normalizeBlockGeometry(block, page)),
  };
}

function normalizePageSettings(
  page: TemplateDesign["page"],
): TemplateDesign["page"] {
  const preset = PAGE_SIZE_OPTIONS.find(
    (option) => option.value === page?.size,
  );
  const width = clamp(
    Number(page?.width || preset?.width || DEFAULT_PAGE_WIDTH),
    288,
    1344,
  );
  const height = clamp(
    Number(page?.height || preset?.height || DEFAULT_PAGE_HEIGHT),
    288,
    1728,
  );

  return {
    size: page?.size || preset?.value || "letter",
    width,
    height,
    marginTop: clamp(Number(page?.marginTop ?? 36), 0, 192),
    marginRight: clamp(Number(page?.marginRight ?? 36), 0, 192),
    marginBottom: clamp(Number(page?.marginBottom ?? 36), 0, 192),
    marginLeft: clamp(Number(page?.marginLeft ?? 36), 0, 192),
  };
}

function snapValue(value: number, snapToGrid: boolean) {
  return snapToGrid
    ? Math.round(value / GRID_SIZE) * GRID_SIZE
    : Math.round(value);
}

function fieldFor(value: string | undefined) {
  return TEMPLATE_FIELDS.find((field) => field.value === value) || null;
}

function fieldSample(value: string | undefined) {
  return fieldFor(value)?.sample || "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenForField(field: string) {
  return `{{${field}}}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextToHtml(value: string | undefined) {
  return escapeHtml(String(value || "")).replace(/\r?\n/g, "<br>");
}

function htmlToPlainText(value: string | undefined) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
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
          /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(
            styleValue,
          ))
      ) {
        return `${name}:${styleValue}`;
      }

      if (
        name === "font-size" &&
        /^([8-9]|[1-6]\d|72)(px)?$/.test(styleValue)
      ) {
        return `${name}:${Number.parseInt(styleValue, 10)}px`;
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
        return escapeHtml(chunk.replaceAll("&nbsp;", " "));
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

function textBlockHtml(block: TemplateBlock) {
  return sanitizeTemplateHtml(block.textHtml || plainTextToHtml(block.text));
}

function sampleTextHtml(block: TemplateBlock) {
  return sanitizeTemplateHtml(replaceSampleTokens(textBlockHtml(block)));
}

function snapMentions(value: string) {
  return TEMPLATE_FIELDS.reduce((current, field) => {
    const pattern = new RegExp(
      `@${escapeRegExp(field.label)}(?=$|\\s|[.,;:)])`,
      "gi",
    );

    return current.replace(pattern, tokenForField(field.value));
  }, value);
}

function replaceSampleTokens(text: string | undefined) {
  return String(text || "").replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (_match, field) => fieldSample(field),
  );
}

function lineBreaks(value: string) {
  const lines = value.split(/\r?\n/);

  return lines.map((line, index) => (
    <span key={`${line}-${index}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

function richTextPreview(block: TemplateBlock) {
  if (block.textHtml) {
    return (
      <div
        className="template-rich-preview"
        dangerouslySetInnerHTML={{
          __html: sampleTextHtml(block),
        }}
      />
    );
  }

  const text = replaceSampleTokens(block.text);
  const tokenPattern = /\{\{\s*([\w.]+)\s*\}\}/g;
  const nodes = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(String(block.text || "")))) {
    const before = String(block.text || "").slice(cursor, match.index);

    if (before) {
      nodes.push(
        <span key={`t-${cursor}`}>
          {lineBreaks(replaceSampleTokens(before))}
        </span>,
      );
    }

    const field = fieldFor(match[1]);

    nodes.push(
      <span className="variable-chip" key={`v-${match.index}`}>
        {field?.sample || field?.label || match[1]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }

  const rest = String(block.text || "").slice(cursor);

  if (rest) {
    nodes.push(
      <span key={`t-${cursor}`}>{lineBreaks(replaceSampleTokens(rest))}</span>,
    );
  }

  return nodes.length ? nodes : lineBreaks(text);
}

function blockLabel(block: TemplateBlock) {
  if (block.type === "items") {
    return "Line items table";
  }

  if (block.type === "image") {
    return block.field === "items.firstImage"
      ? "Product image"
      : "Custom image";
  }

  if (block.type === "text") {
    return block.text || "Custom text";
  }

  return fieldFor(block.field)?.label || block.label || "Order field";
}

function blockTypeLabel(block: TemplateBlock) {
  if (block.type === "items") {
    return "Items";
  }

  if (block.type === "image") {
    return "Image";
  }

  if (block.type === "text") {
    return "Text";
  }

  return "Field";
}

function normalizeHex(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function normalizeFontFamily(value: string | undefined) {
  return FONT_FAMILIES.some((font) => font.value === value)
    ? value
    : FONT_FAMILIES[0].value;
}

function normalizeItemColumns(
  columns: TemplateBlock["itemColumns"],
): EditorItemColumn[] {
  const incoming = Array.isArray(columns) ? columns : [];
  const normalized = incoming
    .map((column) => {
      const fallback = DEFAULT_ITEM_COLUMNS.find(
        (item) => item.key === column.key,
      );

      if (!fallback) {
        return null;
      }

      return {
        key: fallback.key,
        label: column.label || fallback.label,
        enabled: column.enabled !== false,
        width: clamp(Number(column.width || fallback.width), 32, 420),
        align:
          column.align === "center" || column.align === "right"
            ? column.align
            : fallback.align,
        labelFontSize: clamp(
          Number(column.labelFontSize || fallback.labelFontSize),
          7,
          32,
        ),
        labelFontWeight: column.labelFontWeight === "400" ? "400" : "700",
        labelColor: normalizeHex(column.labelColor, fallback.labelColor),
        valueFontSize: clamp(
          Number(column.valueFontSize || fallback.valueFontSize),
          7,
          48,
        ),
        valueFontWeight: column.valueFontWeight === "700" ? "700" : "400",
        valueColor: normalizeHex(column.valueColor, fallback.valueColor),
      };
    })
    .filter((column): column is EditorItemColumn => Boolean(column));
  const seen = new Set(normalized.map((column) => column.key));

  for (const column of DEFAULT_ITEM_COLUMNS) {
    if (!seen.has(column.key)) {
      normalized.push({ ...column });
    }
  }

  return normalized;
}

function normalizeBlockGeometry(
  block: TemplateBlock,
  page = { width: DEFAULT_PAGE_WIDTH, height: DEFAULT_PAGE_HEIGHT },
): TemplateBlock {
  const w = clamp(Number(block.w) || 220, MIN_BLOCK_WIDTH, page.width);
  const h = clamp(Number(block.h) || 56, MIN_BLOCK_HEIGHT, page.height);

  return {
    ...block,
    x: clamp(Number(block.x) || 0, 0, page.width - w),
    y: clamp(Number(block.y) || 0, 0, page.height - h),
    w,
    h,
    fontSize: clamp(Number(block.fontSize) || 12, 8, 72),
    fontFamily: normalizeFontFamily(block.fontFamily),
    fontWeight: block.fontWeight === "700" ? "700" : "400",
    align:
      block.align === "center" || block.align === "right"
        ? block.align
        : "left",
    italic: block.italic === true,
    underline: block.underline === true,
    uppercase: block.uppercase === true,
    lineHeight: clampFloat(Number(block.lineHeight || 1.4), 0.8, 2.4),
    color: normalizeHex(block.color, "#111827"),
    background:
      block.background === "transparent"
        ? "transparent"
        : normalizeHex(block.background, "transparent"),
    border: block.border === true,
    padding: clamp(Number(block.padding) || 0, 0, 48),
    showImages: block.showImages !== false,
    showSku: block.showSku !== false,
    itemColumns: normalizeItemColumns(block.itemColumns),
  };
}

function previewStyle(block: TemplateBlock): CSSProperties {
  return {
    left: block.x,
    top: block.y,
    width: block.w,
    height: block.h,
    fontFamily: block.fontFamily,
    fontSize: block.fontSize || 12,
    fontWeight: block.fontWeight || "400",
    fontStyle: block.italic ? "italic" : "normal",
    lineHeight: block.lineHeight || 1.4,
    textDecoration: block.underline ? "underline" : "none",
    textTransform: block.uppercase ? "uppercase" : "none",
    textAlign: block.align || "left",
    color: block.color || "#111827",
    background:
      block.background && block.background !== "transparent"
        ? block.background
        : "transparent",
    border: block.border ? "1px solid #d1d5db" : undefined,
    padding: block.padding || 0,
  };
}

function richTextEditorStyle(block: TemplateBlock): CSSProperties {
  return {
    fontFamily: block.fontFamily,
    fontSize: block.fontSize || 12,
    fontWeight: block.fontWeight || "400",
    fontStyle: block.italic ? "italic" : "normal",
    lineHeight: block.lineHeight || 1.4,
    textDecoration: block.underline ? "underline" : "none",
    textTransform: block.uppercase ? "uppercase" : "none",
    textAlign: block.align || "left",
    color: block.color || "#111827",
    background:
      block.background && block.background !== "transparent"
        ? block.background
        : "#ffffff",
  };
}

function createTemplateBlock(
  type: TemplateBlock["type"],
  field: string,
  index: number,
  page: TemplateDesign["page"],
): TemplateBlock {
  const offset = (index % 8) * 12;
  const selectedField = fieldFor(field);

  return normalizeBlockGeometry(
    {
      id: `${type}-${Date.now()}-${index}`,
      type,
      x: 48 + offset,
      y: 48 + offset,
      w: type === "items" ? 680 : type === "image" ? 150 : 240,
      h: type === "items" ? 330 : type === "image" ? 130 : 64,
      field: type === "field" || type === "image" ? field : "",
      text: type === "text" ? "Custom text with @Order # or any variable" : "",
      textHtml:
        type === "text"
          ? plainTextToHtml("Custom text with @Order # or any variable")
          : "",
      imageUrl: "",
      label: type === "field" ? selectedField?.label || "Order field" : "",
      fontSize: type === "text" ? 14 : 12,
      fontFamily: FONT_FAMILIES[0].value,
      fontWeight: type === "field" ? "700" : "400",
      italic: false,
      underline: false,
      uppercase: false,
      lineHeight: 1.4,
      align: "left",
      color: "#111827",
      background: "transparent",
      border: false,
      padding: 0,
      showImages: true,
      showSku: true,
      itemColumns: DEFAULT_ITEM_COLUMNS.map((column) => ({ ...column })),
    },
    page,
  );
}

function resizeBlock(
  original: TemplateBlock,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  snapToGrid: boolean,
  page: TemplateDesign["page"],
) {
  const right = original.x + original.w;
  const bottom = original.y + original.h;
  let x = original.x;
  let y = original.y;
  let w = original.w;
  let h = original.h;

  if (handle.includes("e")) {
    w = clamp(
      snapValue(original.w + deltaX, snapToGrid),
      MIN_BLOCK_WIDTH,
      page.width - original.x,
    );
  }

  if (handle.includes("s")) {
    h = clamp(
      snapValue(original.h + deltaY, snapToGrid),
      MIN_BLOCK_HEIGHT,
      page.height - original.y,
    );
  }

  if (handle.includes("w")) {
    x = clamp(
      snapValue(original.x + deltaX, snapToGrid),
      0,
      right - MIN_BLOCK_WIDTH,
    );
    w = right - x;
  }

  if (handle.includes("n")) {
    y = clamp(
      snapValue(original.y + deltaY, snapToGrid),
      0,
      bottom - MIN_BLOCK_HEIGHT,
    );
    h = bottom - y;
  }

  return normalizeBlockGeometry({ ...original, x, y, w, h }, page);
}

function SampleItemsTable({ block }: { block: TemplateBlock }) {
  const columns = normalizeItemColumns(block.itemColumns).filter(
    (column) =>
      column.enabled &&
      (column.key !== "image" || block.showImages !== false) &&
      (column.key !== "sku" || block.showSku !== false),
  );

  return (
    <table className="template-sample-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} style={itemColumnHeaderStyle(column)}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SAMPLE_LINES.map((line) => (
          <tr key={line.sku}>
            {columns.map((column) => (
              <td key={column.key} style={itemColumnValueStyle(column)}>
                {renderSampleItemCell(column.key, line)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderSampleItemCell(
  key: ItemColumnKey,
  line: (typeof SAMPLE_LINES)[number],
) {
  if (key === "quantity") {
    return line.quantity;
  }

  if (key === "image") {
    return <span className="sample-product-image" />;
  }

  if (key === "variant") {
    return "Default";
  }

  if (key === "sku") {
    return <span className="template-sample-meta">{line.sku}</span>;
  }

  return <strong>{line.title}</strong>;
}

function itemColumnHeaderStyle(column: EditorItemColumn): CSSProperties {
  return {
    width: column.width,
    color: column.labelColor,
    fontSize: column.labelFontSize,
    fontWeight: column.labelFontWeight,
    textAlign: column.align,
  };
}

function itemColumnValueStyle(column: EditorItemColumn): CSSProperties {
  return {
    color: column.valueColor,
    fontSize: column.valueFontSize,
    fontWeight: column.valueFontWeight,
    textAlign: column.align,
  };
}

function TemplateBlockPreview({ block }: { block: TemplateBlock }) {
  if (block.type === "items") {
    return <SampleItemsTable block={block} />;
  }

  if (block.type === "image") {
    const shouldShowProductImage = block.field === "items.firstImage";

    if (block.imageUrl && !shouldShowProductImage) {
      return (
        <img alt="" className="template-preview-image" src={block.imageUrl} />
      );
    }

    return (
      <span className="template-image-placeholder">
        {shouldShowProductImage ? "Product image" : "Image"}
      </span>
    );
  }

  if (block.type === "text") {
    return <>{richTextPreview(block)}</>;
  }

  return <span>{lineBreaks(fieldSample(block.field))}</span>;
}

function RichTextBox({
  block,
  className,
  editorRef,
  onInput,
  onKeyDown,
  onFocus,
  onBlur,
  onSelectionChange,
  style,
}: {
  block: TemplateBlock;
  className: string;
  editorRef?: (element: HTMLDivElement | null) => void;
  onInput: (event: FormEvent<HTMLDivElement>, block: TemplateBlock) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    block: TemplateBlock,
  ) => void;
  onFocus?: (element: HTMLDivElement, block: TemplateBlock) => void;
  onBlur?: (element: HTMLDivElement, block: TemplateBlock) => void;
  onSelectionChange?: (element: HTMLDivElement, block: TemplateBlock) => void;
  style?: CSSProperties;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const currentHtml = textBlockHtml(block);

  useEffect(() => {
    const element = localRef.current;

    if (!element) {
      return;
    }

    if (document.activeElement === element) {
      return;
    }

    if (element.innerHTML !== currentHtml) {
      element.innerHTML = currentHtml;
    }
  }, [currentHtml]);

  return (
    <div
      className={className}
      contentEditable
      data-block-id={block.id}
      data-template-rich-editor={block.id}
      aria-multiline="true"
      onBlur={(event) => onBlur?.(event.currentTarget, block)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onFocus={(event) => onFocus?.(event.currentTarget, block)}
      onInput={(event) => onInput(event, block)}
      onKeyUp={(event) => onSelectionChange?.(event.currentTarget, block)}
      onKeyDown={(event) => onKeyDown(event, block)}
      onMouseUp={(event) => onSelectionChange?.(event.currentTarget, block)}
      onPointerDown={(event) => event.stopPropagation()}
      ref={(element) => {
        localRef.current = element;
        editorRef?.(element);
      }}
      role="textbox"
      style={style}
      suppressContentEditableWarning
      tabIndex={0}
    />
  );
}

function TemplateDesigner({
  template,
  saving,
  canSaveTemplate,
}: {
  template: { name: string; design: TemplateDesign };
  saving: boolean;
  canSaveTemplate: boolean;
}) {
  const [name, setName] = useState(template.name);
  const [design, setDesign] = useState<TemplateDesign>(() =>
    copyDesign(template.design),
  );
  const [selectedId, setSelectedId] = useState(
    template.design.blocks[0]?.id || "",
  );
  const [zoom, setZoom] = useState(0.65);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [tokenField, setTokenField] = useState(TEMPLATE_FIELDS[0]?.value || "");
  const [editingTextBlockId, setEditingTextBlockId] = useState<string | null>(
    null,
  );
  const [editingItemsBlockId, setEditingItemsBlockId] = useState<string | null>(
    null,
  );
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const inlineTextRef = useRef<HTMLDivElement | null>(null);
  const inspectorTextRef = useRef<HTMLDivElement | null>(null);
  const activeRichEditorRef = useRef<HTMLDivElement | null>(null);
  const richSelectionRef = useRef<Range | null>(null);
  const operationRef = useRef<CanvasOperation | null>(null);
  const selectedBlock = useMemo(
    () => design.blocks.find((block) => block.id === selectedId) || null,
    [design.blocks, selectedId],
  );
  const selectedIndex = selectedBlock
    ? design.blocks.findIndex((block) => block.id === selectedBlock.id)
    : -1;
  const [selectedItemColumnKey, setSelectedItemColumnKey] =
    useState<ItemColumnKey>("title");
  const selectedItemColumns = useMemo(
    () =>
      selectedBlock?.type === "items"
        ? normalizeItemColumns(selectedBlock.itemColumns)
        : [],
    [selectedBlock],
  );
  const selectedItemColumn =
    selectedItemColumns.find((column) => column.key === selectedItemColumnKey) ||
    selectedItemColumns.find((column) => column.enabled) ||
    selectedItemColumns[0] ||
    null;
  const dirty =
    name !== template.name ||
    JSON.stringify(design) !== JSON.stringify(template.design);

  useEffect(() => {
    const nextDesign = copyDesign(template.design);

    setName(template.name);
    setDesign(nextDesign);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }, [template.design, template.name]);

  useEffect(() => {
    if (!editingTextBlockId) {
      return;
    }

    const block = design.blocks.find((item) => item.id === editingTextBlockId);

    if (!block || block.type !== "text") {
      setEditingTextBlockId(null);
      return;
    }

    window.requestAnimationFrame(() => {
      inlineTextRef.current?.focus();
    });
  }, [design.blocks, editingTextBlockId]);

  useEffect(() => {
    if (
      selectedBlock?.type === "items" &&
      selectedItemColumns.length &&
      !selectedItemColumns.some((column) => column.key === selectedItemColumnKey)
    ) {
      setSelectedItemColumnKey(selectedItemColumns[0].key);
    }
  }, [selectedBlock?.type, selectedItemColumnKey, selectedItemColumns]);

  function updateBlock(id: string, patch: Partial<TemplateBlock>) {
    setDesign((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id
          ? normalizeBlockGeometry({ ...block, ...patch }, current.page)
          : block,
      ),
    }));
  }

  function updatePage(patch: Partial<TemplateDesign["page"]>) {
    setDesign((current) => {
      const nextPage = normalizePageSettings({ ...current.page, ...patch });

      return {
        ...current,
        page: nextPage,
        blocks: current.blocks.map((block) =>
          normalizeBlockGeometry(block, nextPage),
        ),
      };
    });
  }

  function applyPageSize(value: string) {
    const preset = PAGE_SIZE_OPTIONS.find((option) => option.value === value);

    if (!preset || value === "custom") {
      updatePage({ size: "custom" });
      return;
    }

    updatePage({
      size: preset.value,
      width: preset.width,
      height: preset.height,
    });
  }

  function addBlock(type: TemplateBlock["type"], field = "order.name") {
    const block = createTemplateBlock(
      type,
      field,
      design.blocks.length,
      design.page,
    );

    setDesign((current) => ({
      ...current,
      blocks: [...current.blocks, block],
    }));
    setEditingTextBlockId(type === "text" ? block.id : null);
    setEditingItemsBlockId(type === "items" ? block.id : null);
    setSelectedId(block.id);
  }

  function duplicateSelectedBlock() {
    if (!selectedBlock) {
      return;
    }

    const duplicate = normalizeBlockGeometry(
      {
        ...selectedBlock,
        id: `${selectedBlock.type}-${Date.now()}`,
        x: selectedBlock.x + 16,
        y: selectedBlock.y + 16,
      },
      design.page,
    );

    setDesign((current) => ({
      ...current,
      blocks: [...current.blocks, duplicate],
    }));
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setSelectedId(duplicate.id);
  }

  function removeSelectedBlock() {
    if (!selectedBlock) {
      return;
    }

    setDesign((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== selectedBlock.id),
    }));
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setSelectedId("");
  }

  function moveLayer(direction: -1 | 1) {
    if (selectedIndex < 0) {
      return;
    }

    const targetIndex = selectedIndex + direction;

    if (targetIndex < 0 || targetIndex >= design.blocks.length) {
      return;
    }

    setDesign((current) => {
      const blocks = [...current.blocks];
      const [block] = blocks.splice(selectedIndex, 1);

      blocks.splice(targetIndex, 0, block);

      return { ...current, blocks };
    });
  }

  function revertTemplate() {
    const nextDesign = copyDesign(template.design);

    setName(template.name);
    setDesign(nextDesign);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }

  function canvasPoint(event: PointerEvent) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / design.page.width || 1;

    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  }

  function startMove(
    event: PointerEvent<HTMLDivElement>,
    block: TemplateBlock,
  ) {
    const target = event.target as HTMLElement;

    if (
      target.dataset.resizeHandle ||
      target.closest("button, input, select, textarea")
    ) {
      return;
    }

    if (block.type === "text" && event.detail > 1) {
      setSelectedId(block.id);
      setEditingTextBlockId(block.id);
      setEditingItemsBlockId(null);
      event.preventDefault();
      return;
    }

    if (block.type === "items" && event.detail > 1) {
      setSelectedId(block.id);
      setEditingItemsBlockId(block.id);
      setEditingTextBlockId(null);
      event.preventDefault();
      return;
    }

    const point = canvasPoint(event);

    operationRef.current = {
      mode: "move",
      id: block.id,
      startX: point.x,
      startY: point.y,
      original: block,
    };
    setSelectedId(block.id);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startResize(
    event: PointerEvent<HTMLSpanElement>,
    block: TemplateBlock,
    handle: ResizeHandle,
  ) {
    const point = canvasPoint(event);

    operationRef.current = {
      mode: "resize",
      id: block.id,
      startX: point.x,
      startY: point.y,
      original: block,
      handle,
    };
    setSelectedId(block.id);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function updateCanvasOperation(event: PointerEvent<HTMLDivElement>) {
    const operation = operationRef.current;

    if (!operation) {
      return;
    }

    const point = canvasPoint(event);
    const deltaX = point.x - operation.startX;
    const deltaY = point.y - operation.startY;

    if (operation.mode === "move") {
      updateBlock(operation.id, {
        x: clamp(
          snapValue(operation.original.x + deltaX, snapToGrid),
          0,
          design.page.width - operation.original.w,
        ),
        y: clamp(
          snapValue(operation.original.y + deltaY, snapToGrid),
          0,
          design.page.height - operation.original.h,
        ),
      });
      return;
    }

    const resized = resizeBlock(
      operation.original,
      operation.handle,
      deltaX,
      deltaY,
      snapToGrid,
      design.page,
    );

    updateBlock(operation.id, resized);
  }

  function stopCanvasOperation() {
    operationRef.current = null;
  }

  function handleStageWheel(event: WheelEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (
      target.closest(
        "button, input, select, textarea, [contenteditable='true']",
      ) ||
      !target.closest(".template-canvas-space")
    ) {
      return;
    }

    event.preventDefault();
    setZoom((current) =>
      normalizeZoom(current + (event.deltaY < 0 ? 0.05 : -0.05)),
    );
  }

  function nudgeSelectedBlock(deltaX: number, deltaY: number) {
    if (!selectedBlock) {
      return;
    }

    updateBlock(selectedBlock.id, {
      x: selectedBlock.x + deltaX,
      y: selectedBlock.y + deltaY,
    });
  }

  function handleBlockKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? GRID_SIZE : 1;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeSelectedBlock(-step, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeSelectedBlock(step, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nudgeSelectedBlock(0, -step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudgeSelectedBlock(0, step);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelectedBlock();
    }
  }

  function insertFieldToken() {
    if (!selectedBlock || selectedBlock.type !== "text") {
      return;
    }

    const token = tokenForField(tokenField);
    const activeEditor = activeRichEditorRef.current;

    if (activeEditor?.dataset.blockId === selectedBlock.id) {
      activeEditor.focus();
      document.execCommand("insertText", false, token);
      syncRichTextElement(activeEditor, selectedBlock);
      return;
    }

    const nextHtml = `${textBlockHtml(selectedBlock)} ${escapeHtml(token)}`.trim();

    syncRichTextEditors(selectedBlock.id, nextHtml);
    updateBlock(selectedBlock.id, {
      text: `${selectedBlock.text || ""} ${token}`.trim(),
      textHtml: nextHtml,
    });
  }

  function syncRichTextEditors(
    blockId: string,
    html: string,
    source?: HTMLDivElement,
  ) {
    document
      .querySelectorAll<HTMLDivElement>("[data-template-rich-editor]")
      .forEach((editor) => {
        if (
          editor === source ||
          editor.dataset.templateRichEditor !== blockId
        ) {
          return;
        }

        if (editor.innerHTML !== html) {
          editor.innerHTML = html;
        }
      });
  }

  function syncRichTextElement(element: HTMLDivElement, block: TemplateBlock) {
    const html = sanitizeTemplateHtml(snapMentions(element.innerHTML));
    const text = htmlToPlainText(html);

    if (html !== element.innerHTML) {
      element.innerHTML = html;
    }

    syncRichTextEditors(block.id, html, element);
    updateBlock(block.id, { text, textHtml: html });
  }

  function handleRichTextKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    block: TemplateBlock,
  ) {
    if (event.key === "Escape") {
      setEditingTextBlockId(null);
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();
    document.execCommand("insertText", false, "  ");
    window.requestAnimationFrame(() => {
      syncRichTextElement(event.currentTarget, block);
    });
  }

  function handleRichTextInput(
    event: FormEvent<HTMLDivElement>,
    block: TemplateBlock,
  ) {
    activeRichEditorRef.current = event.currentTarget;
    rememberRichSelection(event.currentTarget);
    syncRichTextElement(event.currentTarget, block);
  }

  function rememberRichSelection(editor: HTMLDivElement) {
    const selection = window.getSelection();

    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      return;
    }

    activeRichEditorRef.current = editor;
    richSelectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreRichSelection(editor: HTMLDivElement) {
    const selection = window.getSelection();
    const range = richSelectionRef.current;

    if (!selection) {
      editor.focus();
      return;
    }

    if (!range || !editor.contains(range.commonAncestorContainer)) {
      const fallbackRange = document.createRange();

      fallbackRange.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(fallbackRange);
      editor.focus();
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
  }

  function applyRichTextCommand(command: string) {
    const block = selectedBlock;
    const editor = activeRichEditorRef.current || inspectorTextRef.current;

    if (!block || block.type !== "text" || !editor) {
      return;
    }

    restoreRichSelection(editor);
    document.execCommand(command, false);
    rememberRichSelection(editor);
    syncRichTextElement(editor, block);
  }

  function applyRichTextFontFamily(fontFamily: string) {
    if (!FONT_FAMILIES.some((font) => font.value === fontFamily)) {
      return;
    }

    wrapRichSelection({ fontFamily });
  }

  function applyRichTextFontSize(fontSize: string) {
    const size = clamp(Number(fontSize), 7, 72);

    if (!size) {
      return;
    }

    wrapRichSelection({ fontSize: `${size}px` });
  }

  function wrapRichSelection(style: Partial<CSSStyleDeclaration>, fallback = "") {
    const block = selectedBlock;
    const editor = activeRichEditorRef.current || inspectorTextRef.current;

    if (!block || block.type !== "text" || !editor) {
      return;
    }

    restoreRichSelection(editor);
    const selection = window.getSelection();

    if (!selection?.rangeCount) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    if (range.collapsed && fallback) {
      document.execCommand("insertText", false, fallback);
      rememberRichSelection(editor);
      syncRichTextElement(editor, block);
      return;
    }

    if (range.collapsed) {
      return;
    }

    const span = document.createElement("span");

    Object.assign(span.style, style);

    try {
      range.surroundContents(span);
    } catch {
      const contents = range.extractContents();

      span.appendChild(contents);
      range.insertNode(span);
    }

    selection.removeAllRanges();
    selection.selectAllChildren(span);
    rememberRichSelection(editor);
    syncRichTextElement(editor, block);
  }

  function openCanvasEditor(block: TemplateBlock) {
    setSelectedId(block.id);
    setEditingTextBlockId(block.type === "text" ? block.id : null);
    setEditingItemsBlockId(block.type === "items" ? block.id : null);
  }

  function updateItemColumnInBlock(
    block: TemplateBlock,
    key: ItemColumnKey,
    patch: Partial<ReturnType<typeof normalizeItemColumns>[number]>,
  ) {
    updateBlock(block.id, {
      itemColumns: normalizeItemColumns(block.itemColumns).map((column) =>
        column.key === key ? { ...column, ...patch } : column,
      ),
    });
  }

  function updateItemColumn(
    key: ItemColumnKey,
    patch: Partial<ReturnType<typeof normalizeItemColumns>[number]>,
  ) {
    if (!selectedBlock) {
      return;
    }

    updateItemColumnInBlock(selectedBlock, key, patch);
  }

  function toggleItemColumnInBlock(
    block: TemplateBlock,
    key: ItemColumnKey,
    enabled: boolean,
  ) {
    updateBlock(block.id, {
      itemColumns: normalizeItemColumns(block.itemColumns).map((column) =>
        column.key === key ? { ...column, enabled } : column,
      ),
      ...(key === "image" ? { showImages: enabled } : {}),
      ...(key === "sku" ? { showSku: enabled } : {}),
    });
  }

  function toggleItemColumn(key: ItemColumnKey, enabled: boolean) {
    if (!selectedBlock) {
      return;
    }

    toggleItemColumnInBlock(selectedBlock, key, enabled);
  }

  function moveItemColumnInBlock(
    block: TemplateBlock,
    key: ItemColumnKey,
    direction: -1 | 1,
  ) {
    const columns = normalizeItemColumns(block.itemColumns);
    const index = columns.findIndex((column) => column.key === key);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= columns.length) {
      return;
    }

    const next = [...columns];
    const [column] = next.splice(index, 1);

    next.splice(targetIndex, 0, column);
    updateBlock(block.id, { itemColumns: next });
  }

  function moveItemColumn(key: ItemColumnKey, direction: -1 | 1) {
    if (!selectedBlock) {
      return;
    }

    moveItemColumnInBlock(selectedBlock, key, direction);
  }

  return (
    <Form method="post" className="template-editor">
      <input type="hidden" name="intent" value="save-template" />
      <input
        type="hidden"
        name="templateDesign"
        value={JSON.stringify(design)}
      />
      <div className="template-topbar">
        <label>
          <span>Template name</span>
          <input
            name="templateName"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <div className="template-topbar-actions">
          <span className={dirty ? "template-state dirty" : "template-state"}>
            {dirty ? "Unsaved" : "Saved"}
          </span>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={revertTemplate}
          >
            <span aria-hidden="true">↶</span> Revert
          </button>
          <button
            type="submit"
            disabled={saving || !canSaveTemplate || !design.blocks.length}
          >
            <span aria-hidden="true">✓</span> Save
          </button>
        </div>
      </div>

      <div className="page-settings">
        <label>
          <span>Page size</span>
          <select
            value={design.page.size || "custom"}
            onChange={(event) => applyPageSize(event.currentTarget.value)}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Width</span>
          <input
            min="288"
            type="number"
            value={design.page.width}
            onChange={(event) =>
              updatePage({
                size: "custom",
                width: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        <label>
          <span>Height</span>
          <input
            min="288"
            type="number"
            value={design.page.height}
            onChange={(event) =>
              updatePage({
                size: "custom",
                height: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        {(
          ["marginTop", "marginRight", "marginBottom", "marginLeft"] as const
        ).map((key) => (
          <label key={key}>
            <span>{key.replace("margin", "")}</span>
            <input
              min="0"
              type="number"
              value={design.page[key] || 0}
              onChange={(event) =>
                updatePage({ [key]: Number(event.currentTarget.value) })
              }
            />
          </label>
        ))}
      </div>

      <div className="template-workspace">
        <aside className="template-sidebar">
          <div className="template-panel">
            <h3>Add block</h3>
            <div className="template-button-grid">
              <button type="button" onClick={() => addBlock("text")}>
                <span aria-hidden="true">T</span> Text
              </button>
              <button type="button" onClick={() => addBlock("image", "")}>
                <span aria-hidden="true">▧</span> Image
              </button>
              <button
                type="button"
                onClick={() => addBlock("image", "items.firstImage")}
              >
                <span aria-hidden="true">▣</span> Product image
              </button>
              <button type="button" onClick={() => addBlock("items")}>
                <span aria-hidden="true">▦</span> Items table
              </button>
            </div>
          </div>

          <div className="template-panel">
            <h3>Fields</h3>
            <div className="field-list">
              {TEMPLATE_FIELD_GROUPS.map((group) => (
                <div className="field-group" key={group.label}>
                  <strong>{group.label}</strong>
                  {group.fields.map((field) => (
                    <button
                      key={field.value}
                      type="button"
                      onClick={() => addBlock("field", field.value)}
                    >
                      {field.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="template-panel">
            <h3>Layers</h3>
            <div className="template-layer-list">
              {[...design.blocks].reverse().map((block) => (
                <button
                  className={block.id === selectedId ? "selected" : ""}
                  key={block.id}
                  type="button"
                  onClick={() => setSelectedId(block.id)}
                >
                  <span>{blockLabel(block)}</span>
                  <small>{blockTypeLabel(block)}</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="template-stage-column">
          <div className="template-toolbar">
            <label>
              <span>Zoom</span>
              <select
                value={zoom}
                onChange={(event) =>
                  setZoom(normalizeZoom(Number(event.currentTarget.value)))
                }
              >
                <option value={0.5}>50%</option>
                <option value={0.6}>60%</option>
                <option value={0.65}>65%</option>
                <option value={0.75}>75%</option>
                <option value={0.9}>90%</option>
                <option value={1}>100%</option>
              </select>
            </label>
            <label className="checkbox-row compact-checkbox">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(event) => setSnapToGrid(event.currentTarget.checked)}
              />
              <span>Snap</span>
            </label>
            <button
              type="button"
              disabled={!selectedBlock}
              onClick={duplicateSelectedBlock}
            >
              <span aria-hidden="true">⧉</span> Duplicate
            </button>
            <button
              type="button"
              disabled={selectedIndex <= 0}
              onClick={() => moveLayer(-1)}
            >
              <span aria-hidden="true">‹</span> Back
            </button>
            <button
              type="button"
              disabled={
                selectedIndex < 0 || selectedIndex >= design.blocks.length - 1
              }
              onClick={() => moveLayer(1)}
            >
              <span aria-hidden="true">›</span> Forward
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={!selectedBlock}
              onClick={removeSelectedBlock}
            >
              <span aria-hidden="true">×</span> Delete
            </button>
          </div>

          <div className="template-stage" onWheel={handleStageWheel}>
            <div
              className="template-canvas-space"
              style={{
                width: design.page.width * zoom,
                height: design.page.height * zoom,
              }}
            >
              <div
                className="template-canvas"
                onPointerCancel={stopCanvasOperation}
                onPointerMove={updateCanvasOperation}
                onPointerUp={stopCanvasOperation}
                ref={canvasRef}
                style={{
                  height: design.page.height,
                  transform: `scale(${zoom})`,
                  width: design.page.width,
                }}
              >
                <div
                  className="margin-guide"
                  style={{
                    bottom: design.page.marginBottom || 0,
                    left: design.page.marginLeft || 0,
                    right: design.page.marginRight || 0,
                    top: design.page.marginTop || 0,
                  }}
                />
                {design.blocks.map((block) => {
                  const selected = block.id === selectedId;
                  const editingText =
                    block.type === "text" && editingTextBlockId === block.id;
                  const editingItems =
                    block.type === "items" && editingItemsBlockId === block.id;

                  return (
                    <div
                      className={`template-block-preview ${
                        selected ? "selected" : ""
                      }`}
                      key={block.id}
                      onKeyDown={handleBlockKeyDown}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openCanvasEditor(block);
                      }}
                      onPointerDown={(event) => startMove(event, block)}
                      role="button"
                      style={previewStyle(block)}
                      tabIndex={0}
                    >
                      {editingText ? (
                        <RichTextBox
                          block={block}
                          className="template-inline-textarea"
                          editorRef={(element) => {
                            if (
                              !element &&
                              inlineTextRef.current &&
                              activeRichEditorRef.current ===
                                inlineTextRef.current
                            ) {
                              activeRichEditorRef.current = null;
                            }

                            inlineTextRef.current = element;
                          }}
                          onBlur={(element) => {
                            if (activeRichEditorRef.current === element) {
                              activeRichEditorRef.current = null;
                            }

                            setEditingTextBlockId(null);
                          }}
                          onFocus={(element) => {
                            activeRichEditorRef.current = element;
                            rememberRichSelection(element);
                          }}
                          onInput={handleRichTextInput}
                          onKeyDown={handleRichTextKeyDown}
                          onSelectionChange={rememberRichSelection}
                          style={richTextEditorStyle(block)}
                        />
                      ) : editingItems ? (
                        <div className="template-inline-table-editor">
                          <div className="inline-editor-heading">
                            Item table columns
                            <button
                              type="button"
                              onClick={() => setEditingItemsBlockId(null)}
                            >
                              Done
                            </button>
                          </div>
                          {normalizeItemColumns(block.itemColumns).map(
                            (column, index, columns) => (
                              <div
                                className="inline-table-column-row"
                                key={column.key}
                              >
                                <label className="checkbox-row compact-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={column.enabled}
                                    onKeyDown={(event) =>
                                      event.stopPropagation()
                                    }
                                    onChange={(event) =>
                                      toggleItemColumnInBlock(
                                        block,
                                        column.key,
                                        event.currentTarget.checked,
                                      )
                                    }
                                  />
                                  <span>{column.key}</span>
                                </label>
                                <input
                                  aria-label={`${column.key} label`}
                                  value={column.label}
                                  onKeyDown={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    updateItemColumnInBlock(block, column.key, {
                                      label: event.currentTarget.value,
                                    })
                                  }
                                />
                                <input
                                  aria-label={`${column.key} width`}
                                  min="32"
                                  type="number"
                                  value={column.width}
                                  onKeyDown={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    updateItemColumnInBlock(block, column.key, {
                                      width: Number(event.currentTarget.value),
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() =>
                                    moveItemColumnInBlock(block, column.key, -1)
                                  }
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  disabled={index === columns.length - 1}
                                  onClick={() =>
                                    moveItemColumnInBlock(block, column.key, 1)
                                  }
                                >
                                  Down
                                </button>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <TemplateBlockPreview block={block} />
                      )}
                      {selected &&
                      !editingText &&
                      !editingItems &&
                      (block.type === "text" || block.type === "items") ? (
                        <button
                          className="canvas-edit-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCanvasEditor(block);
                          }}
                        >
                          {block.type === "items" ? "Edit table" : "Edit text"}
                        </button>
                      ) : null}
                      {selected && !editingText && !editingItems
                        ? RESIZE_HANDLES.map((handle) => (
                            <span
                              className={`resize-handle ${handle}`}
                              data-resize-handle={handle}
                              key={handle}
                              onPointerDown={(event) =>
                                startResize(event, block, handle)
                              }
                            />
                          ))
                        : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="template-inspector">
          {selectedBlock ? (
            <>
              <div className="template-inspector-heading">
                <div>
                  <div className="field-label">Selected block</div>
                  <strong>{blockLabel(selectedBlock)}</strong>
                </div>
                <span>{blockTypeLabel(selectedBlock)}</span>
              </div>
              {selectedBlock.type === "field" ||
              selectedBlock.type === "image" ? (
                <label>
                  <span>Data field</span>
                  <select
                    value={selectedBlock.field || ""}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        field: event.currentTarget.value,
                        label:
                          fieldFor(event.currentTarget.value)?.label ||
                          selectedBlock.label,
                      })
                    }
                  >
                    {selectedBlock.type === "image" ? (
                      <option value="">Custom image URL</option>
                    ) : null}
                    {(selectedBlock.type === "image"
                      ? TEMPLATE_FIELDS.filter(
                          (field) => field.value === "items.firstImage",
                        )
                      : TEMPLATE_FIELDS
                    ).map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selectedBlock.type === "text" ? (
                <div className="rich-text-panel">
                  <span>Text</span>
                  <div className="rich-text-toolbar">
                    <button
                      type="button"
                      title="Bold selected text"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyRichTextCommand("bold")}
                    >
                      <strong>B</strong>
                    </button>
                    <button
                      type="button"
                      title="Italic selected text"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyRichTextCommand("italic")}
                    >
                      <em>I</em>
                    </button>
                    <button
                      type="button"
                      title="Underline selected text"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyRichTextCommand("underline")}
                    >
                      <span className="underline-icon">U</span>
                    </button>
                    <label>
                      <span>Font</span>
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          if (event.currentTarget.value) {
                            applyRichTextFontFamily(event.currentTarget.value);
                            event.currentTarget.value = "";
                          }
                        }}
                      >
                        <option value="">Font</option>
                        {FONT_FAMILIES.map((font) => (
                          <option key={font.value} value={font.value}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Color</span>
                      <input
                        type="color"
                        defaultValue="#111827"
                        onChange={(event) =>
                          wrapRichSelection({
                            color: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Size</span>
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          if (event.currentTarget.value) {
                            applyRichTextFontSize(event.currentTarget.value);
                            event.currentTarget.value = "";
                          }
                        }}
                      >
                        <option value="">Aa</option>
                        <option value="10">10</option>
                        <option value="12">12</option>
                        <option value="14">14</option>
                        <option value="16">16</option>
                        <option value="18">18</option>
                        <option value="22">22</option>
                        <option value="28">28</option>
                      </select>
                    </label>
                  </div>
                  <RichTextBox
                    block={selectedBlock}
                    className="template-rich-textbox"
                    editorRef={(element) => {
                      if (
                        !element &&
                        inspectorTextRef.current &&
                        activeRichEditorRef.current === inspectorTextRef.current
                      ) {
                        activeRichEditorRef.current = null;
                      }

                      inspectorTextRef.current = element;
                    }}
                    onFocus={(element) => {
                      activeRichEditorRef.current = element;
                      rememberRichSelection(element);
                    }}
                    onInput={handleRichTextInput}
                    onKeyDown={handleRichTextKeyDown}
                    onSelectionChange={rememberRichSelection}
                    style={richTextEditorStyle(selectedBlock)}
                  />
                </div>
              ) : null}
              {selectedBlock.type === "text" ? (
                <div className="token-inserter">
                  <select
                    value={tokenField}
                    onChange={(event) =>
                      setTokenField(event.currentTarget.value)
                    }
                  >
                    {TEMPLATE_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={insertFieldToken}>
                    Insert variable
                  </button>
                </div>
              ) : null}
              {selectedBlock.type === "image" ? (
                <label>
                  <span>Custom image URL</span>
                  <input
                    value={selectedBlock.imageUrl || ""}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        imageUrl: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              ) : null}
              {selectedBlock.type === "items" ? (
                <div className="item-column-editor">
                  <div className="field-label">Item columns</div>
                  <div className="item-column-list">
                    {selectedItemColumns.map((column, index, columns) => (
                      <div
                        className={
                          selectedItemColumn?.key === column.key
                            ? "item-column-pill selected"
                            : "item-column-pill"
                        }
                        key={column.key}
                      >
                        <input
                          aria-label={`Show ${column.key}`}
                          type="checkbox"
                          checked={column.enabled}
                          onChange={(event) =>
                            toggleItemColumn(
                              column.key,
                              event.currentTarget.checked,
                            )
                          }
                        />
                        <button
                          className="item-column-select"
                          type="button"
                          onClick={() => setSelectedItemColumnKey(column.key)}
                        >
                          <span>{column.label || column.key}</span>
                          <small>{column.width}px</small>
                        </button>
                        <span className="item-column-actions">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={(event) => {
                              event.stopPropagation();
                              moveItemColumn(column.key, -1);
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === columns.length - 1}
                            onClick={(event) => {
                              event.stopPropagation();
                              moveItemColumn(column.key, 1);
                            }}
                          >
                            ↓
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>

                  {selectedItemColumn ? (
                    <div className="item-column-detail">
                      <div className="field-label">
                        Editing {selectedItemColumn.key}
                      </div>
                      <label>
                        <span>Label</span>
                        <input
                          value={selectedItemColumn.label}
                          onChange={(event) =>
                            updateItemColumn(selectedItemColumn.key, {
                              label: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                      <div className="geometry-grid">
                        <label>
                          <span>Width</span>
                          <input
                            min="32"
                            type="number"
                            value={selectedItemColumn.width}
                            onChange={(event) =>
                              updateItemColumn(selectedItemColumn.key, {
                                width: Number(event.currentTarget.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Align</span>
                          <select
                            value={selectedItemColumn.align}
                            onChange={(event) =>
                              updateItemColumn(selectedItemColumn.key, {
                                align: event.currentTarget
                                  .value as EditorItemColumn["align"],
                              })
                            }
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </label>
                      </div>
                      <div className="item-style-grid">
                        <div>
                          <div className="field-label">Header text</div>
                          <div className="style-grid">
                            <label>
                              <span>Size</span>
                              <input
                                min="7"
                                type="number"
                                value={selectedItemColumn.labelFontSize}
                                onChange={(event) =>
                                  updateItemColumn(selectedItemColumn.key, {
                                    labelFontSize: Number(
                                      event.currentTarget.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span>Color</span>
                              <input
                                type="color"
                                value={selectedItemColumn.labelColor}
                                onChange={(event) =>
                                  updateItemColumn(selectedItemColumn.key, {
                                    labelColor: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                          <div className="format-button-row">
                            <button
                              aria-pressed={
                                selectedItemColumn.labelFontWeight === "700"
                              }
                              className={
                                selectedItemColumn.labelFontWeight === "700"
                                  ? "active"
                                  : ""
                              }
                              type="button"
                              onClick={() =>
                                updateItemColumn(selectedItemColumn.key, {
                                  labelFontWeight:
                                    selectedItemColumn.labelFontWeight === "700"
                                      ? "400"
                                      : "700",
                                })
                              }
                            >
                              B
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="field-label">Row text</div>
                          <div className="style-grid">
                            <label>
                              <span>Size</span>
                              <input
                                min="7"
                                type="number"
                                value={selectedItemColumn.valueFontSize}
                                onChange={(event) =>
                                  updateItemColumn(selectedItemColumn.key, {
                                    valueFontSize: Number(
                                      event.currentTarget.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              <span>Color</span>
                              <input
                                type="color"
                                value={selectedItemColumn.valueColor}
                                onChange={(event) =>
                                  updateItemColumn(selectedItemColumn.key, {
                                    valueColor: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                          <div className="format-button-row">
                            <button
                              aria-pressed={
                                selectedItemColumn.valueFontWeight === "700"
                              }
                              className={
                                selectedItemColumn.valueFontWeight === "700"
                                  ? "active"
                                  : ""
                              }
                              type="button"
                              onClick={() =>
                                updateItemColumn(selectedItemColumn.key, {
                                  valueFontWeight:
                                    selectedItemColumn.valueFontWeight === "700"
                                      ? "400"
                                      : "700",
                                })
                              }
                            >
                              B
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="geometry-grid">
                {(["x", "y", "w", "h"] as const).map((key) => (
                  <label key={key}>
                    <span>{key}</span>
                    <input
                      min="0"
                      type="number"
                      value={selectedBlock[key] || 0}
                      onChange={(event) =>
                        updateBlock(selectedBlock.id, {
                          [key]: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="typography-grid">
                <label className="wide-control">
                  <span>Font</span>
                  <select
                    value={selectedBlock.fontFamily || FONT_FAMILIES[0].value}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        fontFamily: event.currentTarget.value,
                      })
                    }
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Size</span>
                  <input
                    min="8"
                    type="number"
                    value={selectedBlock.fontSize || 12}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        fontSize: Number(event.currentTarget.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Line</span>
                  <input
                    max="2.4"
                    min="0.8"
                    step="0.1"
                    type="number"
                    value={selectedBlock.lineHeight || 1.4}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        lineHeight: Number(event.currentTarget.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Weight</span>
                  <select
                    value={selectedBlock.fontWeight || "400"}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        fontWeight: event.currentTarget.value,
                      })
                    }
                  >
                    <option value="400">Regular</option>
                    <option value="700">Bold</option>
                  </select>
                </label>
                <label>
                  <span>Align</span>
                  <select
                    value={selectedBlock.align || "left"}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        align: event.currentTarget
                          .value as TemplateBlock["align"],
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              </div>
              <div className="format-button-row">
                <button
                  aria-pressed={selectedBlock.fontWeight === "700"}
                  className={selectedBlock.fontWeight === "700" ? "active" : ""}
                  title="Bold"
                  type="button"
                  onClick={() =>
                    updateBlock(selectedBlock.id, {
                      fontWeight:
                        selectedBlock.fontWeight === "700" ? "400" : "700",
                    })
                  }
                >
                  B
                </button>
                <button
                  aria-pressed={selectedBlock.italic === true}
                  className={selectedBlock.italic ? "active" : ""}
                  title="Italic"
                  type="button"
                  onClick={() =>
                    updateBlock(selectedBlock.id, {
                      italic: selectedBlock.italic !== true,
                    })
                  }
                >
                  I
                </button>
                <button
                  aria-pressed={selectedBlock.underline === true}
                  className={selectedBlock.underline ? "active" : ""}
                  title="Underline"
                  type="button"
                  onClick={() =>
                    updateBlock(selectedBlock.id, {
                      underline: selectedBlock.underline !== true,
                    })
                  }
                >
                  U
                </button>
                <button
                  aria-pressed={selectedBlock.uppercase === true}
                  className={selectedBlock.uppercase ? "active" : ""}
                  title="Uppercase"
                  type="button"
                  onClick={() =>
                    updateBlock(selectedBlock.id, {
                      uppercase: selectedBlock.uppercase !== true,
                    })
                  }
                >
                  AA
                </button>
              </div>
              <div className="style-grid">
                <label>
                  <span>Text</span>
                  <input
                    type="color"
                    value={normalizeHex(selectedBlock.color, "#111827")}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        color: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Fill</span>
                  <input
                    disabled={selectedBlock.background === "transparent"}
                    type="color"
                    value={
                      selectedBlock.background === "transparent"
                        ? "#ffffff"
                        : normalizeHex(selectedBlock.background, "#ffffff")
                    }
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        background: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="option-grid">
                <label className="checkbox-row compact-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedBlock.background !== "transparent"}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        background: event.currentTarget.checked
                          ? "#ffffff"
                          : "transparent",
                      })
                    }
                  />
                  <span>Fill</span>
                </label>
                <label className="checkbox-row compact-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedBlock.border === true}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        border: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Border</span>
                </label>
              </div>
              <label>
                <span>Padding</span>
                <input
                  min="0"
                  type="number"
                  value={selectedBlock.padding || 0}
                  onChange={(event) =>
                    updateBlock(selectedBlock.id, {
                      padding: Number(event.currentTarget.value),
                    })
                  }
                />
              </label>
            </>
          ) : (
            <p className="empty-state">Select a block to edit it.</p>
          )}
        </div>
      </div>
    </Form>
  );
}

export default function OrderPrinterDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const defaultLocationId =
    data.rule?.locationId || data.locations[0]?.id || "";
  const defaultPrinterName =
    data.rule?.printerName || data.printers[0]?.name || "";
  const canSave = Boolean(defaultLocationId && defaultPrinterName);
  const [operationsHeight, setOperationsHeight] = useState(
    DEFAULT_OPERATIONS_HEIGHT,
  );
  const agentConfig = JSON.stringify(
    {
      appUrl: data.appUrl,
      token: data.agentToken,
      agentName: "COG shipping station",
      pollIntervalMs: 5000,
    },
    null,
    2,
  );

  function startOperationsResize(event: PointerEvent<HTMLButtonElement>) {
    const splitter = event.currentTarget;
    const body = splitter.parentElement;

    if (!body) {
      return;
    }

    const bodyRect = body.getBoundingClientRect();
    const maxHeight = Math.min(
      MAX_OPERATIONS_HEIGHT,
      Math.max(MIN_OPERATIONS_HEIGHT, bodyRect.height - 360),
    );

    function resize(moveEvent: globalThis.PointerEvent) {
      setOperationsHeight(
        clamp(
          moveEvent.clientY - bodyRect.top,
          MIN_OPERATIONS_HEIGHT,
          maxHeight,
        ),
      );
    }

    function stopResize(upEvent: globalThis.PointerEvent) {
      splitter.releasePointerCapture(upEvent.pointerId);
      splitter.removeEventListener("pointermove", resize);
      splitter.removeEventListener("pointerup", stopResize);
      splitter.removeEventListener("pointercancel", stopResize);
    }

    splitter.setPointerCapture(event.pointerId);
    splitter.addEventListener("pointermove", resize);
    splitter.addEventListener("pointerup", stopResize);
    splitter.addEventListener("pointercancel", stopResize);
    event.preventDefault();
  }

  return (
    <main className="order-printer-app">
      <header className="app-header">
        <div>
          <span className="app-kicker">Packing slips</span>
          <h1>COG Order Printer</h1>
        </div>
        {actionData ? (
          <div className={actionData.ok ? "notice success" : "notice error"}>
            {actionData.message}
          </div>
        ) : null}
      </header>

      <div
        className="app-body"
        style={
          { "--operations-height": `${operationsHeight}px` } as CSSProperties
        }
      >
        <aside className="app-sidebar">
          <section className="app-card">
            <div className="app-card-header">Automation rule</div>
            <Form method="post" className="settings-form">
              <input type="hidden" name="intent" value="save-rule" />
              <label>
                <span>Fulfillment location</span>
                <select name="locationId" defaultValue={defaultLocationId}>
                  {data.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Printer</span>
                <select name="printerName" defaultValue={defaultPrinterName}>
                  {data.printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.name}
                      {printer.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={data.rule?.enabled ?? true}
                />
                <span>Print new orders for this location</span>
              </label>
              <button type="submit" disabled={!canSave || saving}>
                Save settings
              </button>
            </Form>
            {!data.printers.length ? (
              <p className="empty-state">
                No printers have checked in yet. Start the local print agent,
                then reload this page.
              </p>
            ) : null}
          </section>

          <section className="app-card">
            <div className="app-card-header">Print agent</div>
            <div className="agent-grid">
              <div>
                <div className="field-label">Agent token</div>
                <code className="token">{data.agentToken}</code>
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="rotate-token" />
                <button type="submit" disabled={saving}>
                  Rotate token
                </button>
              </Form>
            </div>
            <div className="field-label">Agent config</div>
            <pre className="command">{agentConfig}</pre>
            <div className="printer-list">
              {data.printers.map((printer) => (
                <div className="printer-row" key={printer.name}>
                  <strong>{printer.name}</strong>
                  <span>{printer.agentName || "local agent"}</span>
                  <span>Last seen {formatDate(printer.lastSeenAt)}</span>
                </div>
              ))}
            </div>

            <div className="reprint-panel">
              <Form method="get" className="inline-action">
                <input type="hidden" name="reprint" value="1" />
                <button type="submit" disabled={saving || !data.rule?.enabled}>
                  Reprint Packing Slip
                </button>
              </Form>
              {data.showReprintOrders ? (
                data.reprintOrders.length ? (
                  <div className="job-table-wrap compact-reprint-table">
                    <table className="job-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Ship to</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.reprintOrders.map((order) => (
                          <tr key={order.id}>
                            <td>
                              <strong>{order.name}</strong>
                              <span className="job-error">
                                {order.fulfillmentOrderCount} open here
                              </span>
                            </td>
                            <td>{order.shipTo}</td>
                            <td>
                              <Form method="post">
                                <input
                                  type="hidden"
                                  name="intent"
                                  value="manual-reprint-order"
                                />
                                <input
                                  type="hidden"
                                  name="orderId"
                                  value={order.id}
                                />
                                <button type="submit" disabled={saving}>
                                  Print
                                </button>
                              </Form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-state">
                    No unfulfilled orders are currently assigned to this
                    location.
                  </p>
                )
              ) : null}
            </div>
          </section>

          <section className="app-card">
            <div className="app-card-header">Recent print jobs</div>
            {data.jobs.length ? (
              <div className="job-table-wrap">
                <table className="job-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Location</th>
                      <th>Printer</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <strong>{job.orderName}</strong>
                          {job.lastError ? (
                            <span className="job-error">{job.lastError}</span>
                          ) : null}
                        </td>
                        <td>{job.locationName}</td>
                        <td>{job.printerName}</td>
                        <td>
                          <span
                            className={`status ${job.status.toLowerCase()}`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td>{formatDate(job.createdAt)}</td>
                        <td>
                          {job.status === "FAILED" ? (
                            <Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value="retry-job"
                              />
                              <input
                                type="hidden"
                                name="jobId"
                                value={job.id}
                              />
                              <button type="submit" disabled={saving}>
                                Retry
                              </button>
                            </Form>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">No print jobs have been queued yet.</p>
            )}
          </section>
        </aside>

        <button
          aria-label="Resize operations section"
          className="app-horizontal-splitter"
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setOperationsHeight((current) =>
                clamp(current - 24, MIN_OPERATIONS_HEIGHT, MAX_OPERATIONS_HEIGHT),
              );
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setOperationsHeight((current) =>
                clamp(current + 24, MIN_OPERATIONS_HEIGHT, MAX_OPERATIONS_HEIGHT),
              );
            }
          }}
          onPointerDown={startOperationsResize}
          type="button"
        />

        <section className="template-app-panel">
          <TemplateDesigner
            canSaveTemplate={Boolean(data.rule)}
            template={data.template}
            saving={saving}
          />
        </section>
      </div>
    </main>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
