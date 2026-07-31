import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = join(root, "packages", "database", "prisma", "airo-template.db");

function sqlitePathFromUrl(url) {
  if (!url?.startsWith("file:")) return null;
  let p = url.slice("file:".length).replace(/^["']|["']$/g, "");
  if (p.startsWith("///")) p = p.slice(2);
  return p;
}

function ensureSqlite() {
  if (!existsSync(template)) {
    console.error(`[ERROR] Seeded template DB missing: ${template}`);
    process.exit(1);
  }

  let targetUrl = process.env.DATABASE_URL?.trim();
  if (!targetUrl) {
    targetUrl = `file:${join(root, "packages", "database", "prisma", "airo-template.db")}`;
  }

  let targetPath = sqlitePathFromUrl(targetUrl);
  if (!targetPath) {
    console.error(`[ERROR] DATABASE_URL must be a SQLite file: URL, got: ${targetUrl}`);
    process.exit(1);
  }

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

  if (needsInstall) {
    if (targetPath !== template) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(template, targetPath);
      console.info(`[INFO] Installed seeded SQLite DB -> ${targetPath}`);
    } else {
      console.info(`[INFO] Using seeded template DB at ${template}`);
    }
  } else {
    console.info(`[INFO] SQLite DB already present (${statSync(targetPath).size} bytes)`);
  }

  console.info(`[INFO] DATABASE_URL=${process.env.DATABASE_URL}`);
}

ensureSqlite();

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "dev", "-w", "@market/web"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
