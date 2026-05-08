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
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
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

type TemplateField = {
  value: string;
  label: string;
  sample: string;
};

const CANVAS_WIDTH = 816;
const CANVAS_HEIGHT = 1056;
const GRID_SIZE = 8;
const MIN_BLOCK_WIDTH = 32;
const MIN_BLOCK_HEIGHT = 24;

const TEMPLATE_FIELD_GROUPS: { label: string; fields: TemplateField[] }[] = [
  {
    label: "Order",
    fields: [
      { value: "order.name", label: "Order #", sample: "#1042" },
      { value: "order.poNumber", label: "PO #", sample: "PO-7834" },
      {
        value: "order.createdAt",
        label: "Order date",
        sample: "May 8, 2026, 9:42 a.m.",
      },
      {
        value: "order.email",
        label: "Customer email",
        sample: "buyer@example.com",
      },
      { value: "order.phone", label: "Customer phone", sample: "555-0128" },
      {
        value: "order.note",
        label: "Order note",
        sample: "Call before delivery.",
      },
    ],
  },
  {
    label: "Shipping",
    fields: [
      {
        value: "shipping.address",
        label: "Ship to address",
        sample: "Alex Smith\n14 Market St\nOttawa ON K1A 0B1\nCanada",
      },
      {
        value: "billing.address",
        label: "Bill to address",
        sample: "Alex Smith\n14 Market St\nOttawa ON K1A 0B1\nCanada",
      },
      { value: "shipping.shipDate", label: "Ship date", sample: "May 8, 2026" },
      {
        value: "shipping.method",
        label: "Ship via",
        sample: "Expedited Parcel",
      },
      {
        value: "fulfillment.trackingNumber",
        label: "Tracking #",
        sample: "1Z999AA10123456784",
      },
      {
        value: "fulfillment.trackingCompany",
        label: "Tracking company",
        sample: "UPS",
      },
      {
        value: "fulfillment.trackingUrl",
        label: "Tracking URL",
        sample: "https://carrier.example/track/1Z999",
      },
    ],
  },
  {
    label: "Fulfillment",
    fields: [
      {
        value: "location.name",
        label: "Fulfillment location",
        sample: "COG Warehouse",
      },
      { value: "items.count", label: "Total item quantity", sample: "3" },
      {
        value: "items.firstImage",
        label: "First product image",
        sample: "",
      },
    ],
  },
];
const TEMPLATE_FIELDS = TEMPLATE_FIELD_GROUPS.flatMap((group) => group.fields);
const SAMPLE_LINES = [
  { quantity: 1, title: "EG4 6000XP inverter", sku: "EG4-6000XP" },
  { quantity: 2, title: "Server rack battery cable set", sku: "CAB-RACK-2/0" },
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

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type CanvasOperation =
  | {
      mode: "move";
      id: string;
      startX: number;
      startY: number;
      original: TemplateBlock;
    }
  | {
      mode: "resize";
      id: string;
      startX: number;
      startY: number;
      original: TemplateBlock;
      handle: ResizeHandle;
    };

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

function copyDesign(design: TemplateDesign): TemplateDesign {
  const next = JSON.parse(JSON.stringify(design)) as TemplateDesign;

  return {
    ...next,
    blocks: next.blocks.map(normalizeBlockGeometry),
  };
}

function snapValue(value: number, snapToGrid: boolean) {
  return snapToGrid
    ? Math.round(value / GRID_SIZE) * GRID_SIZE
    : Math.round(value);
}

function fieldFor(value: string | undefined) {
  return TEMPLATE_FIELDS.find((field) => field.value === value) || null;
}

function fieldSample(value: string | undefined) {
  return fieldFor(value)?.sample || "";
}

function replaceSampleTokens(text: string | undefined) {
  return String(text || "").replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (_match, field) => fieldSample(field),
  );
}

function lineBreaks(value: string) {
  const lines = value.split(/\r?\n/);

  return lines.map((line, index) => (
    <span key={`${line}-${index}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
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

  return fieldFor(block.field)?.label || block.label || "Order field";
}

function blockTypeLabel(block: TemplateBlock) {
  if (block.type === "items") {
    return "Items";
  }

  if (block.type === "image") {
    return "Image";
  }

  if (block.type === "text") {
    return "Text";
  }

  return "Field";
}

function normalizeHex(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function normalizeBlockGeometry(block: TemplateBlock): TemplateBlock {
  const w = clamp(Number(block.w) || 220, MIN_BLOCK_WIDTH, CANVAS_WIDTH);
  const h = clamp(Number(block.h) || 56, MIN_BLOCK_HEIGHT, CANVAS_HEIGHT);

  return {
    ...block,
    x: clamp(Number(block.x) || 0, 0, CANVAS_WIDTH - w),
    y: clamp(Number(block.y) || 0, 0, CANVAS_HEIGHT - h),
    w,
    h,
    fontSize: clamp(Number(block.fontSize) || 12, 8, 72),
    fontWeight: block.fontWeight === "700" ? "700" : "400",
    align:
      block.align === "center" || block.align === "right"
        ? block.align
        : "left",
    color: normalizeHex(block.color, "#111827"),
    background:
      block.background === "transparent"
        ? "transparent"
        : normalizeHex(block.background, "transparent"),
    border: block.border === true,
    padding: clamp(Number(block.padding) || 0, 0, 48),
    showImages: block.showImages !== false,
    showSku: block.showSku !== false,
  };
}

function previewStyle(block: TemplateBlock): CSSProperties {
  return {
    left: block.x,
    top: block.y,
    width: block.w,
    height: block.h,
    fontSize: block.fontSize || 12,
    fontWeight: block.fontWeight || "400",
    textAlign: block.align || "left",
    color: block.color || "#111827",
    background:
      block.background && block.background !== "transparent"
        ? block.background
        : "transparent",
    border: block.border ? "1px solid #d1d5db" : undefined,
    padding: block.padding || 0,
  };
}

function createTemplateBlock(
  type: TemplateBlock["type"],
  field: string,
  index: number,
): TemplateBlock {
  const offset = (index % 8) * 12;
  const selectedField = fieldFor(field);

  return normalizeBlockGeometry({
    id: `${type}-${Date.now()}-${index}`,
    type,
    x: 48 + offset,
    y: 48 + offset,
    w: type === "items" ? 680 : type === "image" ? 150 : 240,
    h: type === "items" ? 330 : type === "image" ? 130 : 64,
    field: type === "field" || type === "image" ? field : "",
    text:
      type === "text"
        ? "Custom text with {{order.name}} or any field token"
        : "",
    imageUrl: "",
    label: type === "field" ? selectedField?.label || "Order field" : "",
    fontSize: type === "text" ? 14 : 12,
    fontWeight: type === "field" ? "700" : "400",
    align: "left",
    color: "#111827",
    background: "transparent",
    border: false,
    padding: 0,
    showImages: true,
    showSku: true,
  });
}

function resizeBlock(
  original: TemplateBlock,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  snapToGrid: boolean,
) {
  const right = original.x + original.w;
  const bottom = original.y + original.h;
  let x = original.x;
  let y = original.y;
  let w = original.w;
  let h = original.h;

  if (handle.includes("e")) {
    w = clamp(
      snapValue(original.w + deltaX, snapToGrid),
      MIN_BLOCK_WIDTH,
      CANVAS_WIDTH - original.x,
    );
  }

  if (handle.includes("s")) {
    h = clamp(
      snapValue(original.h + deltaY, snapToGrid),
      MIN_BLOCK_HEIGHT,
      CANVAS_HEIGHT - original.y,
    );
  }

  if (handle.includes("w")) {
    x = clamp(
      snapValue(original.x + deltaX, snapToGrid),
      0,
      right - MIN_BLOCK_WIDTH,
    );
    w = right - x;
  }

  if (handle.includes("n")) {
    y = clamp(
      snapValue(original.y + deltaY, snapToGrid),
      0,
      bottom - MIN_BLOCK_HEIGHT,
    );
    h = bottom - y;
  }

  return normalizeBlockGeometry({ ...original, x, y, w, h });
}

function SampleItemsTable({ block }: { block: TemplateBlock }) {
  return (
    <table className="template-sample-table">
      <thead>
        <tr>
          <th>Qty</th>
          {block.showImages !== false ? <th>Image</th> : null}
          <th>Product</th>
        </tr>
      </thead>
      <tbody>
        {SAMPLE_LINES.map((line) => (
          <tr key={line.sku}>
            <td>{line.quantity}</td>
            {block.showImages !== false ? (
              <td>
                <span className="sample-product-image" />
              </td>
            ) : null}
            <td>
              <strong>{line.title}</strong>
              {block.showSku !== false ? (
                <span className="template-sample-meta">SKU: {line.sku}</span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TemplateBlockPreview({ block }: { block: TemplateBlock }) {
  if (block.type === "items") {
    return <SampleItemsTable block={block} />;
  }

  if (block.type === "image") {
    const shouldShowProductImage = block.field === "items.firstImage";

    if (block.imageUrl && !shouldShowProductImage) {
      return (
        <img alt="" className="template-preview-image" src={block.imageUrl} />
      );
    }

    return (
      <span className="template-image-placeholder">
        {shouldShowProductImage ? "Product image" : "Image"}
      </span>
    );
  }

  if (block.type === "text") {
    return <span>{lineBreaks(replaceSampleTokens(block.text))}</span>;
  }

  return (
    <>
      {block.label ? (
        <span className="template-preview-label">{block.label}</span>
      ) : null}
      <span>{lineBreaks(fieldSample(block.field))}</span>
    </>
  );
}

function TemplateDesigner({
  template,
  saving,
  canSaveTemplate,
}: {
  template: { name: string; design: TemplateDesign };
  saving: boolean;
  canSaveTemplate: boolean;
}) {
  const [name, setName] = useState(template.name);
  const [design, setDesign] = useState<TemplateDesign>(() =>
    copyDesign(template.design),
  );
  const [selectedId, setSelectedId] = useState(
    template.design.blocks[0]?.id || "",
  );
  const [zoom, setZoom] = useState(0.75);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [tokenField, setTokenField] = useState(TEMPLATE_FIELDS[0]?.value || "");
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const operationRef = useRef<CanvasOperation | null>(null);
  const selectedBlock = useMemo(
    () => design.blocks.find((block) => block.id === selectedId) || null,
    [design.blocks, selectedId],
  );
  const selectedIndex = selectedBlock
    ? design.blocks.findIndex((block) => block.id === selectedBlock.id)
    : -1;
  const dirty =
    name !== template.name ||
    JSON.stringify(design) !== JSON.stringify(template.design);

  useEffect(() => {
    const nextDesign = copyDesign(template.design);

    setName(template.name);
    setDesign(nextDesign);
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }, [template.design, template.name]);

  function updateBlock(id: string, patch: Partial<TemplateBlock>) {
    setDesign((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === id
          ? normalizeBlockGeometry({ ...block, ...patch })
          : block,
      ),
    }));
  }

  function addBlock(type: TemplateBlock["type"], field = "order.name") {
    const block = createTemplateBlock(type, field, design.blocks.length);

    setDesign((current) => ({
      ...current,
      blocks: [...current.blocks, block],
    }));
    setSelectedId(block.id);
  }

  function duplicateSelectedBlock() {
    if (!selectedBlock) {
      return;
    }

    const duplicate = normalizeBlockGeometry({
      ...selectedBlock,
      id: `${selectedBlock.type}-${Date.now()}`,
      x: selectedBlock.x + 16,
      y: selectedBlock.y + 16,
    });

    setDesign((current) => ({
      ...current,
      blocks: [...current.blocks, duplicate],
    }));
    setSelectedId(duplicate.id);
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

  function moveLayer(direction: -1 | 1) {
    if (selectedIndex < 0) {
      return;
    }

    const targetIndex = selectedIndex + direction;

    if (targetIndex < 0 || targetIndex >= design.blocks.length) {
      return;
    }

    setDesign((current) => {
      const blocks = [...current.blocks];
      const [block] = blocks.splice(selectedIndex, 1);

      blocks.splice(targetIndex, 0, block);

      return { ...current, blocks };
    });
  }

  function revertTemplate() {
    const nextDesign = copyDesign(template.design);

    setName(template.name);
    setDesign(nextDesign);
    setSelectedId(nextDesign.blocks[0]?.id || "");
  }

  function canvasPoint(event: PointerEvent) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / CANVAS_WIDTH || 1;

    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  }

  function startMove(
    event: PointerEvent<HTMLDivElement>,
    block: TemplateBlock,
  ) {
    if ((event.target as HTMLElement).dataset.resizeHandle) {
      return;
    }

    const point = canvasPoint(event);

    operationRef.current = {
      mode: "move",
      id: block.id,
      startX: point.x,
      startY: point.y,
      original: block,
    };
    setSelectedId(block.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startResize(
    event: PointerEvent<HTMLSpanElement>,
    block: TemplateBlock,
    handle: ResizeHandle,
  ) {
    const point = canvasPoint(event);

    operationRef.current = {
      mode: "resize",
      id: block.id,
      startX: point.x,
      startY: point.y,
      original: block,
      handle,
    };
    setSelectedId(block.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function updateCanvasOperation(event: PointerEvent<HTMLDivElement>) {
    const operation = operationRef.current;

    if (!operation) {
      return;
    }

    const point = canvasPoint(event);
    const deltaX = point.x - operation.startX;
    const deltaY = point.y - operation.startY;

    if (operation.mode === "move") {
      updateBlock(operation.id, {
        x: clamp(
          snapValue(operation.original.x + deltaX, snapToGrid),
          0,
          CANVAS_WIDTH - operation.original.w,
        ),
        y: clamp(
          snapValue(operation.original.y + deltaY, snapToGrid),
          0,
          CANVAS_HEIGHT - operation.original.h,
        ),
      });
      return;
    }

    const resized = resizeBlock(
      operation.original,
      operation.handle,
      deltaX,
      deltaY,
      snapToGrid,
    );

    updateBlock(operation.id, resized);
  }

  function stopCanvasOperation() {
    operationRef.current = null;
  }

  function nudgeSelectedBlock(deltaX: number, deltaY: number) {
    if (!selectedBlock) {
      return;
    }

    updateBlock(selectedBlock.id, {
      x: selectedBlock.x + deltaX,
      y: selectedBlock.y + deltaY,
    });
  }

  function handleBlockKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? GRID_SIZE : 1;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeSelectedBlock(-step, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeSelectedBlock(step, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nudgeSelectedBlock(0, -step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudgeSelectedBlock(0, step);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelectedBlock();
    }
  }

  function insertFieldToken() {
    if (!selectedBlock || selectedBlock.type !== "text") {
      return;
    }

    updateBlock(selectedBlock.id, {
      text: `${selectedBlock.text || ""} {{${tokenField}}}`.trim(),
    });
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
        <div className="template-topbar-actions">
          <span className={dirty ? "template-state dirty" : "template-state"}>
            {dirty ? "Unsaved" : "Saved"}
          </span>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={revertTemplate}
          >
            Revert
          </button>
          <button
            type="submit"
            disabled={saving || !canSaveTemplate || !design.blocks.length}
          >
            Save template
          </button>
        </div>
      </div>

      <div className="template-workspace">
        <aside className="template-sidebar">
          <div className="template-panel">
            <h3>Add block</h3>
            <div className="template-button-grid">
              <button type="button" onClick={() => addBlock("text")}>
                Text
              </button>
              <button type="button" onClick={() => addBlock("image", "")}>
                Image
              </button>
              <button
                type="button"
                onClick={() => addBlock("image", "items.firstImage")}
              >
                Product image
              </button>
              <button type="button" onClick={() => addBlock("items")}>
                Items table
              </button>
            </div>
          </div>

          <div className="template-panel">
            <h3>Fields</h3>
            <div className="field-list">
              {TEMPLATE_FIELD_GROUPS.map((group) => (
                <div className="field-group" key={group.label}>
                  <strong>{group.label}</strong>
                  {group.fields.map((field) => (
                    <button
                      key={field.value}
                      type="button"
                      onClick={() => addBlock("field", field.value)}
                    >
                      {field.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="template-panel">
            <h3>Layers</h3>
            <div className="template-layer-list">
              {[...design.blocks].reverse().map((block) => (
                <button
                  className={block.id === selectedId ? "selected" : ""}
                  key={block.id}
                  type="button"
                  onClick={() => setSelectedId(block.id)}
                >
                  <span>{blockLabel(block)}</span>
                  <small>{blockTypeLabel(block)}</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="template-stage-column">
          <div className="template-toolbar">
            <label>
              <span>Zoom</span>
              <select
                value={zoom}
                onChange={(event) => setZoom(Number(event.currentTarget.value))}
              >
                <option value={0.5}>50%</option>
                <option value={0.65}>65%</option>
                <option value={0.75}>75%</option>
                <option value={0.9}>90%</option>
                <option value={1}>100%</option>
              </select>
            </label>
            <label className="checkbox-row compact-checkbox">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(event) => setSnapToGrid(event.currentTarget.checked)}
              />
              <span>Snap</span>
            </label>
            <button
              type="button"
              disabled={!selectedBlock}
              onClick={duplicateSelectedBlock}
            >
              Duplicate
            </button>
            <button
              type="button"
              disabled={selectedIndex <= 0}
              onClick={() => moveLayer(-1)}
            >
              Back
            </button>
            <button
              type="button"
              disabled={
                selectedIndex < 0 || selectedIndex >= design.blocks.length - 1
              }
              onClick={() => moveLayer(1)}
            >
              Forward
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={!selectedBlock}
              onClick={removeSelectedBlock}
            >
              Delete
            </button>
          </div>

          <div className="template-stage">
            <div
              className="template-canvas-space"
              style={{
                width: CANVAS_WIDTH * zoom,
                height: CANVAS_HEIGHT * zoom,
              }}
            >
              <div
                className="template-canvas"
                onPointerCancel={stopCanvasOperation}
                onPointerMove={updateCanvasOperation}
                onPointerUp={stopCanvasOperation}
                ref={canvasRef}
                style={{
                  height: CANVAS_HEIGHT,
                  transform: `scale(${zoom})`,
                  width: CANVAS_WIDTH,
                }}
              >
                {design.blocks.map((block) => {
                  const selected = block.id === selectedId;

                  return (
                    <div
                      className={`template-block-preview ${
                        selected ? "selected" : ""
                      }`}
                      key={block.id}
                      onKeyDown={handleBlockKeyDown}
                      onPointerDown={(event) => startMove(event, block)}
                      role="button"
                      style={previewStyle(block)}
                      tabIndex={0}
                    >
                      <TemplateBlockPreview block={block} />
                      {selected
                        ? RESIZE_HANDLES.map((handle) => (
                            <span
                              className={`resize-handle ${handle}`}
                              data-resize-handle={handle}
                              key={handle}
                              onPointerDown={(event) =>
                                startResize(event, block, handle)
                              }
                            />
                          ))
                        : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="template-inspector">
          {selectedBlock ? (
            <>
              <div className="template-inspector-heading">
                <div>
                  <div className="field-label">Selected block</div>
                  <strong>{blockLabel(selectedBlock)}</strong>
                </div>
                <span>{blockTypeLabel(selectedBlock)}</span>
              </div>
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
                          fieldFor(event.currentTarget.value)?.label ||
                          selectedBlock.label,
                      })
                    }
                  >
                    {selectedBlock.type === "image" ? (
                      <option value="">Custom image URL</option>
                    ) : null}
                    {(selectedBlock.type === "image"
                      ? TEMPLATE_FIELDS.filter(
                          (field) => field.value === "items.firstImage",
                        )
                      : TEMPLATE_FIELDS
                    ).map((field) => (
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
              {selectedBlock.type === "text" ? (
                <div className="token-inserter">
                  <select
                    value={tokenField}
                    onChange={(event) =>
                      setTokenField(event.currentTarget.value)
                    }
                  >
                    {TEMPLATE_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={insertFieldToken}>
                    Insert field
                  </button>
                </div>
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
              {selectedBlock.type === "items" ? (
                <div className="option-grid">
                  <label className="checkbox-row compact-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedBlock.showImages !== false}
                      onChange={(event) =>
                        updateBlock(selectedBlock.id, {
                          showImages: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>Images</span>
                  </label>
                  <label className="checkbox-row compact-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedBlock.showSku !== false}
                      onChange={(event) =>
                        updateBlock(selectedBlock.id, {
                          showSku: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>SKUs</span>
                  </label>
                </div>
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
              <div className="style-grid">
                <label>
                  <span>Text</span>
                  <input
                    type="color"
                    value={normalizeHex(selectedBlock.color, "#111827")}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        color: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Fill</span>
                  <input
                    disabled={selectedBlock.background === "transparent"}
                    type="color"
                    value={
                      selectedBlock.background === "transparent"
                        ? "#ffffff"
                        : normalizeHex(selectedBlock.background, "#ffffff")
                    }
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        background: event.currentTarget.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="option-grid">
                <label className="checkbox-row compact-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedBlock.background !== "transparent"}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        background: event.currentTarget.checked
                          ? "#ffffff"
                          : "transparent",
                      })
                    }
                  />
                  <span>Fill</span>
                </label>
                <label className="checkbox-row compact-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedBlock.border === true}
                    onChange={(event) =>
                      updateBlock(selectedBlock.id, {
                        border: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Border</span>
                </label>
              </div>
              <label>
                <span>Padding</span>
                <input
                  min="0"
                  type="number"
                  value={selectedBlock.padding || 0}
                  onChange={(event) =>
                    updateBlock(selectedBlock.id, {
                      padding: Number(event.currentTarget.value),
                    })
                  }
                />
              </label>
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
          <TemplateDesigner
            canSaveTemplate={Boolean(data.rule)}
            template={data.template}
            saving={saving}
          />
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
