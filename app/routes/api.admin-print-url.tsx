import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  buildPackingSlipPreviewHtml,
  createSignedPrintPreviewUrl,
} from "../models/order-printer.server";
import { authenticate } from "../shopify.server";

function adminExtensionCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: adminExtensionCorsHeaders(request),
    });
  }

  const { admin, cors, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") || "";

  if (!orderId) {
    return cors(
      Response.json(
        { ok: false, reason: "Missing Shopify order id." },
        { status: 400 },
      ),
    );
  }

  const preview = await buildPackingSlipPreviewHtml(
    admin,
    session.shop,
    orderId,
  );

  if (!preview.ok) {
    return cors(Response.json({ ok: false, reason: preview.reason }));
  }

  return cors(
    Response.json({
      ok: true,
      orderName: preview.orderName,
      src: createSignedPrintPreviewUrl({
        shop: session.shop,
        orderId,
        baseUrl: url.origin,
      }),
    }),
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: adminExtensionCorsHeaders(request),
    });
  }

  const { cors } = await authenticate.admin(request);

  return cors(
    Response.json(
      { ok: false, reason: "Method not allowed." },
      { status: 405 },
    ),
  );
};
