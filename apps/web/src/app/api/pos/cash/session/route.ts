import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";
import { parseDollarsToCents } from "@/lib/cash";
import { computeExpectedCashCents } from "@/lib/cash-server";
import { requirePosStaffPermission } from "@/lib/pos-permissions";

export async function GET(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const cashSession = await prisma.cashSession.findFirst({
    where: { terminalId: terminal.id, status: "OPEN" },
    include: {
      movements: { orderBy: { createdAt: "desc" }, take: 20 },
      openedBy: { select: { name: true } },
    },
  });

  if (!cashSession) {
    return NextResponse.json({ session: null });
  }

  const summary = await computeExpectedCashCents({
    terminalId: terminal.id,
    openingCents: cashSession.openingCents,
    openedAt: cashSession.openedAt,
    sessionId: cashSession.id,
  });

  return NextResponse.json({
    session: {
      id: cashSession.id,
      openedAt: cashSession.openedAt.toISOString(),
      openingCents: cashSession.openingCents,
      openedByName: cashSession.openedBy?.name ?? null,
      note: cashSession.note,
      movements: cashSession.movements.map((m) => ({
        id: m.id,
        type: m.type,
        amountCents: m.amountCents,
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
      })),
      summary,
    },
  });
}

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = (await request.json()) as {
    action?: string;
    staffId?: string;
    openingAmount?: string | number;
    countedAmount?: string | number;
    note?: string;
  };

  const staffId = String(body.staffId ?? "").trim();
  if (!staffId) {
    return NextResponse.json({ error: "Staff is required." }, { status: 400 });
  }

  const perm = await requirePosStaffPermission(terminal.storeId, staffId, "pos:cash_session");
  if ("error" in perm) {
    return NextResponse.json({ error: perm.error }, { status: 403 });
  }

  if (body.action === "open") {
    const openingCents = parseDollarsToCents(String(body.openingAmount ?? "0"));
    if (openingCents === null || openingCents < 0) {
      return NextResponse.json({ error: "Invalid opening float." }, { status: 400 });
    }

    const existing = await prisma.cashSession.findFirst({
      where: { terminalId: terminal.id, status: "OPEN" },
    });
    if (existing) {
      return NextResponse.json({ error: "Cash drawer already open." }, { status: 409 });
    }

    const cashSession = await prisma.cashSession.create({
      data: {
        storeId: terminal.storeId,
        terminalId: terminal.id,
        openingCents,
        note: body.note?.trim() || null,
        openedById: staffId,
      },
    });

    return NextResponse.json({
      session: {
        id: cashSession.id,
        openedAt: cashSession.openedAt.toISOString(),
        openingCents: cashSession.openingCents,
      },
    });
  }

  if (body.action === "close") {
    const countedCents = parseDollarsToCents(String(body.countedAmount ?? ""));
    if (countedCents === null || countedCents < 0) {
      return NextResponse.json({ error: "Invalid counted cash." }, { status: 400 });
    }

    const cashSession = await prisma.cashSession.findFirst({
      where: { terminalId: terminal.id, status: "OPEN" },
    });
    if (!cashSession) {
      return NextResponse.json({ error: "No open cash session." }, { status: 404 });
    }

    const closedAt = new Date();
    const summary = await computeExpectedCashCents({
      terminalId: terminal.id,
      openingCents: cashSession.openingCents,
      openedAt: cashSession.openedAt,
      closedAt,
      sessionId: cashSession.id,
    });

    const closed = await prisma.cashSession.update({
      where: { id: cashSession.id },
      data: {
        status: "CLOSED",
        closedAt,
        expectedCents: summary.expectedCents,
        countedCents,
        varianceCents: countedCents - summary.expectedCents,
        closedById: staffId,
        note: body.note?.trim() || cashSession.note,
      },
    });

    return NextResponse.json({
      session: {
        id: closed.id,
        expectedCents: closed.expectedCents,
        countedCents: closed.countedCents,
        varianceCents: closed.varianceCents,
        summary,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
