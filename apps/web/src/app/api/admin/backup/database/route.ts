import { createReadStream, existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { normalizeSqliteDatabaseUrl } from "@market/database";
import { prisma } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sqlitePathFromEnv(): string | null {
  const url = normalizeSqliteDatabaseUrl() ?? process.env.DATABASE_URL?.trim();
  if (!url?.startsWith("file:")) return null;

  let filePath = url.slice("file:".length);
  if (
    (filePath.startsWith('"') && filePath.endsWith('"')) ||
    (filePath.startsWith("'") && filePath.endsWith("'"))
  ) {
    filePath = filePath.slice(1, -1);
  }
  if (filePath.startsWith("///")) {
    filePath = filePath.slice(2);
  }
  return filePath;
}

function stampFilename() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `market-backup-${y}${m}${day}-${h}${min}.db`;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "OFFICE")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, session.user.permissions, "settings:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const livePath = sqlitePathFromEnv();
  if (!livePath) {
    return NextResponse.json(
      {
        error:
          "Database file download is only available when using SQLite. For PostgreSQL/MySQL use your host’s backup tools (e.g. pg_dump).",
      },
      { status: 400 },
    );
  }

  if (!existsSync(livePath)) {
    return NextResponse.json({ error: "Database file was not found on the server." }, { status: 404 });
  }

  const outPath = join(tmpdir(), `market-backup-${Date.now()}-${process.pid}.db`);
  const sqlPath = outPath.replace(/\\/g, "/").replace(/'/g, "''");

  try {
    // Consistent snapshot even if WAL is in use.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);
  } catch (err) {
    console.error("[ERROR] backup VACUUM INTO failed", err);
    return NextResponse.json(
      { error: "Could not create a consistent database backup. Try again in a quiet moment." },
      { status: 500 },
    );
  }

  if (!existsSync(outPath)) {
    return NextResponse.json({ error: "Backup file was not created." }, { status: 500 });
  }

  const filename = stampFilename();
  const nodeStream = createReadStream(outPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  const cleanup = () => {
    try {
      unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  };
  nodeStream.on("close", cleanup);
  nodeStream.on("error", cleanup);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
