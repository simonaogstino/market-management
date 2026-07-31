import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Prisma CLI resolves relative `file:` URLs against the schema directory.
 * Prisma Client resolves them against `process.cwd()`.
 * On hosts like Airo those differ, so relative URLs create/read different DB files.
 * Force an absolute `file:` URL before any Prisma usage.
 */
export function normalizeSqliteDatabaseUrl(monorepoRoot?: string): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;

  if (!raw.startsWith("file:")) {
    return raw;
  }

  let filePath = raw.slice("file:".length);
  if (
    (filePath.startsWith('"') && filePath.endsWith('"')) ||
    (filePath.startsWith("'") && filePath.endsWith("'"))
  ) {
    filePath = filePath.slice(1, -1);
  }

  // file:///abs -> /abs
  if (filePath.startsWith("///")) {
    filePath = filePath.slice(2);
  }

  if (!isAbsolute(filePath)) {
    const root = monorepoRoot ?? findMonorepoRootFromCwd();
    const rel = filePath.replace(/^\.\//, "");
    filePath = resolve(join(root, "packages", "database", "prisma", rel));
  }

  const normalized = `file:${filePath}`;
  if (process.env.DATABASE_URL !== normalized) {
    process.env.DATABASE_URL = normalized;
    console.info(`[INFO] DATABASE_URL normalized to ${normalized}`);
  }
  return normalized;
}

export function findMonorepoRootFromCwd(): string {
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
