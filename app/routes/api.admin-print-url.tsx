import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  buildPackingSlipPreviewHtml,
  createSignedPrintPreviewUrl,
} from "../models/order-printer.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
  const { cors } = await authenticate.admin(request);

  return cors(
    Response.json(
      { ok: false, reason: "Method not allowed." },
      { status: 405 },
    ),
  );
};
