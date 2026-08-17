import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const serverUrl = "http://127.0.0.1:5173";
const viteCli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const playwrightCli = path.join(
  projectRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

function canReachServer() {
  return new Promise((resolve) => {
    const request = http.get(serverUrl, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.setTimeout(500, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

async function waitForServer(serverProcess) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await canReachServer()) {
      return;
    }
    if (serverProcess.exitCode !== null) {
      throw new Error("The Vite server stopped before it became ready.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${serverUrl}.`);
}

function runPlaywright() {
  return new Promise((resolve, reject) => {
    const runner = spawn(
      process.execPath,
      [playwrightCli, "test", ...process.argv.slice(2)],
      { cwd: projectRoot, stdio: "inherit" },
    );
    runner.once("error", reject);
    runner.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright stopped with signal ${signal}.`));
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

let serverProcess = null;

try {
  if (!(await canReachServer())) {
    serverProcess = spawn(
      process.execPath,
      [viteCli, "--host", "127.0.0.1"],
      { cwd: projectRoot, stdio: "inherit" },
    );
    await waitForServer(serverProcess);
  }

  process.exitCode = await runPlaywright();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
  }
}
