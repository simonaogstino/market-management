import { logger } from "@/lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    logger.info("App started", {
      nodeEnv: process.env.NODE_ENV,
      logDir: logger.dir(),
    });

    process.on("uncaughtException", (err) => {
      logger.error("uncaughtException", err);
    });
    process.on("unhandledRejection", (reason) => {
      logger.error(
        "unhandledRejection",
        reason instanceof Error ? reason : { reason: String(reason) },
      );
    });
  }
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
  logger.error("Request error", {
    message: err.message,
    digest: err.digest,
    stack: err.stack,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
}
