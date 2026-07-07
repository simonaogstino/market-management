import { NextResponse } from "next/server";
import type { SyncPushRequest, SyncPushResponse } from "@market/shared";
import { prisma } from "@/lib/db";
import { authenticateTerminal, processSalePush, unauthorized } from "@/lib/sync";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = (await request.json()) as SyncPushRequest;
  const results = [];

  for (const sale of body.sales ?? []) {
    results.push(await processSalePush(terminal.id, terminal.storeId, sale));
  }

  await prisma.terminal.update({
    where: { id: terminal.id },
    data: { lastSyncAt: new Date() },
  });

  const response: SyncPushResponse = {
    serverTime: new Date().toISOString(),
    results,
  };

  return NextResponse.json(response);
}
