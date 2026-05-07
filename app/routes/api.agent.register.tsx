import type { ActionFunctionArgs } from "react-router";
import {
  authenticateAgentToken,
  registerAgentPrinters,
} from "../models/order-printer.server";

type PrinterPayload = string | { name?: unknown; isDefault?: unknown };

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

  const payload = (await request.json()) as {
    agentName?: unknown;
    printers?: PrinterPayload[];
  };
  const agentName =
    typeof payload.agentName === "string" && payload.agentName.trim()
      ? payload.agentName.trim()
      : "local-print-agent";
  const printers = Array.isArray(payload.printers)
    ? payload.printers.map((printer) =>
        typeof printer === "string"
          ? { name: printer, isDefault: false }
          : { name: printer.name, isDefault: Boolean(printer.isDefault) },
      )
    : [];

  const count = await registerAgentPrinters({
    shop: settings.shop,
    agentName,
    printers: printers
      .filter((printer) => typeof printer.name === "string")
      .map((printer) => ({
        name: printer.name as string,
        isDefault: printer.isDefault,
      })),
  });

  return jsonResponse({ ok: true, printers: count });
};
