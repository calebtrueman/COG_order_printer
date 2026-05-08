import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const baseDir = process.pkg ? dirname(process.execPath) : join(scriptDir, "..");
const configPath = join(baseDir, "agent-config.json");
const exampleConfigPath = join(baseDir, "agent-config.example.json");
const serviceExe = join(baseDir, "COGOrderPrinterAgent.Service.exe");
const agentExe = join(baseDir, "COGOrderPrinterAgent.exe");

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
