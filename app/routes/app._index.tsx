import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  loadDashboard,
  retryPrintJob,
  savePrinterRule,
} from "../models/order-printer.server";

type ActionData = {
  ok: boolean;
  message: string;
};

export const links = () => [{ rel: "stylesheet", href: "/order-printer.css" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await loadDashboard(admin, session.shop);

  return {
    ...data,
    appUrl: new URL(request.url).origin,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    if (intent === "save-rule") {
      await savePrinterRule(admin, session.shop, formData);
      return { ok: true, message: "Printer rule saved." } satisfies ActionData;
    }

    if (intent === "retry-job") {
      await retryPrintJob(session.shop, String(formData.get("jobId") || ""));
      return {
        ok: true,
        message: "Print job submitted again.",
      } satisfies ActionData;
    }

    return { ok: false, message: "Unknown action." } satisfies ActionData;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Action failed.",
    } satisfies ActionData;
  }
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function OrderPrinterDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const defaultLocationId = data.rule?.locationId || data.locations[0]?.id || "";
  const defaultPrinterId =
    data.rule?.printerExternalId || data.printers[0]?.id || "";
  const canSave = Boolean(defaultLocationId && defaultPrinterId);

  return (
    <s-page heading="COG Order Printer">
      <div className="printer-shell">
        {actionData ? (
          <div className={actionData.ok ? "notice success" : "notice error"}>
            {actionData.message}
          </div>
        ) : null}

        <s-section heading="Automation rule">
          {!data.providerConfigured ? (
            <p className="empty-state">
              PRINTNODE_API_KEY is not configured in Vercel yet.
            </p>
          ) : null}
          {data.providerError ? (
            <p className="empty-state">{data.providerError}</p>
          ) : null}
          <Form method="post" className="settings-form">
            <input type="hidden" name="intent" value="save-rule" />
            <label>
              <span>Fulfillment location</span>
              <select name="locationId" defaultValue={defaultLocationId}>
                {data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Printer</span>
              <select name="printerExternalId" defaultValue={defaultPrinterId}>
                {data.printers.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.name} - {printer.computerName}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={data.rule?.enabled ?? true}
              />
              <span>Print new orders for this location</span>
            </label>
            <button type="submit" disabled={!canSave || saving}>
              Save settings
            </button>
          </Form>
          {!data.printers.length ? (
            <p className="empty-state">
              No PrintNode printers are available for this API key.
            </p>
          ) : null}
        </s-section>

        <s-section heading="Provider printers">
          <div className="printer-list">
            {data.printers.map((printer) => (
              <div className="printer-row" key={printer.id}>
                <strong>{printer.name}</strong>
                <span>{printer.computerName}</span>
                <span>{printer.state}</span>
              </div>
            ))}
          </div>
        </s-section>

        <s-section heading="Recent print jobs">
          {data.jobs.length ? (
            <div className="job-table-wrap">
              <table className="job-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Location</th>
                    <th>Printer</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <strong>{job.orderName}</strong>
                        {job.lastError ? (
                          <span className="job-error">{job.lastError}</span>
                        ) : null}
                      </td>
                      <td>{job.locationName}</td>
                      <td>{job.printerName}</td>
                      <td>
                        <span className={`status ${job.status.toLowerCase()}`}>
                          {job.status}
                        </span>
                      </td>
                      <td>{formatDate(job.createdAt)}</td>
                      <td>
                        {job.status === "FAILED" ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="retry-job" />
                            <input type="hidden" name="jobId" value={job.id} />
                            <button type="submit" disabled={saving}>
                              Retry
                            </button>
                          </Form>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No print jobs have been queued yet.</p>
          )}
        </s-section>
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
