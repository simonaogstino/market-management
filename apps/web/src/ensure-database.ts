import { execSync } from "node:child_process";
import { join } from "node:path";

const globalEnsure = globalThis as unknown as {
  __marketDbEnsured?: boolean;
  __marketDbEnsurePromise?: Promise<void>;
};

function schemaMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("P2021") || msg.includes("does not exist");
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

async function applySchemaAndSeed(root: string) {
  const schema = join(root, "packages", "database", "prisma", "schema.prisma");
  const dbPkg = join(root, "packages", "database");

  console.info("[INFO] Database schema missing — running prisma db push + seed");
  console.info(`[INFO] schema=${schema}`);
  console.info(`[INFO] DATABASE_URL=${process.env.DATABASE_URL}`);

  execSync(`npx prisma db push --schema "${schema}" --skip-generate --accept-data-loss`, {
    cwd: dbPkg,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  execSync("npx tsx prisma/seed.ts", {
    cwd: dbPkg,
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

    const {
      findMonorepoRootFromCwd,
      normalizeSqliteDatabaseUrl,
      resetPrismaClient,
    } = await import("@market/database");

    const root = findMonorepoRootFromCwd();
    normalizeSqliteDatabaseUrl(root);
    await resetPrismaClient();

    if (await tablesReady()) {
      globalEnsure.__marketDbEnsured = true;
      console.info("[INFO] Database schema already present");
      return;
    }

    await applySchemaAndSeed(root);
    await resetPrismaClient();

    if (!(await tablesReady())) {
      throw new Error(
        `Database schema still missing after db:push (DATABASE_URL=${process.env.DATABASE_URL})`,
      );
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
