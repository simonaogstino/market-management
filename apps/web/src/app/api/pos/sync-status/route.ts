import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";
import type { PosSyncStatusResponse } from "@market/shared";

export async function GET(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const conflicts = await prisma.sale.findMany({
    where: { terminalId: terminal.id, status: "CONFLICT" },
    orderBy: { soldAt: "desc" },
    take: 20,
    include: { conflicts: true },
  });

  const pendingCount = await prisma.sale.count({
    where: { terminalId: terminal.id, status: "PENDING_SYNC" },
  });

  const response: PosSyncStatusResponse = {
    serverTime: new Date().toISOString(),
    lastSyncAt: terminal.lastSyncAt?.toISOString() ?? null,
    pendingCount,
    conflictCount: conflicts.length,
    conflicts: conflicts.map((sale) => ({
      localId: sale.localId,
      soldAt: sale.soldAt.toISOString(),
      totalCents: sale.totalCents,
      messages: sale.conflicts.map((c) => c.message),
    })),
  };

  return NextResponse.json(response);
}
