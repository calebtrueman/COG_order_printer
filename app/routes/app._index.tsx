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
  deletePrintTemplate,
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
type AppTab = "template" | "operations";
type OperationsTab = "rule" | "agent" | "jobs";
const PAGE_SIZE_OPTIONS = [
  { value: "letter", label: "Letter", width: 816, height: 1056 },
  { value: "a4", label: "A4", width: 794, height: 1123 },
  { value: "label-4x6", label: "4 x 6 Label", width: 384, height: 576 },
  { value: "custom", label: "Custom", width: 816, height: 1056 },
];
const FONT_FAMILIES = [
  { label: "Inter", value: "Inter, Arial, sans-serif" },
  { label: "Roboto", value: "Roboto, Arial, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', Arial, sans-serif" },
  { label: "Lato", value: "Lato, Arial, sans-serif" },
  { label: "Montserrat", value: "Montserrat, Arial, sans-serif" },
  { label: "Poppins", value: "Poppins, Arial, sans-serif" },
  { label: "Nunito Sans", value: "'Nunito Sans', Arial, sans-serif" },
  { label: "Source Sans 3", value: "'Source Sans 3', Arial, sans-serif" },
  { label: "Work Sans", value: "'Work Sans', Arial, sans-serif" },
  { label: "Noto Sans", value: "'Noto Sans', Arial, sans-serif" },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Playfair Display", value: "'Playfair Display', Georgia, serif" },
  { label: "Roboto Slab", value: "'Roboto Slab', Georgia, serif" },
  { label: "Oswald", value: "Oswald, Arial, sans-serif" },
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
type RichTextSelection = {
  blockId: string;
  start: number;
  end: number;
  tokenIndex?: number;
};
type MentionMenuState = {
  blockId: string;
  query: string;
  left: number;
  top: number;
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

    if (intent === "delete-template") {
      await deletePrintTemplate(session.shop, formData);
      return {
        ok: true,
        message: "Packing slip template deleted.",
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
  const stepped = Math.round(value / 0.05) * 0.05;

  return clampFloat(stepped, MIN_TEMPLATE_ZOOM, MAX_TEMPLATE_ZOOM);
}

function nearestOption(value: number, options: number[]) {
  return options.reduce((nearest, option) =>
    Math.abs(option - value) < Math.abs(nearest - value) ? option : nearest,
  );
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
const MOVE_CORNER_SIZE = 28;
const ZOOM_OPTIONS = Array.from(
  {
    length: Math.round((MAX_TEMPLATE_ZOOM - MIN_TEMPLATE_ZOOM) / 0.05) + 1,
  },
  (_item, index) => normalizeZoom(MIN_TEMPLATE_ZOOM + index * 0.05),
);
const LINE_HEIGHT_OPTIONS = [0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2, 2.25];
const RICH_TEXT_SIZE_OPTIONS = Array.from(
  { length: 65 },
  (_item, index) => index + 8,
);

function normalizeLineHeight(
  value: number | string | undefined,
  fallback = 1.4,
) {
  const numericValue = Number(value);
  const bounded = clampFloat(
    Number.isFinite(numericValue) ? numericValue : fallback,
    0.8,
    2.4,
  );

  return nearestOption(bounded, LINE_HEIGHT_OPTIONS);
}

type TextFormatState = {
  blockId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  color: string;
  fontWeight: "400" | "700";
  italic: boolean;
  underline: boolean;
};

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

function decodeHtmlText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function plainTextToHtml(value: string | undefined) {
  return escapeHtml(String(value || "")).replace(/\r?\n/g, "<br>");
}

function htmlToPlainText(value: string | undefined) {
  return decodeHtmlText(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
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

      if (name === "line-height") {
        const lineHeight = Number.parseFloat(styleValue);

        if (
          Number.isFinite(lineHeight) &&
          lineHeight >= 0.8 &&
          lineHeight <= 2.4
        ) {
          return `${name}:${normalizeLineHeight(lineHeight)}`;
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

function textBlockHtml(block: TemplateBlock) {
  return sanitizeTemplateHtml(block.textHtml || plainTextToHtml(block.text));
}

function snapMentions(value: string) {
  return TEMPLATE_FIELDS.reduce((current, field) => {
    const pattern = new RegExp(
      `@@${escapeRegExp(field.label)}(?=$|\\s|[.,;:)])`,
      "gi",
    );

    return current.replace(pattern, tokenForField(field.value));
  }, value);
}

function editorTokenHtml(field: TemplateField) {
  const token = tokenForField(field.value);

  return `<span class="editor-variable-token" data-template-token="${escapeHtml(
    token,
  )}" contenteditable="false">${escapeHtml(field.label)}</span>`;
}

function templateHtmlToEditorHtml(value: string) {
  return sanitizeTemplateHtml(value).replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (token, fieldValue) => {
      const field = fieldFor(fieldValue);

      if (!field) {
        return escapeHtml(token);
      }

      return editorTokenHtml(field);
    },
  );
}

function editorElementToTemplateHtml(editor: HTMLDivElement) {
  const clone = editor.cloneNode(true) as HTMLDivElement;

  clone
    .querySelectorAll<HTMLElement>("[data-template-token]")
    .forEach((token) => {
      const templateToken = token.dataset.templateToken || "";
      const style = sanitizedInlineStyle(token.getAttribute("style") || "");

      if (style) {
        const wrapper = document.createElement("span");

        wrapper.setAttribute("style", style);
        wrapper.textContent = templateToken;
        token.replaceWith(wrapper);
        return;
      }

      token.replaceWith(document.createTextNode(templateToken));
    });

  return sanitizeTemplateHtml(snapMentions(clone.innerHTML));
}

function mentionMatches(query: string, limit = 8) {
  const normalizedQuery = query.trim().toLowerCase();

  return TEMPLATE_FIELDS.map((field) => {
    const label = field.label.toLowerCase();
    const value = field.value.toLowerCase();
    const sample = field.sample.toLowerCase();
    let rank = 999;

    if (!normalizedQuery) {
      rank = 10;
    } else if (label === normalizedQuery || value === normalizedQuery) {
      rank = 0;
    } else if (label.startsWith(normalizedQuery)) {
      rank = 1;
    } else if (value.startsWith(normalizedQuery)) {
      rank = 2;
    } else if (label.includes(normalizedQuery)) {
      rank = 3;
    } else if (
      value.includes(normalizedQuery) ||
      sample.includes(normalizedQuery)
    ) {
      rank = 4;
    }

    return { field, rank };
  })
    .filter((match) => match.rank < 999)
    .sort(
      (a, b) => a.rank - b.rank || a.field.label.localeCompare(b.field.label),
    )
    .slice(0, limit)
    .map((match) => match.field);
}

function exactMentionField(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return null;
  }

  return (
    TEMPLATE_FIELDS.find(
      (field) =>
        field.label.toLowerCase() === normalizedQuery ||
        field.value.toLowerCase() === normalizedQuery,
    ) || null
  );
}

function currentMentionRange(editor: HTMLDivElement) {
  const offsets = editorSelectionOffsets(editor);

  if (!offsets || offsets.start !== offsets.end) {
    return null;
  }

  const beforeCaret = (editor.textContent || "").slice(0, offsets.start);
  const match = beforeCaret.match(/(^|[\s])@@([^\n@]{0,80})$/);

  if (!match) {
    return null;
  }

  return {
    start: offsets.start - match[0].length + match[1].length,
    end: offsets.start,
    query: match[2],
  };
}

function richTextPreview(block: TemplateBlock) {
  return (
    <div
      className="template-rich-preview"
      dangerouslySetInnerHTML={{
        __html: templateHtmlToEditorHtml(textBlockHtml(block)),
      }}
    />
  );
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

function fontSignature(value: string | undefined) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeFontFamily(value: string | undefined) {
  return (
    FONT_FAMILIES.find((font) => font.value === value)?.value ||
    FONT_FAMILIES[0]?.value ||
    "Arial, Helvetica, sans-serif"
  );
}

function canonicalFontFamily(value: string | undefined) {
  const signature = fontSignature(value);
  const matchingFont = FONT_FAMILIES.find(
    (font) => fontSignature(font.value) === signature,
  );

  return matchingFont?.value || normalizeFontFamily(value);
}

function cssColorToHex(value: string | undefined, fallback: string) {
  if (normalizeHex(value, "")) {
    return value as string;
  }

  const match = String(value || "").match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i,
  );

  if (!match) {
    return normalizeHex(fallback, "#111827");
  }

  return `#${match
    .slice(1, 4)
    .map((part) =>
      Math.max(0, Math.min(255, Number(part)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function styleDeclarationForTokenStyle(style: CSSStyleDeclaration) {
  const fontSize = Number.parseFloat(style.fontSize) || 12;
  const lineHeight = Number.parseFloat(style.lineHeight);

  return {
    fontFamily: canonicalFontFamily(style.fontFamily),
    fontSize: `${clamp(fontSize, 8, 72)}px`,
    fontWeight:
      style.fontWeight === "bold" ||
      Number.parseInt(style.fontWeight, 10) >= 600
        ? "700"
        : "400",
    fontStyle: style.fontStyle === "italic" ? "italic" : "normal",
    lineHeight: String(
      normalizeLineHeight(
        Number.isFinite(lineHeight) ? lineHeight / fontSize : undefined,
      ),
    ),
    textDecoration:
      style.textDecorationLine.includes("underline") ||
      style.textDecoration.includes("underline")
        ? "underline"
        : "none",
    color: cssColorToHex(style.color, "#111827"),
  };
}

function applyTokenStyleFromElement(token: HTMLElement, source: Element) {
  Object.assign(
    token.style,
    styleDeclarationForTokenStyle(getComputedStyle(source)),
  );
}

function materializeVariableTokenStyles(editor: HTMLDivElement) {
  editor
    .querySelectorAll<HTMLElement>("[data-template-token]")
    .forEach((token) => {
      if (token.getAttribute("style")) {
        return;
      }

      applyTokenStyleFromElement(token, token);
    });
}

function textFormatFromBlock(block: TemplateBlock): TextFormatState {
  return {
    blockId: block.id,
    fontFamily: normalizeFontFamily(block.fontFamily),
    fontSize: clamp(Number(block.fontSize) || 12, 8, 72),
    lineHeight: normalizeLineHeight(block.lineHeight),
    color: normalizeHex(block.color, "#111827"),
    fontWeight: block.fontWeight === "700" ? "700" : "400",
    italic: block.italic === true,
    underline: block.underline === true,
  };
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
    lineHeight: normalizeLineHeight(block.lineHeight),
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
    lineHeight: normalizeLineHeight(block.lineHeight),
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
    lineHeight: normalizeLineHeight(block.lineHeight),
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
      text: "",
      textHtml: "",
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
  if (key === "checkbox") {
    return <span className="sample-line-checkbox" />;
  }

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

  return (
    <span className="variable-chip">
      {fieldFor(block.field)?.label || block.field || "Field"}
    </span>
  );
}

function editorSelectionOffsets(editor: HTMLDivElement) {
  const selection = window.getSelection();

  if (!selection?.rangeCount) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!editor.contains(range.commonAncestorContainer)) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(editor);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = range.cloneRange();
  endRange.selectNodeContents(editor);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
}

function selectedStyleElement(editor: HTMLDivElement) {
  const selection = window.getSelection();

  if (!selection?.rangeCount) {
    return editor;
  }

  const range = selection.getRangeAt(0);
  const token = selectedTokenElement(editor, range);

  if (token) {
    return token;
  }

  if (!editor.contains(range.commonAncestorContainer)) {
    return editor;
  }

  let node = range.startContainer;

  if (node === editor) {
    node =
      editor.childNodes[
        Math.min(range.startOffset, editor.childNodes.length - 1)
      ] || editor;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return (node.parentElement || editor) as HTMLElement;
  }

  return (
    (node as HTMLElement).closest?.(
      "[data-template-token], span, b, strong, i, em, u",
    ) ||
    (node as HTMLElement) ||
    editor
  );
}

function selectedTokenElement(editor: HTMLDivElement, range?: Range) {
  const selection = window.getSelection();
  const selectedRange =
    range || (selection?.rangeCount ? selection.getRangeAt(0) : null);

  if (
    !selectedRange ||
    !editor.contains(selectedRange.commonAncestorContainer)
  ) {
    return null;
  }

  const directNode =
    selectedRange.startContainer === editor
      ? editor.childNodes[selectedRange.startOffset] || null
      : selectedRange.startContainer;
  const element =
    directNode instanceof HTMLElement
      ? directNode
      : directNode?.parentElement || null;
  const closestToken = element?.closest<HTMLElement>("[data-template-token]");

  if (closestToken && editor.contains(closestToken)) {
    return closestToken;
  }

  const contents = selectedRange.cloneContents();
  const selectedToken = contents.querySelector?.("[data-template-token]");

  if (!selectedToken) {
    return null;
  }

  const tokenValue = selectedToken.getAttribute("data-template-token");

  return (
    Array.from(
      editor.querySelectorAll<HTMLElement>("[data-template-token]"),
    ).find((token) => token.dataset.templateToken === tokenValue) || null
  );
}

function textFormatFromEditorSelection(
  editor: HTMLDivElement,
  block: TemplateBlock,
): TextFormatState {
  const element = selectedStyleElement(editor);
  const computed = window.getComputedStyle(element);
  const fontWeight = Number.parseInt(computed.fontWeight, 10);
  const selectedFontSize =
    Math.round(Number.parseFloat(computed.fontSize)) ||
    Number(block.fontSize) ||
    12;
  const selectedLineHeight = Number.parseFloat(computed.lineHeight);

  return {
    blockId: block.id,
    fontFamily: canonicalFontFamily(computed.fontFamily || block.fontFamily),
    fontSize: clamp(selectedFontSize, 8, 72),
    lineHeight: normalizeLineHeight(
      Number.isFinite(selectedLineHeight)
        ? selectedLineHeight / selectedFontSize
        : block.lineHeight,
    ),
    color: cssColorToHex(computed.color, block.color || "#111827"),
    fontWeight:
      computed.fontWeight === "bold" || fontWeight >= 600 ? "700" : "400",
    italic: computed.fontStyle === "italic",
    underline:
      computed.textDecorationLine.includes("underline") ||
      computed.textDecoration.includes("underline"),
  };
}

function textNodeAtOffset(editor: HTMLDivElement, offset: number) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  let lastTextNode: Text | null = null;

  while (node) {
    const textNode = node as Text;
    const length = textNode.textContent?.length || 0;

    lastTextNode = textNode;

    if (remaining <= length) {
      return { node: textNode, offset: remaining };
    }

    remaining -= length;
    node = walker.nextNode();
  }

  if (lastTextNode) {
    return {
      node: lastTextNode,
      offset: lastTextNode.textContent?.length || 0,
    };
  }

  return null;
}

function restoreEditorSelection(
  editor: HTMLDivElement,
  selectionOffsets: { start: number; end: number },
) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const start = textNodeAtOffset(editor, selectionOffsets.start);
  const end = textNodeAtOffset(editor, selectionOffsets.end);
  const range = document.createRange();

  if (!start || !end) {
    range.selectNodeContents(editor);
    range.collapse(false);
  } else {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function selectVariableToken(editor: HTMLDivElement, token: HTMLElement) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNode(token);
  selection.removeAllRanges();
  selection.addRange(range);
}

function variableTokenIndex(editor: HTMLDivElement, token: HTMLElement | null) {
  if (!token) {
    return undefined;
  }

  const index = Array.from(
    editor.querySelectorAll<HTMLElement>("[data-template-token]"),
  ).indexOf(token);

  return index >= 0 ? index : undefined;
}

function setEditorHtml(editor: HTMLDivElement, html: string) {
  const offsets =
    document.activeElement === editor ? editorSelectionOffsets(editor) : null;

  editor.innerHTML = html;

  if (offsets) {
    restoreEditorSelection(editor, offsets);
  }
}

function selectEditorContents(editor: HTMLDivElement) {
  const selection = window.getSelection();

  if (!selection) {
    return null;
  }

  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);

  return range;
}

function collapseEditorSelectionToEnd(editor: HTMLDivElement) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
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
  const currentHtml = templateHtmlToEditorHtml(textBlockHtml(block));

  useEffect(() => {
    const element = localRef.current;

    if (!element) {
      return;
    }

    if (document.activeElement === element) {
      return;
    }

    if (element.innerHTML !== currentHtml) {
      setEditorHtml(element, currentHtml);
      materializeVariableTokenStyles(element);
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
      onClick={(event) => {
        const token = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-template-token]",
        );

        event.stopPropagation();

        if (token && event.currentTarget.contains(token)) {
          selectVariableToken(event.currentTarget, token);
          onSelectionChange?.(event.currentTarget, block);
        }
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onFocus={(event) => onFocus?.(event.currentTarget, block)}
      onInput={(event) => onInput(event, block)}
      onKeyUp={(event) => onSelectionChange?.(event.currentTarget, block)}
      onKeyDown={(event) => onKeyDown(event, block)}
      onMouseUp={(event) => onSelectionChange?.(event.currentTarget, block)}
      onPointerDown={(event) => event.stopPropagation()}
      ref={(element) => {
        localRef.current = element;
        if (element && !element.innerHTML) {
          element.innerHTML = currentHtml;
          materializeVariableTokenStyles(element);
        }
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
  templates,
  saving,
  canSaveTemplate,
}: {
  template: { name: string; design: TemplateDesign };
  templates: { name: string; design: TemplateDesign }[];
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
  const [mentionMenu, setMentionMenu] = useState<MentionMenuState | null>(null);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [activeTextFormat, setActiveTextFormat] =
    useState<TextFormatState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const inlineTextRef = useRef<HTMLDivElement | null>(null);
  const inspectorTextRef = useRef<HTMLDivElement | null>(null);
  const activeRichEditorRef = useRef<HTMLDivElement | null>(null);
  const richSelectionRef = useRef<RichTextSelection | null>(null);
  const operationRef = useRef<CanvasOperation | null>(null);
  const blockClipboardRef = useRef<TemplateBlock | null>(null);
  const designHistoryRef = useRef<string[]>([]);
  const designFutureRef = useRef<string[]>([]);
  const applyingHistoryRef = useRef(false);
  const lastDesignJsonRef = useRef(JSON.stringify(copyDesign(template.design)));
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
    selectedItemColumns.find(
      (column) => column.key === selectedItemColumnKey,
    ) ||
    selectedItemColumns.find((column) => column.enabled) ||
    selectedItemColumns[0] ||
    null;
  const dirty =
    name !== template.name ||
    JSON.stringify(design) !== JSON.stringify(template.design);
  const toolbarTextFormat =
    activeTextFormat?.blockId === selectedBlock?.id
      ? activeTextFormat
      : selectedBlock
        ? textFormatFromBlock(selectedBlock)
        : null;

  useEffect(() => {
    const nextDesign = copyDesign(template.design);
    const nextDesignJson = JSON.stringify(nextDesign);

    lastDesignJsonRef.current = nextDesignJson;
    designHistoryRef.current = [];
    designFutureRef.current = [];
    applyingHistoryRef.current = false;
    setName(template.name);
    setDesign(nextDesign);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setMentionMenu(null);
    setActiveTextFormat(null);
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }, [template.design, template.name]);

  useEffect(() => {
    const nextDesignJson = JSON.stringify(design);

    if (nextDesignJson === lastDesignJsonRef.current) {
      return;
    }

    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      lastDesignJsonRef.current = nextDesignJson;
      return;
    }

    designHistoryRef.current = [
      ...designHistoryRef.current.slice(-79),
      lastDesignJsonRef.current,
    ];
    designFutureRef.current = [];
    lastDesignJsonRef.current = nextDesignJson;
  }, [design]);

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
      !selectedItemColumns.some(
        (column) => column.key === selectedItemColumnKey,
      )
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

  function addTextBlockWithField(field: TemplateField) {
    const token = tokenForField(field.value);
    const block = normalizeBlockGeometry(
      {
        ...createTemplateBlock(
          "text",
          field.value,
          design.blocks.length,
          design.page,
        ),
        text: token,
        textHtml: escapeHtml(token),
      },
      design.page,
    );

    setDesign((current) => ({
      ...current,
      blocks: [...current.blocks, block],
    }));
    setEditingTextBlockId(block.id);
    setEditingItemsBlockId(null);
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

    lastDesignJsonRef.current = JSON.stringify(nextDesign);
    designHistoryRef.current = [];
    designFutureRef.current = [];
    applyingHistoryRef.current = false;
    setName(template.name);
    setDesign(nextDesign);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setMentionMenu(null);
    setActiveTextFormat(null);
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }

  function selectTemplate(templateName: string) {
    const selectedTemplate = templates.find(
      (item) => item.name === templateName,
    );

    if (!selectedTemplate) {
      return;
    }

    const nextDesign = copyDesign(selectedTemplate.design);

    lastDesignJsonRef.current = JSON.stringify(nextDesign);
    designHistoryRef.current = [];
    designFutureRef.current = [];
    applyingHistoryRef.current = false;
    setName(selectedTemplate.name);
    setDesign(nextDesign);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setMentionMenu(null);
    setActiveTextFormat(null);
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }

  function uniqueTemplateName(baseName = "New packing slip") {
    const existingNames = new Set(
      templates.map((item) => item.name.trim().toLowerCase()),
    );

    if (!existingNames.has(baseName.toLowerCase())) {
      return baseName;
    }

    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${baseName} ${index}`;

      if (!existingNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    return `${baseName} ${Date.now()}`;
  }

  function createNewTemplate() {
    const nextName = window
      .prompt("New template name", uniqueTemplateName())
      ?.trim();

    if (!nextName) {
      return;
    }

    const existingTemplate = templates.find(
      (item) => item.name.toLowerCase() === nextName.toLowerCase(),
    );

    if (existingTemplate) {
      selectTemplate(existingTemplate.name);
      return;
    }

    const nextDesign = copyDesign(design);

    designHistoryRef.current = [];
    designFutureRef.current = [];
    applyingHistoryRef.current = false;
    lastDesignJsonRef.current = JSON.stringify(nextDesign);
    setName(nextName);
    setDesign(nextDesign);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setMentionMenu(null);
    setActiveTextFormat(null);
    activeRichEditorRef.current = null;
    richSelectionRef.current = null;
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }

  function clearCanvasSelection() {
    setSelectedId("");
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setMentionMenu(null);
    setActiveTextFormat(null);
    activeRichEditorRef.current = null;
    richSelectionRef.current = null;
    window.getSelection()?.removeAllRanges();
  }

  function handleStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target.closest(".template-block-preview")) {
      return;
    }

    clearCanvasSelection();
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
    const blockRect = event.currentTarget.getBoundingClientRect();
    const usingMoveCorner =
      block.id === selectedId &&
      event.clientX - blockRect.left <= MOVE_CORNER_SIZE &&
      event.clientY - blockRect.top <= MOVE_CORNER_SIZE;

    if (
      !usingMoveCorner &&
      (target.dataset.resizeHandle ||
        target.closest(
          "button, input, select, textarea, [contenteditable='true']",
        ))
    ) {
      return;
    }

    if (!usingMoveCorner && block.type === "text" && event.detail > 1) {
      setSelectedId(block.id);
      setEditingTextBlockId(block.id);
      setEditingItemsBlockId(null);
      event.preventDefault();
      return;
    }

    if (!usingMoveCorner && block.type === "items" && event.detail > 1) {
      setSelectedId(block.id);
      setEditingItemsBlockId(block.id);
      setEditingTextBlockId(null);
      event.preventDefault();
      return;
    }

    setSelectedId(block.id);

    if (!usingMoveCorner) {
      setEditingTextBlockId(null);
      setEditingItemsBlockId(null);
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
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
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
    const target = event.target as HTMLElement;

    if (target.closest("input, select, textarea, [contenteditable='true']")) {
      return;
    }

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
    } else if (event.key === "Delete") {
      event.preventDefault();
      removeSelectedBlock();
    }
  }

  function insertFieldToken() {
    const field = fieldFor(tokenField);

    if (!field) {
      return;
    }

    const activeEditor = usableRichEditor();
    const activeBlock = activeEditor
      ? design.blocks.find((block) => block.id === activeEditor.dataset.blockId)
      : null;

    if (activeEditor?.isConnected && activeBlock?.type === "text") {
      insertVariableField(activeEditor, activeBlock, field, {
        replaceMention: false,
      });
      return;
    }

    if (!selectedBlock || selectedBlock.type !== "text") {
      addTextBlockWithField(field);
      return;
    }

    const token = tokenForField(field.value);
    const nextHtml =
      `${textBlockHtml(selectedBlock)} ${escapeHtml(token)}`.trim();

    syncRichTextEditors(selectedBlock.id, nextHtml);
    updateBlock(selectedBlock.id, {
      text: `${selectedBlock.text || ""} ${token}`.trim(),
      textHtml: nextHtml,
    });
  }

  function variableTokenElement(field: TemplateField, source?: Element | null) {
    const token = document.createElement("span");

    token.className = "editor-variable-token";
    token.dataset.templateToken = tokenForField(field.value);
    token.contentEditable = "false";
    token.textContent = field.label;

    if (source) {
      applyTokenStyleFromElement(token, source);
    }

    return token;
  }

  function restoreRichInsertionPoint(editor: HTMLDivElement) {
    const savedSelection = richSelectionRef.current;

    editor.focus();

    if (savedSelection && savedSelection.blockId === editor.dataset.blockId) {
      restoreEditorSelection(editor, savedSelection);
      return;
    }

    collapseEditorSelectionToEnd(editor);
  }

  function insertVariableField(
    editor: HTMLDivElement,
    block: TemplateBlock,
    field: TemplateField,
    options: { replaceMention: boolean },
  ) {
    restoreRichInsertionPoint(editor);

    if (options.replaceMention) {
      const mentionRange = currentMentionRange(editor);

      if (mentionRange) {
        restoreEditorSelection(editor, {
          start: mentionRange.start,
          end: mentionRange.end,
        });
      }
    }

    const selection = window.getSelection();

    if (!selection?.rangeCount) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    const token = variableTokenElement(field, selectedStyleElement(editor));
    const spacer = document.createTextNode(" ");

    range.deleteContents();
    range.insertNode(spacer);
    range.insertNode(token);
    range.setStart(spacer, spacer.textContent?.length || 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    rememberRichSelection(editor);
    syncRichTextElement(editor, block);
    setMentionMenu(null);
  }

  function syncRichTextEditors(
    blockId: string,
    html: string,
    source?: HTMLDivElement,
  ) {
    const editorHtml = templateHtmlToEditorHtml(html);

    document
      .querySelectorAll<HTMLDivElement>("[data-template-rich-editor]")
      .forEach((editor) => {
        if (
          editor === source ||
          editor.dataset.templateRichEditor !== blockId
        ) {
          return;
        }

        if (editor.innerHTML !== editorHtml) {
          setEditorHtml(editor, editorHtml);
          materializeVariableTokenStyles(editor);
        }
      });
  }

  function syncRichTextElement(element: HTMLDivElement, block: TemplateBlock) {
    const html = editorElementToTemplateHtml(element);
    const text = htmlToPlainText(html);
    const patch: Partial<TemplateBlock> = { text, textHtml: html };

    syncRichTextEditors(block.id, html, element);

    if (element.classList.contains("template-inline-textarea")) {
      const nextHeight = Math.ceil(
        element.scrollHeight + (block.padding || 0) * 2 + 2,
      );

      if (nextHeight > block.h) {
        patch.h = nextHeight;
      }
    }

    updateBlock(block.id, patch);
  }

  function handleRichTextKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    block: TemplateBlock,
  ) {
    event.stopPropagation();

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      return;
    }

    if (event.key === "Escape") {
      if (mentionMenu?.blockId === block.id) {
        event.preventDefault();
        setMentionMenu(null);
        return;
      }

      setEditingTextBlockId(null);
      return;
    }

    if (mentionMenu?.blockId === block.id) {
      if (event.key === "Enter" || event.key === "Tab") {
        const field = mentionMatches(mentionMenu.query)[0];

        if (field) {
          event.preventDefault();
          insertVariableField(event.currentTarget, block, field, {
            replaceMention: true,
          });
          return;
        }
      }
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
    window.requestAnimationFrame(() => {
      updateMentionMenu(event.currentTarget, block);
    });
  }

  function updateMentionMenu(editor: HTMLDivElement, block: TemplateBlock) {
    const mentionRange = currentMentionRange(editor);

    if (!mentionRange) {
      setMentionMenu((current) =>
        current?.blockId === block.id ? null : current,
      );
      return;
    }

    const exactMatch = exactMentionField(mentionRange.query);

    if (exactMatch) {
      insertVariableField(editor, block, exactMatch, { replaceMention: true });
      return;
    }

    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    const fallbackRect = editor.getBoundingClientRect();

    setMentionMenu({
      blockId: block.id,
      query: mentionRange.query,
      left: rect?.left || fallbackRect.left,
      top: (rect?.bottom || fallbackRect.bottom) + 6,
    });
  }

  function rememberRichSelection(editor: HTMLDivElement) {
    const offsets = editorSelectionOffsets(editor);
    const block = design.blocks.find(
      (item) => item.id === editor.dataset.blockId,
    );
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const token = range ? selectedTokenElement(editor, range) : null;

    if (!offsets) {
      return;
    }

    activeRichEditorRef.current = editor;
    richSelectionRef.current = {
      blockId: editor.dataset.blockId || "",
      tokenIndex: variableTokenIndex(editor, token),
      ...offsets,
    };

    if (block?.type === "text" && !editor.closest(".template-inspector")) {
      setActiveTextFormat(textFormatFromEditorSelection(editor, block));
    }
  }

  function rememberActiveRichSelection() {
    const editor = activeRichEditorRef.current;

    if (!editor?.isConnected) {
      return;
    }

    rememberRichSelection(editor);
  }

  function restoreRichSelection(editor: HTMLDivElement) {
    const savedSelection = richSelectionRef.current;

    editor.focus();

    if (!savedSelection || savedSelection.blockId !== editor.dataset.blockId) {
      selectEditorContents(editor);
      return;
    }

    if (typeof savedSelection.tokenIndex === "number") {
      const token = editor.querySelectorAll<HTMLElement>(
        "[data-template-token]",
      )[savedSelection.tokenIndex];

      if (token) {
        selectVariableToken(editor, token);
        return;
      }
    }

    restoreEditorSelection(editor, savedSelection);
  }

  function usableRichEditor() {
    const editor = activeRichEditorRef.current;

    if (!editor?.isConnected) {
      return null;
    }

    if (
      editor.closest(".template-inspector") ||
      editor.dataset.blockId !== selectedId
    ) {
      return null;
    }

    return editor;
  }

  function applyRichTextCommand(command: string) {
    if (command === "bold") {
      wrapRichSelection({
        fontWeight: toolbarTextFormat?.fontWeight === "700" ? "400" : "700",
      });
    } else if (command === "italic") {
      wrapRichSelection({
        fontStyle: toolbarTextFormat?.italic ? "normal" : "italic",
      });
    } else if (command === "underline") {
      wrapRichSelection({
        textDecoration: toolbarTextFormat?.underline ? "none" : "underline",
      });
    }
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

  function applyRichTextLineHeight(lineHeight: string) {
    const size = normalizeLineHeight(lineHeight);

    if (!size) {
      return;
    }

    wrapRichSelection({ lineHeight: String(size) });
  }

  function blockPatchFromRichStyle(
    style: Partial<CSSStyleDeclaration>,
    block?: TemplateBlock,
  ) {
    const patch: Partial<TemplateBlock> = {};

    if (style.fontFamily) {
      patch.fontFamily = style.fontFamily;
    }

    if (style.fontSize) {
      patch.fontSize = Number.parseInt(style.fontSize, 10);
    }

    if (style.lineHeight) {
      patch.lineHeight = normalizeLineHeight(style.lineHeight);
    }

    if (style.fontWeight) {
      patch.fontWeight = style.fontWeight === "700" ? "700" : "400";
    }

    if (style.fontStyle) {
      patch.italic = style.fontStyle === "italic";
    }

    if (style.textDecoration) {
      patch.underline = style.textDecoration === "underline";
    }

    if (style.color) {
      patch.color = style.color;
    }

    if (block?.type === "items") {
      patch.itemColumns = normalizeItemColumns(block.itemColumns).map(
        (column) => ({
          ...column,
          ...(patch.fontSize
            ? {
                labelFontSize: patch.fontSize,
                valueFontSize: patch.fontSize,
              }
            : {}),
          ...(patch.fontWeight
            ? {
                labelFontWeight: patch.fontWeight,
                valueFontWeight: patch.fontWeight,
              }
            : {}),
          ...(patch.color
            ? {
                labelColor: patch.color,
                valueColor: patch.color,
              }
            : {}),
        }),
      );
    }

    return patch;
  }

  function wrapRichSelection(
    style: Partial<CSSStyleDeclaration>,
    fallback = "",
  ) {
    const editor = usableRichEditor();
    const block =
      (editor
        ? design.blocks.find((item) => item.id === editor.dataset.blockId)
        : selectedBlock) || null;

    if (!block) {
      return;
    }

    if (!editor) {
      const patch = blockPatchFromRichStyle(style, block);

      updateBlock(block.id, patch);
      if (block.type === "text") {
        setActiveTextFormat(textFormatFromBlock({ ...block, ...patch }));
      }
      return;
    }

    if (block.type !== "text") {
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

    const selectedToken = selectedTokenElement(editor, range);

    if (selectedToken) {
      Object.assign(selectedToken.style, style);
      selectVariableToken(editor, selectedToken);
      rememberRichSelection(editor);
      syncRichTextElement(editor, block);
      setActiveTextFormat(textFormatFromEditorSelection(editor, block));
      return;
    }

    if (range.collapsed) {
      if (fallback) {
        document.execCommand("insertText", false, fallback);
        rememberRichSelection(editor);
        syncRichTextElement(editor, block);
        return;
      }

      const blockPatch = blockPatchFromRichStyle(style, block);

      updateBlock(block.id, blockPatch);
      setActiveTextFormat(textFormatFromBlock({ ...block, ...blockPatch }));
      Object.assign(editor.style, style);

      selectEditorContents(editor);

      if (!selection.rangeCount || !editor.textContent?.trim()) {
        rememberRichSelection(editor);
        return;
      }
    }

    const selectedRange = selection.getRangeAt(0);
    const span = document.createElement("span");

    Object.assign(span.style, style);

    try {
      selectedRange.surroundContents(span);
    } catch {
      const contents = selectedRange.extractContents();

      span.appendChild(contents);
      selectedRange.insertNode(span);
    }

    selection.removeAllRanges();
    selection.selectAllChildren(span);
    rememberRichSelection(editor);
    syncRichTextElement(editor, block);
    setActiveTextFormat(textFormatFromEditorSelection(editor, block));
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

  function applyDesignHistory(json: string) {
    const nextDesign = copyDesign(JSON.parse(json) as TemplateDesign);

    applyingHistoryRef.current = true;
    setDesign(nextDesign);
    setEditingTextBlockId(null);
    setEditingItemsBlockId(null);
    setMentionMenu(null);
    setActiveTextFormat(null);
    setSelectedId((current) =>
      nextDesign.blocks.some((block) => block.id === current)
        ? current
        : nextDesign.blocks[0]?.id || "",
    );
  }

  function undoDesignChange() {
    const previous = designHistoryRef.current.pop();

    if (!previous) {
      return;
    }

    designFutureRef.current = [
      lastDesignJsonRef.current,
      ...designFutureRef.current.slice(0, 79),
    ];
    applyDesignHistory(previous);
  }

  function redoDesignChange() {
    const next = designFutureRef.current.shift();

    if (!next) {
      return;
    }

    designHistoryRef.current = [
      ...designHistoryRef.current.slice(-79),
      lastDesignJsonRef.current,
    ];
    applyDesignHistory(next);
  }

  function copySelectedBlock() {
    if (!selectedBlock) {
      return;
    }

    blockClipboardRef.current = JSON.parse(
      JSON.stringify(selectedBlock),
    ) as TemplateBlock;
  }

  function pasteBlockFromClipboard() {
    const block = blockClipboardRef.current;

    if (!block) {
      return;
    }

    const duplicate = normalizeBlockGeometry(
      {
        ...JSON.parse(JSON.stringify(block)),
        id: `${block.type}-${Date.now()}`,
        x: block.x + 16,
        y: block.y + 16,
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

  function targetAcceptsTextInput(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      target.closest("input, select, textarea, [contenteditable='true']"),
    );
  }

  function handleTemplateEditorKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (targetAcceptsTextInput(event.target)) {
      return;
    }

    const isModifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (isModifier && key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoDesignChange();
      } else {
        undoDesignChange();
      }
      return;
    }

    if (isModifier && key === "y") {
      event.preventDefault();
      redoDesignChange();
      return;
    }

    if (isModifier && key === "c") {
      event.preventDefault();
      copySelectedBlock();
      return;
    }

    if (isModifier && key === "x") {
      event.preventDefault();
      copySelectedBlock();
      removeSelectedBlock();
      return;
    }

    if (isModifier && key === "v") {
      event.preventDefault();
      pasteBlockFromClipboard();
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      removeSelectedBlock();
    }
  }

  return (
    <>
      <Form
        method="post"
        className="template-editor"
        onKeyDown={handleTemplateEditorKeyDown}
      >
        <input
          type="hidden"
          name="templateDesign"
          value={JSON.stringify(design)}
        />
        <input type="hidden" name="templateName" value={name} />
        <div className="word-titlebar">
          <label className="word-template-select">
            <span>Template name</span>
            <select
              value={name}
              onChange={(event) => selectTemplate(event.currentTarget.value)}
            >
              {!templates.some(
                (savedTemplate) => savedTemplate.name === name,
              ) ? (
                <option value={name}>{name} (new)</option>
              ) : null}
              {templates.map((savedTemplate) => (
                <option key={savedTemplate.name} value={savedTemplate.name}>
                  {savedTemplate.name}
                </option>
              ))}
            </select>
          </label>
          <div className="word-title-actions">
            <button type="button" onClick={createNewTemplate}>
              <span aria-hidden="true">＋</span> New
            </button>
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
              name="intent"
              value="save-template"
              disabled={saving || !canSaveTemplate || !design.blocks.length}
            >
              <span aria-hidden="true">✓</span> Save
            </button>
            <button
              className="danger-button"
              disabled={saving || templates.length <= 1}
              name="intent"
              value="delete-template"
              onClick={(event) => {
                if (
                  !window.confirm(`Delete "${name}"? This cannot be undone.`)
                ) {
                  event.preventDefault();
                }
              }}
              type="submit"
            >
              <span aria-hidden="true">×</span> Delete
            </button>
          </div>
        </div>

        <div className="word-menubar">
          <button type="button" onClick={() => setPageSetupOpen(true)}>
            <span className="word-icon" aria-hidden="true">
              ⚙
            </span>
            Page setup
          </button>
          <button type="button" onClick={undoDesignChange}>
            <span className="word-icon" aria-hidden="true">
              ↶
            </span>
            Undo
          </button>
          <button type="button" onClick={redoDesignChange}>
            <span className="word-icon" aria-hidden="true">
              ↷
            </span>
            Redo
          </button>
          <button type="button" onClick={() => addBlock("text")}>
            <span className="word-icon" aria-hidden="true">
              T
            </span>
            Text box
          </button>
          <button type="button" onClick={() => addBlock("image", "")}>
            <span className="word-icon" aria-hidden="true">
              ▧
            </span>
            Image
          </button>
          <button
            type="button"
            onClick={() => addBlock("image", "items.firstImage")}
          >
            <span className="word-icon" aria-hidden="true">
              ▣
            </span>
            Product image
          </button>
          <button type="button" onClick={() => addBlock("items")}>
            <span className="word-icon" aria-hidden="true">
              ▦
            </span>
            Items table
          </button>
        </div>

        <div
          className="word-formatbar"
          onPointerDownCapture={rememberActiveRichSelection}
        >
          <label>
            <span>Font</span>
            <select
              value={toolbarTextFormat?.fontFamily || FONT_FAMILIES[0].value}
              onChange={(event) =>
                applyRichTextFontFamily(event.currentTarget.value)
              }
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label className="word-size-control">
            <span>Size</span>
            <select
              value={String(toolbarTextFormat?.fontSize || 12)}
              onChange={(event) =>
                applyRichTextFontSize(event.currentTarget.value)
              }
            >
              {RICH_TEXT_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label className="word-line-control">
            <span>Line</span>
            <select
              value={String(toolbarTextFormat?.lineHeight || 1.4)}
              onChange={(event) =>
                applyRichTextLineHeight(event.currentTarget.value)
              }
            >
              {LINE_HEIGHT_OPTIONS.map((lineHeight) => (
                <option key={lineHeight} value={lineHeight}>
                  {lineHeight}
                </option>
              ))}
            </select>
          </label>
          <span className="word-button-group">
            <button
              type="button"
              title="Bold"
              className={
                toolbarTextFormat?.fontWeight === "700" ? "active" : ""
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyRichTextCommand("bold")}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              title="Italic"
              className={toolbarTextFormat?.italic ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyRichTextCommand("italic")}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              title="Underline"
              className={toolbarTextFormat?.underline ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyRichTextCommand("underline")}
            >
              <span className="underline-icon">U</span>
            </button>
          </span>
          <label className="word-color-control">
            <span>Color</span>
            <input
              type="color"
              value={toolbarTextFormat?.color || "#111827"}
              onChange={(event) =>
                wrapRichSelection({ color: event.currentTarget.value })
              }
            />
          </label>
          <span className="word-button-group">
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                disabled={!selectedBlock}
                className={selectedBlock?.align === align ? "active" : ""}
                title={`Align ${align}`}
                onClick={() =>
                  selectedBlock &&
                  updateBlock(selectedBlock.id, {
                    align,
                  })
                }
              >
                <span className="word-icon" aria-hidden="true">
                  {align === "left" ? "☰" : align === "center" ? "≡" : "☷"}
                </span>
              </button>
            ))}
          </span>
          <label className="word-field-control">
            <span>Fields</span>
            <select
              value={tokenField}
              onChange={(event) => setTokenField(event.currentTarget.value)}
            >
              {TEMPLATE_FIELD_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.fields.map((field) => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button type="button" onClick={insertFieldToken}>
            <span className="word-icon" aria-hidden="true">
              +
            </span>
            Insert field
          </button>
          <span className="word-button-group">
            <button
              type="button"
              disabled={!selectedBlock}
              onClick={duplicateSelectedBlock}
              title="Duplicate selected block"
            >
              <span className="word-icon" aria-hidden="true">
                ⧉
              </span>
              Duplicate
            </button>
            <button
              type="button"
              disabled={selectedIndex <= 0}
              onClick={() => moveLayer(-1)}
              title="Send selected block backward"
            >
              <span className="word-icon" aria-hidden="true">
                ◂
              </span>
              Back
            </button>
            <button
              type="button"
              disabled={
                selectedIndex < 0 || selectedIndex >= design.blocks.length - 1
              }
              onClick={() => moveLayer(1)}
              title="Bring selected block forward"
            >
              <span className="word-icon" aria-hidden="true">
                ▸
              </span>
              Forward
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={!selectedBlock}
              onClick={removeSelectedBlock}
              title="Delete selected block"
            >
              <span className="word-icon" aria-hidden="true">
                ×
              </span>
              Delete
            </button>
          </span>
          <label className="word-zoom-control">
            <span>Zoom</span>
            <select
              value={zoom}
              onChange={(event) =>
                setZoom(normalizeZoom(Number(event.currentTarget.value)))
              }
            >
              {ZOOM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {Math.round(option * 100)}%
                </option>
              ))}
            </select>
          </label>
          <label className="word-checkbox">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(event) => setSnapToGrid(event.currentTarget.checked)}
            />
            <span>Snap</span>
          </label>
        </div>

        <div className="template-workspace">
          <div className="template-stage-column">
            <div className="word-workspace">
              <div className="word-ruler-corner" />
              <div className="word-ruler-horizontal" />
              <div className="word-ruler-vertical" />

              <div
                className="template-stage"
                onPointerDown={handleStagePointerDown}
                onWheelCapture={handleStageWheel}
              >
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
                        block.type === "text" &&
                        editingTextBlockId === block.id;
                      const editingItems =
                        block.type === "items" &&
                        editingItemsBlockId === block.id;

                      return (
                        <div
                          className={`template-block-preview ${
                            selected ? "selected" : ""
                          }`}
                          data-block-type={block.type}
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
                                inlineTextRef.current = element;
                              }}
                              onBlur={undefined}
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
                                      onKeyDown={(event) =>
                                        event.stopPropagation()
                                      }
                                      onChange={(event) =>
                                        updateItemColumnInBlock(
                                          block,
                                          column.key,
                                          {
                                            label: event.currentTarget.value,
                                          },
                                        )
                                      }
                                    />
                                    <input
                                      aria-label={`${column.key} width`}
                                      min="32"
                                      type="number"
                                      value={column.width}
                                      onKeyDown={(event) =>
                                        event.stopPropagation()
                                      }
                                      onChange={(event) =>
                                        updateItemColumnInBlock(
                                          block,
                                          column.key,
                                          {
                                            width: Number(
                                              event.currentTarget.value,
                                            ),
                                          },
                                        )
                                      }
                                    />
                                    <button
                                      type="button"
                                      disabled={index === 0}
                                      onClick={() =>
                                        moveItemColumnInBlock(
                                          block,
                                          column.key,
                                          -1,
                                        )
                                      }
                                    >
                                      Up
                                    </button>
                                    <button
                                      type="button"
                                      disabled={index === columns.length - 1}
                                      onClick={() =>
                                        moveItemColumnInBlock(
                                          block,
                                          column.key,
                                          1,
                                        )
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
                          block.type === "items" ? (
                            <button
                              className="canvas-edit-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openCanvasEditor(block);
                              }}
                            >
                              Edit table
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
                                applyRichTextFontFamily(
                                  event.currentTarget.value,
                                );
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
                                applyRichTextFontSize(
                                  event.currentTarget.value,
                                );
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
                          inspectorTextRef.current = element;
                        }}
                        onFocus={(element) => {
                          activeRichEditorRef.current = element;
                          rememberRichSelection(element);
                        }}
                        onBlur={() => setMentionMenu(null)}
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
                              onClick={() =>
                                setSelectedItemColumnKey(column.key)
                              }
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
                                        selectedItemColumn.labelFontWeight ===
                                        "700"
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
                                        selectedItemColumn.valueFontWeight ===
                                        "700"
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
                        value={
                          selectedBlock.fontFamily || FONT_FAMILIES[0].value
                        }
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
                        value={normalizeLineHeight(selectedBlock.lineHeight)}
                        onChange={(event) =>
                          updateBlock(selectedBlock.id, {
                            lineHeight: normalizeLineHeight(
                              event.currentTarget.value,
                            ),
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
                      className={
                        selectedBlock.fontWeight === "700" ? "active" : ""
                      }
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
            <div className="word-statusbar">
              <span>Page 1</span>
              <span>
                {selectedBlock
                  ? `${blockTypeLabel(selectedBlock)}: ${blockLabel(selectedBlock)}`
                  : "No block selected"}
              </span>
              {selectedBlock ? (
                <span>
                  X {selectedBlock.x} Y {selectedBlock.y} W {selectedBlock.w} H{" "}
                  {selectedBlock.h}
                </span>
              ) : null}
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          </div>
        </div>
      </Form>
      {pageSetupOpen ? (
        <div className="page-setup-backdrop">
          <div className="page-setup-dialog" role="dialog" aria-modal="true">
            <div className="page-setup-heading">
              <strong>Page setup</strong>
              <button type="button" onClick={() => setPageSetupOpen(false)}>
                Close
              </button>
            </div>
            <div className="page-setup-grid">
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
                [
                  ["marginTop", "Top"],
                  ["marginRight", "Right"],
                  ["marginBottom", "Bottom"],
                  ["marginLeft", "Left"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
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
          </div>
        </div>
      ) : null}
      {mentionMenu ? (
        <div
          className="mention-menu"
          style={{ left: mentionMenu.left, top: mentionMenu.top }}
        >
          <div className="mention-menu-heading">Variables</div>
          {mentionMatches(mentionMenu.query).map((field) => (
            <button
              key={field.value}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                const editor =
                  activeRichEditorRef.current?.dataset.blockId ===
                  mentionMenu.blockId
                    ? activeRichEditorRef.current
                    : document.querySelector<HTMLDivElement>(
                        `[data-template-rich-editor="${mentionMenu.blockId}"]`,
                      );
                const block = design.blocks.find(
                  (item) => item.id === mentionMenu.blockId,
                );

                if (editor && block?.type === "text") {
                  insertVariableField(editor, block, field, {
                    replaceMention: true,
                  });
                }
              }}
            >
              <span>{field.label}</span>
              <small>{field.sample || field.value}</small>
            </button>
          ))}
        </div>
      ) : null}
    </>
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
  const [activeAppTab, setActiveAppTab] = useState<AppTab>("template");
  const [activeOperationsTab, setActiveOperationsTab] =
    useState<OperationsTab>("rule");
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

      <div className="app-body">
        <nav className="main-tabs" aria-label="Order printer sections">
          {(
            [
              ["template", "Template editor"],
              ["operations", "Operations"],
            ] as const
          ).map(([tab, label]) => (
            <button
              aria-pressed={activeAppTab === tab}
              className={activeAppTab === tab ? "active" : ""}
              key={tab}
              type="button"
              onClick={() => setActiveAppTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeAppTab === "operations" ? (
          <aside className="app-sidebar">
            <div className="operations-tabs">
              {(
                [
                  ["rule", "Automation rule"],
                  ["agent", "Print agent"],
                  ["jobs", "Recent jobs"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  aria-pressed={activeOperationsTab === tab}
                  className={activeOperationsTab === tab ? "active" : ""}
                  key={tab}
                  type="button"
                  onClick={() => setActiveOperationsTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeOperationsTab === "rule" ? (
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
                    <select
                      name="printerName"
                      defaultValue={defaultPrinterName}
                    >
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
                    No printers have checked in yet. Start the local print
                    agent, then reload this page.
                  </p>
                ) : null}
              </section>
            ) : null}

            {activeOperationsTab === "agent" ? (
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
                    <button
                      type="submit"
                      disabled={saving || !data.rule?.enabled}
                    >
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
            ) : null}

            {activeOperationsTab === "jobs" ? (
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
                                <span className="job-error">
                                  {job.lastError}
                                </span>
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
                  <p className="empty-state">
                    No print jobs have been queued yet.
                  </p>
                )}
              </section>
            ) : null}
          </aside>
        ) : null}

        {activeAppTab === "template" ? (
          <section className="template-app-panel">
            <TemplateDesigner
              canSaveTemplate={Boolean(data.rule)}
              template={data.template}
              templates={data.templates}
              saving={saving}
            />
          </section>
        ) : null}
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
