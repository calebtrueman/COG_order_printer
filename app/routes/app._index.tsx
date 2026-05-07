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
import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  createManualReprintJobForOrder,
  loadDashboard,
  retryPrintJob,
  rotateAgentToken,
  savePrintTemplate,
  savePrinterRule,
} from "../models/order-printer.server";
import type {
  TemplateBlock,
  TemplateDesign,
} from "../models/order-printer.server";

type ActionData = {
  ok: boolean;
  message: string;
};

const TEMPLATE_FIELDS = [
  { value: "order.name", label: "Order #" },
  { value: "order.poNumber", label: "PO #" },
  { value: "order.createdAt", label: "Order date" },
  { value: "shipping.shipDate", label: "Ship date" },
  { value: "shipping.method", label: "Ship via" },
  { value: "fulfillment.trackingNumber", label: "Tracking #" },
  { value: "fulfillment.trackingCompany", label: "Tracking company" },
  { value: "fulfillment.trackingUrl", label: "Tracking URL" },
  { value: "shipping.address", label: "Ship to address" },
  { value: "billing.address", label: "Bill to address" },
  { value: "order.email", label: "Customer email" },
  { value: "order.phone", label: "Customer phone" },
  { value: "order.note", label: "Order note" },
  { value: "location.name", label: "Fulfillment location" },
  { value: "items.count", label: "Total item quantity" },
  { value: "items.firstImage", label: "First product image" },
];

export const links = () => [{ rel: "stylesheet", href: "/order-printer.css" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const showReprintOrders = url.searchParams.get("reprint") === "1";
  const data = await loadDashboard(admin, session.shop, {
    includeReprintOrders: showReprintOrders,
  });

  return {
    ...data,
    appUrl: new URL(request.url).origin,
    showReprintOrders,
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

    if (intent === "rotate-token") {
      await rotateAgentToken(session.shop);
      return {
        ok: true,
        message: "Print agent token rotated.",
      } satisfies ActionData;
    }

    if (intent === "retry-job") {
      await retryPrintJob(session.shop, String(formData.get("jobId") || ""));
      return {
        ok: true,
        message: "Print job queued again.",
      } satisfies ActionData;
    }

    if (intent === "manual-reprint-order") {
      const result = await createManualReprintJobForOrder(
        admin,
        session.shop,
        String(formData.get("orderId") || ""),
      );

      return {
        ok: result.created,
        message: result.created
          ? "Packing slip queued for reprint."
          : result.reason,
      } satisfies ActionData;
    }

    if (intent === "save-template") {
      await savePrintTemplate(session.shop, formData);
      return {
        ok: true,
        message: "Packing slip template saved.",
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function blockLabel(block: TemplateBlock) {
  if (block.type === "items") {
    return "Line items table";
  }

  if (block.type === "image") {
    return block.field === "items.firstImage"
      ? "Product image"
      : "Custom image";
  }

  if (block.type === "text") {
    return block.text || "Custom text";
  }

  return (
    TEMPLATE_FIELDS.find((field) => field.value === block.field)?.label ||
    block.label ||
    "Order field"
  );
}

function TemplateDesigner({
  template,
  saving,
}: {
  template: { name: string; design: TemplateDesign };
  saving: boolean;
}) {
  const [name, setName] = useState(template.name);
  const [design, setDesign] = useState<TemplateDesign>(template.design);
  const [selectedId, setSelectedId] = useState(
    template.design.blocks[0]?.id || "",
  );
  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const selectedBlock = useMemo(
    () => design.blocks.find((block) => block.id === selectedId) || null,
    [design.blocks, selectedId],
  );

  function updateBlock(id: string, patch: Partial<TemplateBlock>) {
    setDesign((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    }));
  }

  function addBlock(type: TemplateBlock["type"], field = "order.name") {
    const id = `${type}-${Date.now()}`;
    const block: TemplateBlock = {
      id,
      type,
      x: 48,
      y: 48,
      w: type === "items" ? 640 : 220,
      h: type === "items" ? 280 : type === "image" ? 120 : 56,
      field: type === "field" || type === "image" ? field : "",
      text:
        type === "text"
          ? "Custom text with {{order.name}} or any field token"
          : "",
      imageUrl: "",
      label:
        type === "field"
          ? TEMPLATE_FIELDS.find((option) => option.value === field)?.label
          : "",
      fontSize: 12,
      fontWeight: type === "field" ? "700" : "400",
      align: "left",
    };

    setDesign((current) => ({
      ...current,
      blocks: [...current.blocks, block],
    }));
    setSelectedId(id);
  }

  function removeSelectedBlock() {
    if (!selectedBlock) {
      return;
    }

    setDesign((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== selectedBlock.id),
    }));
    setSelectedId("");
  }

  function startDrag(
    event: PointerEvent<HTMLButtonElement>,
    block: TemplateBlock,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();

    dragRef.current = {
      id: block.id,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setSelectedId(block.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragBlock(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const canvas = event.currentTarget.getBoundingClientRect();
    const block = design.blocks.find((item) => item.id === drag.id);

    if (!block) {
      return;
    }

    updateBlock(drag.id, {
      x: clamp(event.clientX - canvas.left - drag.offsetX, 0, 816 - block.w),
      y: clamp(event.clientY - canvas.top - drag.offsetY, 0, 1056 - block.h),
    });
  }

  function stopDrag() {
    dragRef.current = null;
  }

  return (
    <Form method="post" className="template-editor">
      <input type="hidden" name="intent" value="save-template" />
      <input
        type="hidden"
        name="templateDesign"
        value={JSON.stringify(design)}
      />
      <div className="template-topbar">
        <label>
          <span>Template name</span>
          <input
            name="templateName"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={saving}>
          Save template
        </button>
      </div>

      <div className="template-workspace">
        <div className="template-palette">
          <button type="button" onClick={() => addBlock("text")}>
            Add text
          </button>
          <button type="button" onClick={() => addBlock("image")}>
            Add image
          </button>
          <button
            type="button"
            onClick={() => addBlock("image", "items.firstImage")}
          >
            Add product image
          </button>
          <button type="button" onClick={() => addBlock("items")}>
            Add items table
          </button>
          <div className="field-list">
            {TEMPLATE_FIELDS.map((field) => (
              <button
                key={field.value}
                type="button"
                onClick={() => addBlock("field", field.value)}
              >
                {field.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="template-canvas"
          onPointerMove={dragBlock}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          {design.blocks.map((block) => (
            <button
              className={`template-block-preview ${
                block.id === selectedId ? "selected" : ""
              }`}
              key={block.id}
              onPointerDown={(event) => startDrag(event, block)}
              style={{
                left: block.x,
                top: block.y,
                width: block.w,
                height: block.h,
                fontSize: block.fontSize,
                fontWeight: block.fontWeight,
                textAlign: block.align,
              }}
              type="button"
            >
              <span>{blockLabel(block)}</span>
            </button>
          ))}
        </div>

        <div className="template-inspector">
          {selectedBlock ? (
            <>
              <div className="field-label">Selected block</div>
              <strong>{blockLabel(selectedBlock)}</strong>
              {selectedBlock.type === "field" ||
              selectedBlock.type === "image" ? (
                <label>
                  <span>Data field</span>
                  <select
                    value={selectedBlock.field || ""}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        field: event.currentTarget.value,
                        label:
                          TEMPLATE_FIELDS.find(
                            (field) =>
                              field.value === event.currentTarget.value,
                          )?.label || selectedBlock.label,
                      })
                    }
                  >
                    {TEMPLATE_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selectedBlock.type === "field" ? (
                <label>
                  <span>Label</span>
                  <input
                    value={selectedBlock.label || ""}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        label: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              ) : null}
              {selectedBlock.type === "text" ? (
                <label>
                  <span>Text</span>
                  <textarea
                    value={selectedBlock.text || ""}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        text: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              ) : null}
              {selectedBlock.type === "image" ? (
                <label>
                  <span>Custom image URL</span>
                  <input
                    value={selectedBlock.imageUrl || ""}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        imageUrl: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              ) : null}
              <div className="geometry-grid">
                {(["x", "y", "w", "h", "fontSize"] as const).map((key) => (
                  <label key={key}>
                    <span>{key}</span>
                    <input
                      min="0"
                      type="number"
                      value={selectedBlock[key] || 0}
                      onChange={(event) =>
                        updateBlock(selectedBlock.id, {
                          [key]: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                <span>Weight</span>
                <select
                  value={selectedBlock.fontWeight || "400"}
                  onChange={(event) =>
                    updateBlock(selectedBlock.id, {
                      fontWeight: event.currentTarget.value,
                    })
                  }
                >
                  <option value="400">Regular</option>
                  <option value="700">Bold</option>
                </select>
              </label>
              <label>
                <span>Align</span>
                <select
                  value={selectedBlock.align || "left"}
                  onChange={(event) =>
                    updateBlock(selectedBlock.id, {
                      align: event.currentTarget
                        .value as TemplateBlock["align"],
                    })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <button
                type="button"
                className="danger-button"
                onClick={removeSelectedBlock}
              >
                Remove block
              </button>
            </>
          ) : (
            <p className="empty-state">Select a block to edit it.</p>
          )}
        </div>
      </div>
    </Form>
  );
}

export default function OrderPrinterDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const defaultLocationId =
    data.rule?.locationId || data.locations[0]?.id || "";
  const defaultPrinterName =
    data.rule?.printerName || data.printers[0]?.name || "";
  const canSave = Boolean(defaultLocationId && defaultPrinterName);
  const agentConfig = JSON.stringify(
    {
      appUrl: data.appUrl,
      token: data.agentToken,
      agentName: "COG shipping station",
      pollIntervalMs: 5000,
    },
    null,
    2,
  );

  return (
    <s-page heading="COG Order Printer">
      <div className="printer-shell">
        {actionData ? (
          <div className={actionData.ok ? "notice success" : "notice error"}>
            {actionData.message}
          </div>
        ) : null}

        <s-section heading="Automation rule">
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
              <select name="printerName" defaultValue={defaultPrinterName}>
                {data.printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}
                    {printer.isDefault ? " (default)" : ""}
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
              No printers have checked in yet. Start the local print agent, then
              reload this page.
            </p>
          ) : null}
        </s-section>

        <s-section heading="Print agent">
          <div className="agent-grid">
            <div>
              <div className="field-label">Agent token</div>
              <code className="token">{data.agentToken}</code>
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="rotate-token" />
              <button type="submit" disabled={saving}>
                Rotate token
              </button>
            </Form>
          </div>
          <div className="field-label">Agent config</div>
          <pre className="command">{agentConfig}</pre>
          <div className="printer-list">
            {data.printers.map((printer) => (
              <div className="printer-row" key={printer.name}>
                <strong>{printer.name}</strong>
                <span>{printer.agentName || "local agent"}</span>
                <span>Last seen {formatDate(printer.lastSeenAt)}</span>
              </div>
            ))}
          </div>
        </s-section>

        <s-section heading="Reprint packing slip">
          <Form method="get" className="inline-action">
            <input type="hidden" name="reprint" value="1" />
            <button type="submit" disabled={saving || !data.rule?.enabled}>
              Reprint Packing Slip
            </button>
          </Form>
          {data.showReprintOrders ? (
            data.reprintOrders.length ? (
              <div className="job-table-wrap">
                <table className="job-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Ship to</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reprintOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.name}</strong>
                          <span className="job-error">
                            {order.fulfillmentOrderCount} open fulfillment order
                            {order.fulfillmentOrderCount === 1 ? "" : "s"} here
                          </span>
                        </td>
                        <td>{order.shipTo}</td>
                        <td>{order.status}</td>
                        <td>{formatDate(order.createdAt)}</td>
                        <td>
                          <Form method="post">
                            <input
                              type="hidden"
                              name="intent"
                              value="manual-reprint-order"
                            />
                            <input
                              type="hidden"
                              name="orderId"
                              value={order.id}
                            />
                            <button type="submit" disabled={saving}>
                              Print
                            </button>
                          </Form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">
                No unfulfilled orders are currently assigned to the configured
                fulfillment location.
              </p>
            )
          ) : null}
        </s-section>

        <s-section heading="Packing slip template">
          <TemplateDesigner template={data.template} saving={saving} />
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
                            <input
                              type="hidden"
                              name="intent"
                              value="retry-job"
                            />
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
