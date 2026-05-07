import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  createPrintJobForFulfillmentOrder,
  fulfillmentOrderGidFromWebhookPayload,
} from "../models/order-printer.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  const fulfillmentOrderId = fulfillmentOrderGidFromWebhookPayload(payload);
  const { admin } = await unauthenticated.admin(shop);
  const result = await createPrintJobForFulfillmentOrder(
    admin,
    shop,
    fulfillmentOrderId,
  );

  console.log(
    `Received ${topic} webhook for ${shop}; ${result.created ? "handled" : "skipped"} ${fulfillmentOrderId}: ${result.reason}`,
  );

  return new Response();
};
