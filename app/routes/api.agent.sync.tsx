import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import {
  authenticateAgentToken,
  syncMissedAutoPrints,
} from "../models/order-printer.server";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export const loader = async () =>
  jsonResponse({ error: "Method not allowed." }, 405);

export const action = async ({ request }: ActionFunctionArgs) => {
  const settings = await authenticateAgentToken(request);

  if (!settings) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const { admin } = await unauthenticated.admin(settings.shop);
  const result = await syncMissedAutoPrints(admin, settings.shop);

  return jsonResponse({ ok: true, ...result });
};
