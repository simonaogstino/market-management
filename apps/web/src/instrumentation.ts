/**
 * Keep this file free of Node built-ins (fs/path) and of ensure-database.
 * Next compiles instrumentation for Edge as well; importing fs there breaks the build.
 * DB ensure runs from auth / terminal API routes (Node runtime) instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  console.info(
    `[INFO] App started nodeEnv=${process.env.NODE_ENV ?? "unknown"} databaseUrlSet=${Boolean(process.env.DATABASE_URL?.trim())}`,
  );

  process.on("uncaughtException", (err) => {
    console.error("[ERROR] uncaughtException", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[ERROR] unhandledRejection", reason);
  });
}

export async function onRequestError(
  err: { digest?: string } & Error,
  request: {
    path: string;
    method: string;
    headers: { get(name: string): string | null };
  },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  console.error("[ERROR] Request error", {
    message: err.message,
    digest: err.digest,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
}
