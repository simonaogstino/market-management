import { NextResponse } from "next/server";
import type { SyncPushRequest, SyncPushResponse } from "@market/shared";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { authenticateTerminal, processSalePush, unauthorized } from "@/lib/sync";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  try {
    const body = (await request.json()) as SyncPushRequest;
    const results = [];

    for (const sale of body.sales ?? []) {
      try {
        results.push(await processSalePush(terminal.id, terminal.storeId, sale));
      } catch (err) {
        logger.error("Sale push failed", {
          localId: sale.localId,
          terminalId: terminal.id,
          err,
        });
        results.push({
          localId: sale.localId,
          status: "conflict" as const,
          conflicts: [{ productId: "", message: "Server error while syncing sale." }],
        });
      }
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
  } catch (err) {
    logger.error("Sync push request failed", { terminalId: terminal.id, err });
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
