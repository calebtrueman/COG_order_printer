import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { hostname, platform, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packaged = Boolean(process.pkg);
const appDir = packaged ? dirname(process.execPath) : process.cwd();
const config = await loadConfig();
const windowsConfig = objectConfig(config.windows);

const appUrl = (
  process.env.SHOPIFY_PRINTER_AGENT_URL ||
  stringConfig(config.appUrl) ||
  ""
).replace(/\/$/, "");
const token =
  process.env.SHOPIFY_PRINTER_AGENT_TOKEN || stringConfig(config.token) || "";
const agentName =
  process.env.SHOPIFY_PRINTER_AGENT_NAME ||
  stringConfig(config.agentName) ||
  hostnameAgentName();
const pollIntervalMs = numberConfig(
  process.env.SHOPIFY_PRINTER_POLL_MS || config.pollIntervalMs,
  5000,
);

let stopped = false;

function hostnameAgentName() {
  return `print-agent-${hostname() || "local"}`;
}

function objectConfig(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stringConfig(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberConfig(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function loadConfig() {
  const explicit = process.env.SHOPIFY_PRINTER_AGENT_CONFIG;
  const candidates = [
    explicit,
    join(appDir, "agent-config.json"),
    join(process.cwd(), "agent-config.json"),
    join(scriptDir, "..", "agent-config.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const filePath = resolve(String(candidate));

    if (!existsSync(filePath)) {
      continue;
    }

    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON.";
      throw new Error(`Could not read ${filePath}: ${message}`);
    }
  }

  return {};
}

function requiredConfig() {
  if (!appUrl) {
    throw new Error(
      "SHOPIFY_PRINTER_AGENT_URL or agent-config.json appUrl is required.",
    );
  }

  if (!token) {
    throw new Error(
      "SHOPIFY_PRINTER_AGENT_TOKEN or agent-config.json token is required.",
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
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

function commandPath(command) {
  if (isAbsolute(command) && existsSync(command)) {
    return command;
  }

  if (command.includes("/") || command.includes("\\")) {
    const resolved = resolve(appDir, command);
    return existsSync(resolved) ? resolved : null;
  }

  try {
    const finder =
      platform() === "win32"
        ? run("where.exe", [command])
        : run("sh", ["-lc", `command -v ${shellQuote(command)}`]);
    return (
      finder
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) || null
    );
  } catch {
    return null;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function listPrinters() {
  return platform() === "win32" ? listWindowsPrinters() : listCupsPrinters();
}

function listCupsPrinters() {
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

function listWindowsPrinters() {
  const command = [
    "$printers = Get-CimInstance -ClassName Win32_Printer |",
    "Select-Object -Property Name,Default;",
    "$printers | ConvertTo-Json -Compress",
  ].join(" ");

  const stdout = run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ]).trim();

  if (!stdout) {
    return [];
  }

  const parsed = JSON.parse(stdout);
  const printers = Array.isArray(parsed) ? parsed : [parsed];

  return printers
    .map((printer) => ({
      name: stringConfig(printer.Name) || "",
      isDefault: printer.Default === true,
    }))
    .filter((printer) => printer.name);
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
    throw new Error(
      `${options.method || "GET"} ${path} failed: ${response.status} ${text}`,
    );
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
    `Registered ${printers.length} printer${printers.length === 1 ? "" : "s"}: ${
      printers.map((printer) => printer.name).join(", ") || "none"
    }`,
  );
}

async function syncMissedOrders(reason) {
  try {
    const result = await api("/api/agent/sync", {
      method: "POST",
      body: JSON.stringify({ reason }),
    });

    console.log(
      `Missed-order sync (${reason}): checked ${result.checked || 0}, queued ${
        result.queued || 0
      }, skipped ${result.skipped || 0}. ${result.reason || ""}`.trim(),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    console.error(`Missed-order sync (${reason}) failed: ${message}`);
  }
}

function browserCandidates() {
  if (platform() === "win32") {
    return [
      stringConfig(process.env.SHOPIFY_PRINTER_BROWSER_PATH),
      stringConfig(windowsConfig.browserPath),
      join(
        process.env.PROGRAMFILES || "C:\\Program Files",
        "Microsoft\\Edge\\Application\\msedge.exe",
      ),
      join(
        process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
        "Microsoft\\Edge\\Application\\msedge.exe",
      ),
      join(
        process.env.PROGRAMFILES || "C:\\Program Files",
        "Google\\Chrome\\Application\\chrome.exe",
      ),
      join(
        process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
        "Google\\Chrome\\Application\\chrome.exe",
      ),
      process.env.LOCALAPPDATA
        ? join(
            process.env.LOCALAPPDATA,
            "Microsoft\\Edge\\Application\\msedge.exe",
          )
        : null,
      process.env.LOCALAPPDATA
        ? join(
            process.env.LOCALAPPDATA,
            "Google\\Chrome\\Application\\chrome.exe",
          )
        : null,
      "msedge.exe",
      "chrome.exe",
    ].filter(Boolean);
  }

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
  for (const candidate of browserCandidates()) {
    const resolved = commandPath(candidate);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function sumatraCandidates() {
  return [
    stringConfig(process.env.SHOPIFY_PRINTER_SUMATRA_PATH),
    stringConfig(windowsConfig.sumatraPath),
    join(appDir, "SumatraPDF.exe"),
    join(appDir, "vendor", "SumatraPDF.exe"),
    join(
      scriptDir,
      "..",
      "node_modules",
      "pdf-to-printer",
      "dist",
      "SumatraPDF-3.4.6-32.exe",
    ),
  ].filter(Boolean);
}

function findSumatraPdf() {
  for (const candidate of sumatraCandidates()) {
    const resolved = commandPath(candidate);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function renderPdf(htmlPath, pdfPath, browserProfileDir) {
  const browser = findBrowser();

  if (!browser) {
    return false;
  }

  run(browser, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    `--user-data-dir=${browserProfileDir}`,
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ]);

  return true;
}

function printPdfWindows(pdfPath, printerName) {
  const sumatra = findSumatraPdf();

  if (!sumatra) {
    throw new Error(
      "SumatraPDF.exe was not found next to the agent. Rebuild the Windows package or set SHOPIFY_PRINTER_SUMATRA_PATH.",
    );
  }

  run(sumatra, ["-print-to", printerName, "-silent", pdfPath]);
}

async function printJob(job) {
  const dir = await mkdtemp(join(tmpdir(), "cog-order-printer-"));
  const htmlPath = join(dir, `${job.id}.html`);
  const pdfPath = join(dir, `${job.id}.pdf`);
  const browserProfileDir = join(dir, "browser-profile");

  try {
    await writeFile(htmlPath, job.html, "utf8");
    const renderedPdf = renderPdf(htmlPath, pdfPath, browserProfileDir);

    if (platform() === "win32") {
      if (!renderedPdf) {
        throw new Error(
          "Microsoft Edge or Google Chrome is required to render packing slips to PDF.",
        );
      }

      printPdfWindows(pdfPath, job.printerName);

      return {
        printed: true,
        message: "Printed generated PDF with SumatraPDF.",
      };
    }

    const printablePath = renderedPdf ? pdfPath : htmlPath;
    run("lp", ["-d", job.printerName, printablePath]);

    return {
      printed: true,
      message: renderedPdf
        ? "Printed generated PDF."
        : "Printed HTML directly.",
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
  await syncMissedOrders("startup");

  let lastRegister = Date.now();
  let lastSync = Date.now();
  let lastLoopAt = Date.now();

  while (!stopped) {
    const now = Date.now();
    const sleepGap = now - lastLoopAt;

    if (sleepGap > Math.max(pollIntervalMs * 3, 60 * 1000)) {
      await registerPrinters();
      await syncMissedOrders("wake");
      lastRegister = Date.now();
      lastSync = Date.now();
    } else if (now - lastSync > 15 * 60 * 1000) {
      await syncMissedOrders("interval");
      lastSync = Date.now();
    }

    lastLoopAt = Date.now();
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
