import type { LoaderFunctionArgs } from "react-router";
import { appendRestockScanToken } from "../models/order-printer.server";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function scanResultHtml({
  ok,
  title,
  message,
}: {
  ok: boolean;
  title: string;
  message: string;
}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      body { align-items: center; background: #f3f4f6; color: #111827; display: grid; font-family: Arial, sans-serif; margin: 0; min-height: 100vh; padding: 20px; }
      main { background: #ffffff; border: 1px solid #d1d5db; border-radius: 10px; box-shadow: 0 10px 30px rgb(15 23 42 / 12%); max-width: 520px; padding: 24px; width: 100%; }
      h1 { font-size: 22px; margin: 0 0 10px; }
      p { line-height: 1.5; margin: 0; }
      .status { color: ${ok ? "#166534" : "#991b1b"}; font-weight: 700; text-transform: uppercase; }
    </style>
  </head>
  <body><main><div class="status">${ok ? "Added" : "Not added"}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body>
</html>`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const token = new URL(request.url).searchParams.get("token") || "";
  const result = await appendRestockScanToken(token);

  return new Response(
    scanResultHtml({
      ok: result.ok,
      title: result.ok ? result.title : "Restock scan failed",
      message: result.ok
        ? result.sku
          ? `${result.sku} was added to the COG restock document.`
          : "Added to the COG restock document."
        : result.reason,
    }),
    {
      status: result.ok ? 200 : 422,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
};
