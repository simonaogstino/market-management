import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { findMonorepoRootFromCwd } from "@market/database";

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export function uploadsRoot() {
  return join(findMonorepoRootFromCwd(), "uploads");
}

export function receiveReceiptsDir(storeId: string) {
  return join(uploadsRoot(), "receive-receipts", storeId);
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "receipt";
}

export async function saveReceiveReceiptFile(input: {
  storeId: string;
  movementId: string;
  file: File;
}): Promise<
  | { ok: true; path: string; name: string; mime: string }
  | { ok: false; error: string }
> {
  const mime = (input.file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      error: "Receipt must be a photo (JPG/PNG/WebP) or PDF.",
    };
  }
  if (input.file.size <= 0 || input.file.size > MAX_RECEIPT_BYTES) {
    return { ok: false, error: "Receipt file must be under 8 MB." };
  }

  const dir = receiveReceiptsDir(input.storeId);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const original = safeFileName(input.file.name || "receipt");
  const ext =
    original.includes(".")
      ? original.slice(original.lastIndexOf("."))
      : mime === "application/pdf"
        ? ".pdf"
        : mime.includes("png")
          ? ".png"
          : mime.includes("webp")
            ? ".webp"
            : ".jpg";
  const storedName = `${input.movementId}${ext.startsWith(".") ? ext : `.${ext}`}`;
  const absolute = join(dir, storedName);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  await writeFile(absolute, buffer);

  // Store path relative to uploads root for portability.
  const relative = join("receive-receipts", input.storeId, storedName).replace(/\\/g, "/");
  return {
    ok: true,
    path: relative,
    name: input.file.name || storedName,
    mime,
  };
}

export function absoluteUploadPath(relativePath: string) {
  const cleaned = relativePath.replace(/^[/\\]+/, "").replace(/\.\./g, "");
  return join(uploadsRoot(), cleaned);
}
