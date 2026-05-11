import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const scriptDir = dirname(fileURLToPath(import.meta.url));
function argValue(name) {
  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function hasArg(name) {
  return process.argv.includes(name);
}

const baseDir = resolve(
  argValue("--target-dir") ||
    (process.pkg ? dirname(process.execPath) : join(scriptDir, "..")),
);
const configPath = join(baseDir, "agent-config.json");
const exampleConfigPath = join(baseDir, "agent-config.example.json");
const serviceExe = join(baseDir, "COGOrderPrinterAgent.Service.exe");
const agentExe = join(baseDir, "COGOrderPrinterAgent.exe");
const versionPath = join(baseDir, "agent-version.json");
const defaultUpdateRepo = "calebtrueman/COG_order_printer";
const defaultUpdateAsset = "COGOrderPrinterAgent-windows-x64.zip";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: baseDir,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

function runQuiet(command, args) {
  return spawnSync(command, args, {
    cwd: baseDir,
    encoding: "utf8",
    windowsHide: true,
  });
}

function validateConfig() {
  if (!existsSync(configPath)) {
    return "agent-config.json does not exist.";
  }

  let config;

  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    return `agent-config.json is not valid JSON: ${
      error instanceof Error ? error.message : "Unknown error."
    }`;
  }

  if (!config.appUrl || typeof config.appUrl !== "string") {
    return "agent-config.json needs appUrl.";
  }

  if (
    !config.token ||
    typeof config.token !== "string" ||
    config.token === "paste-token-from-shopify-app"
  ) {
    return "agent-config.json needs the print-agent token from the Shopify app.";
  }

  return null;
}

function readConfig() {
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function readLocalVersion() {
  if (!existsSync(versionPath)) {
    return "";
  }

  try {
    const parsed = JSON.parse(readFileSync(versionPath, "utf8"));

    return typeof parsed.releaseTag === "string" ? parsed.releaseTag : "";
  } catch {
    return "";
  }
}

function ensureConfigFile() {
  if (existsSync(configPath)) {
    return false;
  }

  if (!existsSync(exampleConfigPath)) {
    throw new Error("agent-config.example.json is missing from this folder.");
  }

  copyFileSync(exampleConfigPath, configPath);
  return true;
}

function openConfigEditor() {
  if (process.platform === "win32") {
    run("notepad.exe", [configPath]);
    return;
  }

  console.log(`Edit ${configPath}, then run this command again.`);
}

function ensureValidConfig({ openEditor = false } = {}) {
  const created = ensureConfigFile();
  let error = validateConfig();

  if (!error) {
    return;
  }

  console.log(
    created
      ? "Created agent-config.json."
      : "agent-config.json needs an update.",
  );
  console.log(error);

  if (openEditor) {
    console.log(
      "Opening agent-config.json. Save it, close Notepad, then setup will continue.",
    );
    openConfigEditor();
    error = validateConfig();
  }

  if (error) {
    throw new Error(
      `${error} Run "COGOrderPrinterAgentSetup.exe config" to edit it.`,
    );
  }
}

function ensureFiles() {
  for (const filePath of [serviceExe, agentExe]) {
    if (!existsSync(filePath)) {
      throw new Error(`${filePath} is missing from this folder.`);
    }
  }
}

function service(action, { optional = false } = {}) {
  ensureFiles();
  const result = runQuiet(serviceExe, [action]);

  if (result.status === 0 || optional) {
    if (result.stdout?.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr?.trim()) {
      console.error(result.stderr.trim());
    }
    return result.status;
  }

  throw new Error(
    `${serviceExe} ${action} failed.\n${result.stderr || result.stdout || ""}`,
  );
}

function install() {
  ensureValidConfig({ openEditor: true });
  service("install");
  service("start");
  console.log("COG Order Printer Agent service installed and started.");
}

function uninstall() {
  service("stop", { optional: true });
  service("uninstall");
  console.log("COG Order Printer Agent service stopped and uninstalled.");
}

function restart() {
  service("restart");
  console.log("COG Order Printer Agent service restarted.");
}

function start() {
  ensureValidConfig({ openEditor: false });
  service("start");
  console.log("COG Order Printer Agent service started.");
}

function stop() {
  service("stop");
  console.log("COG Order Printer Agent service stopped.");
}

function status() {
  service("status");
}

function runForeground() {
  ensureValidConfig({ openEditor: true });
  run(agentExe, []);
}

function config() {
  ensureConfigFile();
  openConfigEditor();
  const error = validateConfig();

  if (error) {
    throw new Error(error);
  }

  console.log("agent-config.json looks valid.");
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "COGOrderPrinterAgentSetup",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed with ${response.status}: ${url}`);
  }

  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function latestRelease(repo) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "COGOrderPrinterAgentSetup",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub latest release lookup failed with ${response.status}.`,
    );
  }

  return response.json();
}

function extractedPackageRoot(stagingDir) {
  const nested = join(stagingDir, "windows-agent");

  return existsSync(nested) ? nested : stagingDir;
}

function copyPackageFiles(sourceDir) {
  for (const name of readdirSync(sourceDir)) {
    if (name === "agent-config.json" || name === "logs") {
      continue;
    }

    cpSync(join(sourceDir, name), join(baseDir, name), {
      recursive: true,
      force: true,
    });
  }
}

async function stageUpdate({ assetUrl, releaseTag }) {
  const tempDir = await mkdtemp(join(tmpdir(), "cog-order-printer-update-"));
  const zipPath = join(tempDir, "agent.zip");
  const extractDir = join(tempDir, "extracted");
  const updaterExe = join(tempDir, "COGOrderPrinterAgentSetup.apply.exe");

  mkdirSync(extractDir, { recursive: true });
  await download(assetUrl, zipPath);
  new AdmZip(zipPath).extractAllTo(extractDir, true);
  copyFileSync(process.execPath, updaterExe);

  const child = spawn(
    updaterExe,
    [
      "apply-update",
      "--staging-dir",
      extractDir,
      "--target-dir",
      baseDir,
      "--tag",
      releaseTag,
    ],
    {
      cwd: baseDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );

  child.unref();
}

async function update() {
  const configObject = readConfig();
  const updateConfig =
    configObject.updates &&
    typeof configObject.updates === "object" &&
    !Array.isArray(configObject.updates)
      ? configObject.updates
      : {};
  const repo =
    typeof updateConfig.repo === "string" && updateConfig.repo.trim()
      ? updateConfig.repo.trim()
      : defaultUpdateRepo;
  const assetName =
    typeof updateConfig.assetName === "string" && updateConfig.assetName.trim()
      ? updateConfig.assetName.trim()
      : defaultUpdateAsset;
  const release = await latestRelease(repo);
  const releaseTag = String(release.tag_name || "").trim();
  const localTag = readLocalVersion();

  if (!releaseTag) {
    throw new Error("GitHub latest release did not include a tag name.");
  }

  if (!hasArg("--force") && localTag === releaseTag) {
    if (!hasArg("--quiet")) {
      console.log(`Already running latest agent release ${releaseTag}.`);
    }
    return false;
  }

  const asset = Array.isArray(release.assets)
    ? release.assets.find((item) => item.name === assetName)
    : null;

  if (!asset?.browser_download_url) {
    throw new Error(`Release ${releaseTag} does not include ${assetName}.`);
  }

  console.log(
    `Updating COG Order Printer Agent from ${localTag || "unknown"} to ${releaseTag}.`,
  );
  await stageUpdate({ assetUrl: asset.browser_download_url, releaseTag });
  console.log("Update staged. The service will restart shortly.");
  return true;
}

function applyUpdate() {
  const stagingDir = argValue("--staging-dir");
  const releaseTag = argValue("--tag") || "unknown";

  if (!stagingDir || !existsSync(stagingDir)) {
    throw new Error("Missing staged update folder.");
  }

  service("stop", { optional: true });
  copyPackageFiles(extractedPackageRoot(stagingDir));
  writeFileSync(
    versionPath,
    `${JSON.stringify(
      {
        releaseTag,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  service("start", { optional: true });
  rmSync(dirname(stagingDir), { recursive: true, force: true });
}

function help() {
  console.log(`COG Order Printer Agent Setup

Run this executable as Administrator for install/uninstall/start/stop.

Commands:
  install     Create config if needed, install the Windows service, and start it.
  config      Create/open agent-config.json in Notepad.
  run         Run the agent in the foreground for testing.
  start       Start the installed service.
  stop        Stop the installed service.
  restart     Restart the installed service.
  status      Show service status.
  update      Download and apply the latest GitHub release.
  uninstall   Stop and uninstall the service.
  help        Show this help.

Default command: install
`);
}

try {
  const command = String(process.argv[2] || "install").toLowerCase();

  if (command === "install") install();
  else if (command === "config") config();
  else if (command === "run") runForeground();
  else if (command === "start") start();
  else if (command === "stop") stop();
  else if (command === "restart") restart();
  else if (command === "status") status();
  else if (command === "update") {
    const staged = await update();

    if (staged && hasArg("--from-agent")) {
      process.exitCode = 10;
    }
  } else if (command === "apply-update") applyUpdate();
  else if (command === "uninstall") uninstall();
  else if (command === "help" || command === "--help" || command === "-h")
    help();
  else {
    help();
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
