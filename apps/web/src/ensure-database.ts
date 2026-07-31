import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const globalEnsure = globalThis as unknown as {
  __marketDbEnsured?: boolean;
  __marketDbEnsurePromise?: Promise<void>;
};

function schemaMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("P2021") || msg.includes("does not exist");
}

function sqlitePathFromUrl(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  let filePath = url.slice("file:".length);
  if (
    (filePath.startsWith('"') && filePath.endsWith('"')) ||
    (filePath.startsWith("'") && filePath.endsWith("'"))
  ) {
    filePath = filePath.slice(1, -1);
  }
  if (filePath.startsWith("///")) filePath = filePath.slice(2);
  return filePath;
}

async function tablesReady(): Promise<boolean> {
  try {
    const { getPrisma } = await import("@market/database");
    await getPrisma().user.findFirst();
    return true;
  } catch (err) {
    if (schemaMissing(err)) return false;
    throw err;
  }
}

function installTemplateDb(root: string, targetUrl: string) {
  const template = join(root, "packages", "database", "prisma", "airo-template.db");
  if (!existsSync(template)) {
    throw new Error(`Missing seeded template DB at ${template}`);
  }

  const targetPath = sqlitePathFromUrl(targetUrl);
  if (!targetPath) {
    throw new Error(`DATABASE_URL must be a file: SQLite URL, got: ${targetUrl}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(template, targetPath);
  console.info(`[INFO] Installed seeded SQLite template -> ${targetPath}`);
}

/**
 * Ensures SQLite has tables + seed data.
 * Uses a committed template DB copy (no prisma CLI needed at runtime) — required for Airo.
 *
 * Node-only: do not import this module from Edge or client code.
 */
export async function ensureDatabase() {
  console.info("[INFO] ensureDatabase: start");

  if (globalEnsure.__marketDbEnsured) {
    console.info("[INFO] ensureDatabase: already ready");
    return;
  }
  if (globalEnsure.__marketDbEnsurePromise) {
    await globalEnsure.__marketDbEnsurePromise;
    return;
  }

  globalEnsure.__marketDbEnsurePromise = (async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      console.error("[ERROR] DATABASE_URL is not set — cannot ensure database");
      return;
    }

    const {
      findMonorepoRootFromCwd,
      normalizeSqliteDatabaseUrl,
      resetPrismaClient,
    } = await import("@market/database");

    const root = findMonorepoRootFromCwd();
    const url = normalizeSqliteDatabaseUrl(root) ?? process.env.DATABASE_URL;
    await resetPrismaClient();

    if (await tablesReady()) {
      globalEnsure.__marketDbEnsured = true;
      console.info("[INFO] ensureDatabase: schema already present");
      return;
    }

    console.info("[INFO] ensureDatabase: tables missing — installing template DB");
    installTemplateDb(root, url);
    await resetPrismaClient();

    if (!(await tablesReady())) {
      throw new Error(
        `Database schema still missing after template install (DATABASE_URL=${process.env.DATABASE_URL})`,
      );
    }

    globalEnsure.__marketDbEnsured = true;
    console.info("[INFO] ensureDatabase: ready");
  })();

  try {
    await globalEnsure.__marketDbEnsurePromise;
  } finally {
    globalEnsure.__marketDbEnsurePromise = undefined;
  }
}
