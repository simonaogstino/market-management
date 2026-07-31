import { copyFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { dirname, join } from "path";

export const DB_ENSURE_VERSION = "2026-07-31-v4";

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

function candidateRoots(): string[] {
  const cwd = process.cwd();
  const roots = [
    cwd,
    join(cwd, ".."),
    join(cwd, "../.."),
    "/app",
    "/git-repo",
  ];
  // de-dupe
  return [...new Set(roots.map((r) => join(r)))];
}

function findTemplateDb(): string | null {
  for (const root of candidateRoots()) {
    const p = join(root, "packages", "database", "prisma", "airo-template.db");
    if (existsSync(p)) {
      console.info(`[INFO] ensureDatabase: found template at ${p}`);
      return p;
    }
  }

  // Last resort: search a couple levels for the filename
  for (const root of ["/app", process.cwd()]) {
    try {
      const prismaDir = join(root, "packages", "database", "prisma");
      if (!existsSync(prismaDir)) continue;
      const names = readdirSync(prismaDir);
      console.info(`[INFO] ensureDatabase: prisma dir ${prismaDir} files=${names.join(",")}`);
      if (names.includes("airo-template.db")) {
        return join(prismaDir, "airo-template.db");
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function tablesReady(): Promise<boolean> {
  try {
    const { getPrisma } = await import("@market/database");
    await getPrisma().$queryRaw`SELECT 1 FROM User LIMIT 1`;
    await getPrisma().$queryRaw`SELECT 1 FROM Terminal LIMIT 1`;
    return true;
  } catch (err) {
    if (schemaMissing(err)) return false;
    console.warn("[WARN] ensureDatabase: tablesReady error", err);
    return false;
  }
}

function installTemplateDb(template: string, targetUrl: string) {
  const targetPath = sqlitePathFromUrl(targetUrl);
  if (!targetPath) {
    // Point DATABASE_URL at the template itself.
    process.env.DATABASE_URL = `file:${template}`;
    console.info(`[INFO] ensureDatabase: pointing DATABASE_URL at template ${template}`);
    return;
  }

  if (targetPath === template) {
    console.info(`[INFO] ensureDatabase: DATABASE_URL already is template`);
    return;
  }

  try {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(template, targetPath);
    console.info(`[INFO] ensureDatabase: copied template -> ${targetPath}`);
  } catch (err) {
    // Sandbox may block writes — fall back to reading the template file directly.
    console.warn("[WARN] ensureDatabase: copy failed, using template path directly", err);
    process.env.DATABASE_URL = `file:${template}`;
  }
}

/**
 * Ensures SQLite has tables + seed data.
 * Uses committed `airo-template.db` (no prisma CLI needed).
 */
export async function ensureDatabase() {
  console.info(`[INFO] ensureDatabase: start version=${DB_ENSURE_VERSION} cwd=${process.cwd()}`);

  if (globalEnsure.__marketDbEnsured) {
    console.info("[INFO] ensureDatabase: already ready");
    return;
  }
  if (globalEnsure.__marketDbEnsurePromise) {
    await globalEnsure.__marketDbEnsurePromise;
    return;
  }

  globalEnsure.__marketDbEnsurePromise = (async () => {
    const {
      findMonorepoRootFromCwd,
      normalizeSqliteDatabaseUrl,
      resetPrismaClient,
    } = await import("@market/database");

    const root = findMonorepoRootFromCwd();
    console.info(`[INFO] ensureDatabase: monorepoRoot=${root}`);

    if (!process.env.DATABASE_URL?.trim()) {
      const template = findTemplateDb();
      if (!template) {
        throw new Error(
          `DATABASE_URL is not set and airo-template.db was not found (cwd=${process.cwd()})`,
        );
      }
      process.env.DATABASE_URL = `file:${template}`;
      console.info(`[INFO] ensureDatabase: defaulted DATABASE_URL to ${process.env.DATABASE_URL}`);
    }

    normalizeSqliteDatabaseUrl(root);
    await resetPrismaClient();

    if (await tablesReady()) {
      globalEnsure.__marketDbEnsured = true;
      console.info("[INFO] ensureDatabase: schema already present");
      return;
    }

    const template = findTemplateDb();
    if (!template) {
      throw new Error(
        `Tables missing and airo-template.db not found. Set DATABASE_URL to the seeded template. cwd=${process.cwd()}`,
      );
    }

    console.info("[INFO] ensureDatabase: tables missing — installing template");
    installTemplateDb(template, process.env.DATABASE_URL!);
    normalizeSqliteDatabaseUrl(root);
    await resetPrismaClient();

    if (!(await tablesReady())) {
      // Final fallback: use template file as the live database.
      process.env.DATABASE_URL = `file:${template}`;
      console.info(`[INFO] ensureDatabase: final fallback DATABASE_URL=${process.env.DATABASE_URL}`);
      await resetPrismaClient();
      if (!(await tablesReady())) {
        throw new Error(
          `Database still empty after template install (DATABASE_URL=${process.env.DATABASE_URL})`,
        );
      }
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
