import type { LoaderFunctionArgs } from "react-router";
import {
  authenticateAgentToken,
  claimPrintJobs,
} from "../models/order-printer.server";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const settings = await authenticateAgentToken(request);

  if (!settings) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const agentName =
    request.headers.get("x-agent-name")?.trim() || "local-print-agent";
  const jobs = await claimPrintJobs(settings.shop, agentName);

  return jsonResponse({ jobs });
};

export const action = async () =>
  jsonResponse({ error: "Method not allowed." }, 405);
