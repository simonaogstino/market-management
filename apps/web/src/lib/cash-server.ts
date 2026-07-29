import { prisma } from "@/lib/db";

/** Expected cash in drawer for a session window. */
export async function computeExpectedCashCents(input: {
  terminalId: string;
  openingCents: number;
  openedAt: Date;
  closedAt?: Date | null;
  sessionId: string;
}) {
  const end = input.closedAt ?? new Date();

  const [sales, movements] = await Promise.all([
    prisma.sale.findMany({
      where: {
        terminalId: input.terminalId,
        status: { not: "VOIDED" },
        paymentMethod: "CASH",
        kind: { in: ["SALE", "RETURN"] },
        soldAt: { gte: input.openedAt, lte: end },
      },
      select: { kind: true, totalCents: true },
    }),
    prisma.cashMovement.findMany({
      where: { sessionId: input.sessionId },
      select: { type: true, amountCents: true },
    }),
  ]);

  let cashSalesCents = 0;
  let cashReturnsCents = 0;
  for (const sale of sales) {
    if (sale.kind === "RETURN") cashReturnsCents += sale.totalCents;
    else cashSalesCents += sale.totalCents;
  }

  let payInCents = 0;
  let payOutCents = 0;
  for (const m of movements) {
    if (m.type === "PAY_IN") payInCents += m.amountCents;
    else payOutCents += m.amountCents;
  }

  const expectedCents =
    input.openingCents + cashSalesCents - cashReturnsCents + payInCents - payOutCents;

  return {
    openingCents: input.openingCents,
    cashSalesCents,
    cashReturnsCents,
    payInCents,
    payOutCents,
    expectedCents,
  };
}

export type TerminalCashBox = {
  terminalId: string;
  terminalName: string;
  sessionId: string | null;
  status: "OPEN" | "CLOSED" | "NONE";
  cashInBoxCents: number;
  paidOutCents: number;
  cashSalesCents: number;
  cashReturnsCents: number;
  payInCents: number;
  openingCents: number;
};

/** Live cash box status for every active terminal in a store. */
export async function getStoreCashBoxes(storeId: string): Promise<{
  boxes: TerminalCashBox[];
  totalCashCents: number;
  totalPaidOutCents: number;
}> {
  const terminals = await prisma.terminal.findMany({
    where: { storeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const boxes: TerminalCashBox[] = [];

  for (const terminal of terminals) {
    const openSession = await prisma.cashSession.findFirst({
      where: { terminalId: terminal.id, status: "OPEN" },
    });

    if (!openSession) {
      boxes.push({
        terminalId: terminal.id,
        terminalName: terminal.name,
        sessionId: null,
        status: "NONE",
        cashInBoxCents: 0,
        paidOutCents: 0,
        cashSalesCents: 0,
        cashReturnsCents: 0,
        payInCents: 0,
        openingCents: 0,
      });
      continue;
    }

    const summary = await computeExpectedCashCents({
      terminalId: terminal.id,
      openingCents: openSession.openingCents,
      openedAt: openSession.openedAt,
      sessionId: openSession.id,
    });

    boxes.push({
      terminalId: terminal.id,
      terminalName: terminal.name,
      sessionId: openSession.id,
      status: "OPEN",
      cashInBoxCents: summary.expectedCents,
      paidOutCents: summary.payOutCents,
      cashSalesCents: summary.cashSalesCents,
      cashReturnsCents: summary.cashReturnsCents,
      payInCents: summary.payInCents,
      openingCents: summary.openingCents,
    });
  }

  return {
    boxes,
    totalCashCents: boxes.reduce((sum, b) => sum + b.cashInBoxCents, 0),
    totalPaidOutCents: boxes.reduce((sum, b) => sum + b.paidOutCents, 0),
  };
}

/** Deduct cash from an open terminal drawer (pay out). */
export async function payFromCashBox(input: {
  storeId: string;
  terminalId: string;
  amountCents: number;
  reason: string;
  recordedById: string;
}) {
  if (input.amountCents <= 0) {
    return { error: "Cash payment amount must be greater than zero." as const };
  }

  const openSession = await prisma.cashSession.findFirst({
    where: {
      storeId: input.storeId,
      terminalId: input.terminalId,
      status: "OPEN",
    },
  });
  if (!openSession) {
    return {
      error: "That terminal has no open cash drawer. Open the drawer first." as const,
    };
  }

  const summary = await computeExpectedCashCents({
    terminalId: input.terminalId,
    openingCents: openSession.openingCents,
    openedAt: openSession.openedAt,
    sessionId: openSession.id,
  });

  if (input.amountCents > summary.expectedCents) {
    const available = (summary.expectedCents / 100).toLocaleString("en-IQ");
    const need = (input.amountCents / 100).toLocaleString("en-IQ");
    return {
      error: `Not enough cash in that drawer (available د.ع ${available}, need د.ع ${need}).` as const,
    };
  }

  const movement = await prisma.cashMovement.create({
    data: {
      sessionId: openSession.id,
      type: "PAY_OUT",
      amountCents: input.amountCents,
      reason: input.reason,
      recordedById: input.recordedById,
    },
  });

  return { success: true as const, movementId: movement.id, sessionId: openSession.id };
}

export async function listOpenCashTerminals(storeId: string) {
  const sessions = await prisma.cashSession.findMany({
    where: { storeId, status: "OPEN" },
    include: { terminal: { select: { id: true, name: true } } },
    orderBy: { terminal: { name: "asc" } },
  });

  const result: Array<{ id: string; name: string; cashInBoxCents: number; sessionId: string }> =
    [];

  for (const s of sessions) {
    const summary = await computeExpectedCashCents({
      terminalId: s.terminalId,
      openingCents: s.openingCents,
      openedAt: s.openedAt,
      sessionId: s.id,
    });
    result.push({
      id: s.terminal.id,
      name: s.terminal.name,
      cashInBoxCents: summary.expectedCents,
      sessionId: s.id,
    });
  }

  return result;
}
