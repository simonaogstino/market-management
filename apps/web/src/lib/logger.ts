import "server-only";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "fs";
import { join } from "path";

export type LogLevel = "info" | "warn" | "error";

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB then rotate

function resolveLogDir() {
  if (process.env.LOG_DIR?.trim()) return process.env.LOG_DIR.trim();
  // Prefer repo root when running from apps/web workspace
  const cwd = process.cwd();
  if (cwd.replace(/\\/g, "/").endsWith("/apps/web")) {
    return join(cwd, "..", "..", "logs");
  }
  return join(cwd, "logs");
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function rotateIfNeeded(filePath: string) {
  try {
    if (!existsSync(filePath)) return;
    if (statSync(filePath).size < MAX_LOG_BYTES) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(filePath, `${filePath}.${stamp}`);
  } catch {
    // ignore rotation failures
  }
}

function formatLine(level: LogLevel, message: string, meta?: unknown) {
  const time = new Date().toISOString();
  let extra = "";
  if (meta !== undefined) {
    try {
      if (meta instanceof Error) {
        extra = ` ${JSON.stringify({
          name: meta.name,
          message: meta.message,
          stack: meta.stack,
        })}`;
      } else {
        extra = ` ${JSON.stringify(meta)}`;
      }
    } catch {
      extra = ` ${String(meta)}`;
    }
  }
  return `${time} [${level.toUpperCase()}] ${message}${extra}\n`;
}

function write(level: LogLevel, message: string, meta?: unknown) {
  const line = formatLine(level, message, meta);
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(line.trimEnd());

  try {
    const dir = resolveLogDir();
    ensureDir(dir);
    const appFile = join(dir, "app.log");
    rotateIfNeeded(appFile);
    appendFileSync(appFile, line, "utf8");

    if (level === "error") {
      const errFile = join(dir, "error.log");
      rotateIfNeeded(errFile);
      appendFileSync(errFile, line, "utf8");
    }
  } catch (err) {
    console.error("Failed to write log file:", err);
  }
}

export const logger = {
  info(message: string, meta?: unknown) {
    write("info", message, meta);
  },
  warn(message: string, meta?: unknown) {
    write("warn", message, meta);
  },
  error(message: string, meta?: unknown) {
    write("error", message, meta);
  },
  /** Absolute path to the logs directory (server only). */
  dir() {
    return resolveLogDir();
  },
};
