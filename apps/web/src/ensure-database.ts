import { execSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";

export const DB_ENSURE_VERSION = "2026-07-31-v5";

const globalEnsure = globalThis as unknown as {
  __marketDbEnsuredVersion?: string;
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
  const roots = [cwd, join(cwd, ".."), join(cwd, "../.."), "/app", "/git-repo"];
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

  for (const root of ["/app", process.cwd()]) {
    try {
      const prismaDir = join(root, "packages", "database", "prisma");
      if (!existsSync(prismaDir)) continue;
      const names = readdirSync(prismaDir);
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
    const db = getPrisma();
    await db.$queryRaw`SELECT 1 FROM User LIMIT 1`;
    await db.$queryRaw`SELECT 1 FROM Terminal LIMIT 1`;
    await db.$queryRaw`SELECT 1 FROM CashSession LIMIT 1`;
    return true;
  } catch (err) {
    if (schemaMissing(err)) return false;
    console.warn("[WARN] ensureDatabase: tablesReady error", err);
    return false;
  }
}

function tryPrismaDbPush(root: string): boolean {
  const schema = join(root, "packages", "database", "prisma", "schema.prisma");
  const dbPkg = join(root, "packages", "database");
  if (!existsSync(schema)) return false;
  try {
    console.info("[INFO] ensureDatabase: applying schema via prisma db push");
    execSync(`npx prisma db push --schema "${schema}" --skip-generate`, {
      cwd: dbPkg,
      stdio: "inherit",
      env: process.env,
      // @types/node types `shell` as string (path), not boolean
      shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "/bin/sh",
    });
    return true;
  } catch (err) {
    console.warn("[WARN] ensureDatabase: prisma db push failed", err);
    return false;
  }
}

function installTemplateDb(template: string, targetUrl: string) {
  const targetPath = sqlitePathFromUrl(targetUrl);
  if (!targetPath) {
    process.env.DATABASE_URL = `file:${template}`;
    console.info(`[INFO] ensureDatabase: pointing DATABASE_URL at template ${template}`);
    return;
  }

  if (targetPath === template) {
    console.info(`[INFO] ensureDatabase: DATABASE_URL already is template`);
    return;
  }

  const existingSize = existsSync(targetPath) ? statSync(targetPath).size : 0;
  // Don't wipe a real local DB that already has data — only seed empty/tiny files.
  if (existingSize >= 10_000) {
    console.warn(
      `[WARN] ensureDatabase: refusing to overwrite existing DB (${existingSize} bytes); use db push instead`,
    );
    return;
  }

  try {
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(template, targetPath);
    console.info(`[INFO] ensureDatabase: copied template -> ${targetPath}`);
  } catch (err) {
    console.warn("[WARN] ensureDatabase: copy failed, using template path directly", err);
    process.env.DATABASE_URL = `file:${template}`;
  }
}

/** Ensures SQLite has required tables (including CashSession). */
export async function ensureDatabase() {
  console.info(`[INFO] ensureDatabase: start version=${DB_ENSURE_VERSION} cwd=${process.cwd()}`);

  if (globalEnsure.__marketDbEnsuredVersion === DB_ENSURE_VERSION) {
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
      globalEnsure.__marketDbEnsuredVersion = DB_ENSURE_VERSION;
      console.info("[INFO] ensureDatabase: schema already present");
      return;
    }

    // Prefer non-destructive schema sync for existing databases.
    tryPrismaDbPush(root);
    await resetPrismaClient();
    if (await tablesReady()) {
      globalEnsure.__marketDbEnsuredVersion = DB_ENSURE_VERSION;
      console.info("[INFO] ensureDatabase: ready after db push");
      return;
    }

    const template = findTemplateDb();
    if (!template) {
      throw new Error(
        `Cash/User tables missing and airo-template.db not found. Run: npm run db:push`,
      );
    }

    console.info("[INFO] ensureDatabase: tables missing — installing template if DB is empty");
    installTemplateDb(template, process.env.DATABASE_URL!);
    normalizeSqliteDatabaseUrl(root);
    await resetPrismaClient();

    if (!(await tablesReady())) {
      process.env.DATABASE_URL = `file:${template}`;
      console.info(`[INFO] ensureDatabase: final fallback DATABASE_URL=${process.env.DATABASE_URL}`);
      await resetPrismaClient();
      if (!(await tablesReady())) {
        throw new Error(
          `Database schema incomplete (need CashSession). Run: npm run db:push (DATABASE_URL=${process.env.DATABASE_URL})`,
        );
      }
    }

    globalEnsure.__marketDbEnsuredVersion = DB_ENSURE_VERSION;
    console.info("[INFO] ensureDatabase: ready");
  })();

  try {
    await globalEnsure.__marketDbEnsurePromise;
  } finally {
    globalEnsure.__marketDbEnsurePromise = undefined;
  }
}
