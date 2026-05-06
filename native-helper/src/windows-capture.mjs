import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const helperRoot = path.resolve(__dirname, "..");

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      windowsHide: true,
      timeout: options.timeout || 6000,
      maxBuffer: options.maxBuffer || 1024 * 1024 * 4,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function runPowerShell(scriptName, args = [], options = {}) {
  const scriptPath = path.join(helperRoot, "scripts", scriptName);
  const stdout = await execFileText("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    ...args,
  ], options);
  return stdout.trim();
}

export async function captureActiveWindow({ maxElements = 160 } = {}) {
  if (process.platform !== "win32") {
    return {
      platform: process.platform,
      application: "device",
      process_name: "device",
      window_title: "",
      ui_text: [],
      capture_methods: ["unsupported_platform"],
      captured_at: new Date().toISOString(),
    };
  }

  const output = await runPowerShell("windows-observe.ps1", [
    "-MaxElements",
    String(maxElements),
  ], {
    timeout: 7000,
  });
  return JSON.parse(output || "{}");
}

export async function captureScreenOcr({ enabled = false, timeoutMs = 10000 } = {}) {
  if (!enabled || process.platform !== "win32") {
    return "";
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "memact-ocr-"));
  const imagePath = path.join(tempDir, "screen.png");

  try {
    await runPowerShell("windows-screenshot.ps1", [
      "-OutputPath",
      imagePath,
    ], {
      timeout: 5000,
    });
    const text = await execFileText("tesseract", [
      imagePath,
      "stdout",
      "--psm",
      "6",
    ], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 2,
    });
    return text.trim();
  } catch {
    return "";
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
