import type { ActionFunctionArgs } from "react-router";
import {
  authenticateAgentToken,
  completePrintJob,
} from "../models/order-printer.server";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const settings = await authenticateAgentToken(request);

  if (!settings) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const jobId = params.jobId;

  if (!jobId) {
    return jsonResponse({ error: "Missing job id." }, 400);
  }

  const payload = (await request.json()) as {
    printed?: unknown;
    message?: unknown;
  };

  await completePrintJob({
    shop: settings.shop,
    jobId,
    printed: payload.printed === true,
    message: typeof payload.message === "string" ? payload.message : null,
  });

  return jsonResponse({ ok: true });
};
