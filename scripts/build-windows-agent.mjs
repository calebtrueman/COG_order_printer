import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "dist", "windows-agent");
const cacheDir = join(rootDir, ".cache", "windows-agent");
const agentExe = join(outDir, "COGOrderPrinterAgent.exe");
const setupExe = join(outDir, "COGOrderPrinterAgentSetup.exe");
const serviceExe = join(outDir, "COGOrderPrinterAgent.Service.exe");
const sumatraSource = join(
  rootDir,
  "node_modules",
  "pdf-to-printer",
  "dist",
  "SumatraPDF-3.4.6-32.exe",
);
const winswSource = join(cacheDir, "WinSW-x64.exe");
const winswUrl =
  "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    shell: false,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }
}

async function download(url, destination) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed with ${response.status}: ${url}`);
  }

  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function ensureWindowsServiceWrapper() {
  await mkdir(cacheDir, { recursive: true });

  if (!existsSync(winswSource)) {
    console.log("Downloading WinSW service wrapper...");
    await download(winswUrl, winswSource);
  }

  await copyFile(winswSource, serviceExe);
}

async function writeAgentFiles() {
  await writeFile(
    join(outDir, "agent-config.example.json"),
    `${JSON.stringify(
      {
        appUrl: "https://cog-order-printer.vercel.app",
        token: "paste-token-from-shopify-app",
        agentName: "COG shipping station",
        pollIntervalMs: 5000,
        windows: {
          browserPath: "",
          sumatraPath: "SumatraPDF.exe",
        },
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    join(outDir, "COGOrderPrinterAgent.Service.xml"),
    `<service>
  <id>COGOrderPrinterAgent</id>
  <name>COG Order Printer Agent</name>
  <description>Polls COG Order Printer and prints packing slips on this Windows machine.</description>
  <executable>%BASE%\\COGOrderPrinterAgent.exe</executable>
  <workingdirectory>%BASE%</workingdirectory>
  <startmode>Automatic</startmode>
  <stoptimeout>15 sec</stoptimeout>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>%BASE%\\logs</logpath>
  <log mode="roll-by-size-time">
    <sizeThreshold>10485760</sizeThreshold>
    <pattern>yyyyMMdd</pattern>
    <autoRollAtTime>00:00:00</autoRollAtTime>
    <zipOlderThanNumDays>7</zipOlderThanNumDays>
    <keepFiles>8</keepFiles>
  </log>
</service>
`,
  );

  await writeFile(
    join(outDir, "README-WINDOWS.txt"),
    `COG Order Printer Agent for Windows

This folder is self-contained for a Windows shipping computer. It does not need Node.js, npm, Shopify CLI, Git, or any development tools.
It also does not require PowerShell scripts. Installation and service control are handled by executable files.

Files:
- COGOrderPrinterAgent.exe: the print polling agent
- COGOrderPrinterAgentSetup.exe: installer/config/service-control executable
- COGOrderPrinterAgent.Service.exe: Windows service wrapper
- SumatraPDF.exe: PDF print helper
- agent-config.json: local app URL/token config

Install:
1. Copy this folder to the Windows machine, for example C:\\COGOrderPrinterAgent.
2. Right-click COGOrderPrinterAgentSetup.exe and choose Run as administrator.
3. If Notepad opens, paste the token from the Shopify app into agent-config.json, save, and close Notepad.
4. Setup will install and start the Windows service.

Useful executable commands from an Administrator Command Prompt:

COGOrderPrinterAgentSetup.exe install
COGOrderPrinterAgentSetup.exe config
COGOrderPrinterAgentSetup.exe run
COGOrderPrinterAgentSetup.exe restart
COGOrderPrinterAgentSetup.exe status
COGOrderPrinterAgentSetup.exe uninstall

Use "run" before installing if you want to test in the foreground.

Logs are written to the logs folder next to the service executable.

The service starts automatically after reboot. When it starts or detects a long
sleep/lid-close gap, it asks the app to reconcile open Shopify orders created
since the latest automatic print, queues any missed packing slips, then prints
the queued jobs.
`,
  );

  await writeFile(
    join(outDir, "THIRD-PARTY-NOTICES.txt"),
    `This Windows agent package includes third-party executables:

WinSW
- Project: https://github.com/winsw/winsw
- License: MIT
- Purpose: runs the agent executable as a Windows service

SumatraPDF
- Project: https://www.sumatrapdfreader.org/
- License: GPLv3
- Purpose: silently sends generated PDF packing slips to a named Windows printer
`,
  );

  const pdfToPrinterLicense = join(
    rootDir,
    "node_modules",
    "pdf-to-printer",
    "LICENSE",
  );
  if (existsSync(pdfToPrinterLicense)) {
    await writeFile(
      join(outDir, "PDF-TO-PRINTER-LICENSE.txt"),
      await readFile(pdfToPrinterLicense, "utf8"),
    );
  }
}

function buildAgentExe() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  run(npx, [
    "pkg",
    "scripts/print-agent.mjs",
    "--targets",
    "node20-win-x64",
    "--output",
    agentExe,
  ]);
}

function buildSetupExe() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  run(npx, [
    "pkg",
    "scripts/windows-agent-manager.mjs",
    "--targets",
    "node20-win-x64",
    "--output",
    setupExe,
  ]);
}

function createZip() {
  const zipPath = join(rootDir, "dist", "COGOrderPrinterAgent-windows-x64.zip");

  if (existsSync(zipPath)) {
    rmSync(zipPath);
  }

  if (process.platform === "win32") {
    run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipPath}' -Force`,
    ]);
    return;
  }

  if (existsSync("/usr/bin/zip") || existsSync("/opt/homebrew/bin/zip")) {
    run("zip", ["-r", zipPath, "windows-agent"], {
      cwd: join(rootDir, "dist"),
    });
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

console.log("Building Windows agent executable...");
buildAgentExe();
console.log("Building Windows setup executable...");
buildSetupExe();
await copyFile(sumatraSource, join(outDir, "SumatraPDF.exe"));
await ensureWindowsServiceWrapper();
await writeAgentFiles();
createZip();

console.log(`Windows agent package created at ${outDir}`);
