import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = process.env.LOG_DIR?.trim() || join(root, "logs");

function logStartup(message, err) {
  const line = `${new Date().toISOString()} [ERROR] ${message}${
    err ? ` ${err instanceof Error ? err.stack || err.message : String(err)}` : ""
  }\n`;
  console.error(line.trimEnd());
  try {
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, "error.log"), line, "utf8");
    appendFileSync(join(logDir, "app.log"), line, "utf8");
  } catch {
    /* ignore */
  }
}

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env });
}

console.log("Market Management — production start\n");
console.log(`Logs directory: ${logDir}\n`);

try {
  run("node scripts/check-env.mjs");
  run("npm run db:push");
  run("npm run db:seed");
  run("npm run start -w @market/web");
} catch (err) {
  logStartup("Production start failed", err);
  process.exit(1);
}
