import { createReadStream, existsSync } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { absoluteUploadPath } from "@/lib/receive-uploads";
import { authenticateTerminal, unauthorized } from "@/lib/sync";

export const runtime = "nodejs";

/** Download/view a receipt attached to a POS stock receive. */
export async function GET(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const movementId = new URL(request.url).searchParams.get("id")?.trim();
  if (!movementId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const movement = await prisma.stockMovement.findFirst({
    where: {
      id: movementId,
      storeId: terminal.storeId,
      type: "RECEIVE",
      attachmentPath: { not: null },
    },
  });

  if (!movement?.attachmentPath) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const filePath = absoluteUploadPath(movement.attachmentPath);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Attachment file missing on server." }, { status: 404 });
  }

  const info = await stat(filePath);
  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;
  const filename = movement.attachmentName || "receipt";

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": movement.attachmentMime || "application/octet-stream",
      "Content-Length": String(info.size),
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
