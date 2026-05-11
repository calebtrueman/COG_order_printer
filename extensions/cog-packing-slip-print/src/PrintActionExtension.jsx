/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from "react";
import {
  reactExtension,
  AdminPrintAction,
  Banner,
  BlockStack,
  Text,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.print-action.render";
const APP_URL = "https://cog-order-printer.vercel.app";

function selectedOrderId(api) {
  const selected = api.data?.selected;

  if (Array.isArray(selected)) {
    return selected[0]?.id || "";
  }

  return selected?.id || "";
}

async function fetchPreviewUrl(api, orderId) {
  const idToken = await api.auth.idToken();
  const response = await fetch(
    `${APP_URL}/api/admin-print-url?orderId=${encodeURIComponent(orderId)}`,
    {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
    },
  );

  if (!response.ok) {
    throw new Error(`Preview request failed with ${response.status}.`);
  }

  return response.json();
}

function PrintAction({ api }) {
  const orderId = useMemo(() => selectedOrderId(api), [api]);
  const [state, setState] = useState({
    loading: true,
    src: "",
    message: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!orderId) {
        setState({
          loading: false,
          src: "",
          message: "Shopify did not provide an order id for this print action.",
        });
        return;
      }

      try {
        const result = await fetchPreviewUrl(api, orderId);

        if (cancelled) {
          return;
        }

        setState({
          loading: false,
          src: result.ok ? result.src : "",
          message: result.ok
            ? `Preview ready for ${result.orderName || "this order"}.`
            : result.reason || "This order is not eligible for COG printing.",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState({
          loading: false,
          src: "",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load packing slip preview.",
        });
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [api, orderId]);

  return (
    <AdminPrintAction src={state.src || undefined}>
      <BlockStack gap="base">
        {state.src ? (
          <Banner tone="success">
            <Text>{state.message}</Text>
          </Banner>
        ) : (
          <Banner tone={state.loading ? "info" : "critical"}>
            <Text>
              {state.loading
                ? "Preparing the COG packing slip preview..."
                : state.message}
            </Text>
          </Banner>
        )}
      </BlockStack>
    </AdminPrintAction>
  );
}

export default reactExtension(TARGET, (api) => <PrintAction api={api} />);
