import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  buildPackingSlipPreviewHtml,
  verifySignedPrintPreviewToken,
} from "../models/order-printer.server";
import { unauthenticated } from "../shopify.server";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function previewErrorHtml(title: string, message: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      body { color: #111827; font-family: Arial, sans-serif; margin: 40px; }
      .box { border: 1px solid #d1d5db; border-radius: 8px; max-width: 640px; padding: 20px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0; }
    </style>
  </head>
  <body><section class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></section></body>
</html>`;
}

function previewCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });

  headers.set(
    "Access-Control-Allow-Origin",
    origin?.endsWith(".myshopify.com") || origin === "https://admin.shopify.com"
      ? origin
      : "*",
  );

  return headers;
}

function previewDocumentHeaders(request: Request) {
  const headers = previewCorsHeaders(request);

  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("X-Robots-Tag", "noindex");
  headers.set("Cache-Control", "private, no-store");
  headers.set(
    "Content-Security-Policy",
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
  );

  return headers;
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: previewCorsHeaders(request),
    });
  }

  const token = params.token || "";
  const payload = verifySignedPrintPreviewToken(token);

  if (!payload) {
    return new Response(
      previewErrorHtml(
        "Unable to preview packing slip",
        "This packing slip preview link is invalid or expired.",
      ),
      {
        status: 403,
        headers: previewDocumentHeaders(request),
      },
    );
  }

  const { admin } = await unauthenticated.admin(payload.shop);
  const preview = await buildPackingSlipPreviewHtml(
    admin,
    payload.shop,
    payload.orderId || "",
  );
  const body = preview.ok
    ? preview.html
    : previewErrorHtml("Unable to preview packing slip", preview.reason);

  return new Response(body, {
    status: preview.ok ? 200 : 422,
    headers: previewDocumentHeaders(request),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: previewCorsHeaders(request),
    });
  }

  return new Response(null, {
    status: 405,
    headers: previewCorsHeaders(request),
  });
};
