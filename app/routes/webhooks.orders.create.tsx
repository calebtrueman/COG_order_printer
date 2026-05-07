import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  createPrintJobForOrder,
  orderGidFromWebhookPayload,
} from "../models/order-printer.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  const orderId = orderGidFromWebhookPayload(payload);
  const { admin } = await unauthenticated.admin(shop);
  const result = await createPrintJobForOrder(admin, shop, orderId);

  console.log(
    `Received ${topic} webhook for ${shop}; ${result.created ? "handled" : "skipped"} ${orderId}: ${result.reason}`,
  );

  return new Response();
};
