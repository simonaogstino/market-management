/**
 * Path helpers without Node builtins so this module is safe if pulled into a
 * Next client/edge graph via `@market/database`.
 */

function isAbsolutePath(filePath: string): boolean {
  return filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath);
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((p, i) => {
      const n = p.replace(/\\/g, "/");
      if (i === 0) return n.replace(/\/+$/, "");
      return n.replace(/^\/+|\/+$/g, "");
    })
    .filter(Boolean)
    .join("/");
}

/**
 * Prisma CLI resolves relative `file:` URLs against the schema directory.
 * Prisma Client resolves them against `process.cwd()`.
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

  if (!isAbsolutePath(filePath)) {
    const root = (monorepoRoot ?? findMonorepoRootFromCwd()).replace(/\\/g, "/");
    const rel = filePath.replace(/^\.\//, "");
    filePath = joinPath(root, "packages", "database", "prisma", rel);
  }

  // Windows: Prisma accepts file:C:\path\...
  if (/^[A-Za-z]:\//.test(filePath)) {
    filePath = filePath.replace(/\//g, "\\");
  }

  const normalized = `file:${filePath}`;
  if (process.env.DATABASE_URL !== normalized) {
    process.env.DATABASE_URL = normalized;
    console.info(`[INFO] DATABASE_URL normalized to ${normalized}`);
  }
  return normalized;
}

export function findMonorepoRootFromCwd(): string {
  const cwd = typeof process !== "undefined" ? process.cwd() : ".";
  const norm = cwd.replace(/\\/g, "/");

  if (norm.endsWith("/apps/web")) {
    return cwd.replace(/[/\\]apps[/\\]web$/i, "");
  }
  if (norm.endsWith("/packages/database")) {
    return cwd.replace(/[/\\]packages[/\\]database$/i, "");
  }
  if (norm.endsWith("/packages/database/prisma")) {
    return cwd.replace(/[/\\]packages[/\\]database[/\\]prisma$/i, "");
  }

  return cwd;
}
