import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";

export async function GET(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  return NextResponse.json({
    terminalId: terminal.id,
    terminalName: terminal.name,
    storeId: terminal.storeId,
    storeName: terminal.store.name,
    lastSyncAt: terminal.lastSyncAt?.toISOString() ?? null,
  });
}
