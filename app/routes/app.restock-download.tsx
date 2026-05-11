import type { LoaderFunctionArgs } from "react-router";
import { restockDocumentDownloadHtml } from "../models/order-printer.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const html = await restockDocumentDownloadHtml(session.shop);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cog-restock-list.html"',
    },
  });
};
