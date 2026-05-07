import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const appUrl = (process.env.SHOPIFY_PRINTER_AGENT_URL || "").replace(/\/$/, "");
const token = process.env.SHOPIFY_PRINTER_AGENT_TOKEN || "";
const agentName = process.env.SHOPIFY_PRINTER_AGENT_NAME || hostnameAgentName();
const pollIntervalMs = Number(process.env.SHOPIFY_PRINTER_POLL_MS || 5000);

let stopped = false;

function hostnameAgentName() {
  const result = spawnSync("hostname", { encoding: "utf8" });
  return `print-agent-${(result.stdout || "local").trim() || "local"}`;
}

function requiredConfig() {
  if (!appUrl) {
    throw new Error("SHOPIFY_PRINTER_AGENT_URL is required.");
  }

  if (!token) {
    throw new Error("SHOPIFY_PRINTER_AGENT_TOKEN is required.");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }

  return result.stdout || "";
}

function listPrinters() {
  const stdout = run("lpstat", ["-e"]);
  const names = stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  let defaultPrinter = "";

  try {
    const defaultOutput = run("lpstat", ["-d"]);
    defaultPrinter = defaultOutput.replace(/^.*:\s*/, "").trim();
  } catch {
    defaultPrinter = "";
  }

  return names.map((name) => ({
    name,
    isDefault: name === defaultPrinter,
  }));
}

async function api(path, options = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-agent-name": agentName,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function registerPrinters() {
  const printers = listPrinters();

  await api("/api/agent/register", {
    method: "POST",
    body: JSON.stringify({ agentName, printers }),
  });

  console.log(
    `Registered ${printers.length} printer${printers.length === 1 ? "" : "s"}: ${printers
      .map((printer) => printer.name)
      .join(", ") || "none"}`,
  );
}

function chromeCandidates() {
  return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ];
}

function findBrowser() {
  for (const candidate of chromeCandidates()) {
    if (candidate.includes("/") && existsSync(candidate)) {
      return candidate;
    }

    if (!candidate.includes("/")) {
      const result = spawnSync("command", ["-v", candidate], {
        encoding: "utf8",
        shell: true,
      });

      if (result.status === 0 && result.stdout.trim()) {
        return result.stdout.trim();
      }
    }
  }

  return null;
}

function renderPdf(htmlPath, pdfPath) {
  const browser = findBrowser();

  if (!browser) {
    return false;
  }

  run(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ]);

  return true;
}

async function printJob(job) {
  const dir = await mkdtemp(join(tmpdir(), "cog-order-printer-"));
  const htmlPath = join(dir, `${job.id}.html`);
  const pdfPath = join(dir, `${job.id}.pdf`);

  try {
    await writeFile(htmlPath, job.html, "utf8");
    const renderedPdf = renderPdf(htmlPath, pdfPath);
    const printablePath = renderedPdf ? pdfPath : htmlPath;

    run("lp", ["-d", job.printerName, printablePath]);

    return {
      printed: true,
      message: renderedPdf ? "Printed generated PDF." : "Printed HTML directly.",
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function reportJob(jobId, printed, message) {
  await api(`/api/agent/jobs/${encodeURIComponent(jobId)}`, {
    method: "POST",
    body: JSON.stringify({ printed, message }),
  });
}

async function pollJobs() {
  const { jobs } = await api("/api/agent/jobs");

  for (const job of jobs) {
    console.log(`Printing ${job.orderName} on ${job.printerName}`);

    try {
      const result = await printJob(job);
      await reportJob(job.id, result.printed, result.message);
      console.log(`Printed ${job.orderName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Print failed.";
      await reportJob(job.id, false, message);
      console.error(`Failed ${job.orderName}: ${message}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  requiredConfig();
  await registerPrinters();

  let lastRegister = Date.now();

  while (!stopped) {
    await pollJobs();

    if (Date.now() - lastRegister > 5 * 60 * 1000) {
      await registerPrinters();
      lastRegister = Date.now();
    }

    await sleep(pollIntervalMs);
  }
}

process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
