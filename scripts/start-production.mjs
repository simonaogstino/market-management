import { execSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = process.env.LOG_DIR?.trim() || join(root, "logs");
const template = join(root, "packages", "database", "prisma", "airo-template.db");

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

function ensureSqlite() {
  if (!existsSync(template)) {
    throw new Error(`Seeded template DB missing: ${template}`);
  }

  let targetUrl = process.env.DATABASE_URL?.trim() || `file:${template}`;
  let targetPath = targetUrl.startsWith("file:")
    ? targetUrl.slice("file:".length).replace(/^["']|["']$/g, "")
    : null;

  if (!targetPath) {
    throw new Error(`DATABASE_URL must be a SQLite file: URL, got: ${targetUrl}`);
  }
  if (targetPath.startsWith("///")) targetPath = targetPath.slice(2);

  if (!targetPath.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(targetPath)) {
    targetPath = join(
      root,
      "packages",
      "database",
      "prisma",
      targetPath.replace(/^\.\//, ""),
    );
  }

  process.env.DATABASE_URL = `file:${targetPath}`;

  const needsInstall =
    !existsSync(targetPath) ||
    statSync(targetPath).size < 10_000 ||
    process.env.FORCE_DB_SEED === "1";

  if (needsInstall && targetPath !== template) {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(template, targetPath);
    console.info(`[INFO] Installed seeded SQLite DB -> ${targetPath}`);
  } else {
    console.info(`[INFO] SQLite ready at ${targetPath}`);
  }

  console.info(`[INFO] DATABASE_URL=${process.env.DATABASE_URL}`);
}

console.log("Market Management — production start\n");
console.log(`Logs directory: ${logDir}\n`);

try {
  run("node scripts/check-env.mjs");
  ensureSqlite();
  run("npm run start -w @market/web");
} catch (err) {
  logStartup("Production start failed", err);
  process.exit(1);
}
