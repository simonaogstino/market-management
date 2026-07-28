/**
 * Keep this file free of Node built-ins (fs/path) and of `@/lib/logger`.
 * Next compiles instrumentation for Edge as well; importing fs there breaks the build.
 * File logging is used from API routes, auth, and sync (Node-only server code).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  console.info(
    `[INFO] App started nodeEnv=${process.env.NODE_ENV ?? "unknown"}`,
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
