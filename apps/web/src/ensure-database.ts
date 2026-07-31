import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const globalEnsure = globalThis as unknown as {
  __marketDbEnsured?: boolean;
  __marketDbEnsurePromise?: Promise<void>;
};

function findMonorepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "packages", "database", "prisma", "schema.prisma"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

function schemaMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("P2021") || msg.includes("does not exist");
}

async function tablesReady(): Promise<boolean> {
  try {
    const { prisma } = await import("@market/database");
    await prisma.terminal.findFirst();
    return true;
  } catch (err) {
    if (schemaMissing(err)) return false;
    throw err;
  }
}

async function applySchemaAndSeed(root: string) {
  console.info("[INFO] Database schema missing — running prisma db push + seed");

  execSync("npm run db:push", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  execSync("npm run db:seed", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

/** Creates SQLite tables + seed data if the DB file is empty (common on Airo/GoDaddy). */
export async function ensureDatabase() {
  if (globalEnsure.__marketDbEnsured) return;
  if (globalEnsure.__marketDbEnsurePromise) {
    await globalEnsure.__marketDbEnsurePromise;
    return;
  }

  globalEnsure.__marketDbEnsurePromise = (async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      console.error("[ERROR] DATABASE_URL is not set — cannot ensure database");
      return;
    }

    const root = findMonorepoRoot();

    if (await tablesReady()) {
      globalEnsure.__marketDbEnsured = true;
      return;
    }

    await applySchemaAndSeed(root);

    if (!(await tablesReady())) {
      throw new Error("Database schema still missing after db:push");
    }

    globalEnsure.__marketDbEnsured = true;
    console.info("[INFO] Database ready");
  })();

  try {
    await globalEnsure.__marketDbEnsurePromise;
  } finally {
    globalEnsure.__marketDbEnsurePromise = undefined;
  }
}
