import { NextResponse } from "next/server";
import { DB_ENSURE_VERSION, ensureDatabase } from "@/ensure-database";
import { authenticateTerminal, unauthorized } from "@/lib/sync";

export const runtime = "nodejs";

export async function GET(request: Request) {
  console.info(`[INFO] GET /api/terminals/me deploy=${DB_ENSURE_VERSION}`);
  try {
    await ensureDatabase();
  } catch (err) {
    console.error("[ERROR] ensureDatabase failed in /api/terminals/me", err);
    return NextResponse.json(
      {
        error: "Database not initialized",
        detail: err instanceof Error ? err.message : String(err),
        deploy: DB_ENSURE_VERSION,
      },
      { status: 503 },
    );
  }

  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  return NextResponse.json({
    terminalId: terminal.id,
    terminalName: terminal.name,
    storeId: terminal.storeId,
    storeName: terminal.store.name,
    lastSyncAt: terminal.lastSyncAt?.toISOString() ?? null,
    deploy: DB_ENSURE_VERSION,
  });
}
