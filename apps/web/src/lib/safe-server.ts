import { prisma } from "@/lib/db";
import { computeExpectedCashCents } from "@/lib/cash-server";

export type SafeMovementTypeCode =
  | "FROM_TERMINAL"
  | "BANK_DEPOSIT"
  | "ADJUST_IN"
  | "ADJUST_OUT";

export function safeMovementSignedCents(type: SafeMovementTypeCode, amountCents: number) {
  if (type === "FROM_TERMINAL" || type === "ADJUST_IN") return amountCents;
  return -amountCents;
}

export function safeMovementLabel(type: SafeMovementTypeCode) {
  switch (type) {
    case "FROM_TERMINAL":
      return "From terminal";
    case "BANK_DEPOSIT":
      return "Bank deposit";
    case "ADJUST_IN":
      return "Adjustment (+)";
    case "ADJUST_OUT":
      return "Adjustment (−)";
    default:
      return type;
  }
}

export async function getSafeBalanceCents(storeId: string) {
  const rows = await prisma.safeMovement.findMany({
    where: { storeId },
    select: { type: true, amountCents: true },
  });
  return rows.reduce((sum, row) => sum + safeMovementSignedCents(row.type, row.amountCents), 0);
}

export async function getSafeSummary(storeId: string) {
  const rows = await prisma.safeMovement.findMany({
    where: { storeId },
    select: { type: true, amountCents: true },
  });

  let fromTerminalCents = 0;
  let bankDepositCents = 0;
  let adjustInCents = 0;
  let adjustOutCents = 0;

  for (const row of rows) {
    if (row.type === "FROM_TERMINAL") fromTerminalCents += row.amountCents;
    else if (row.type === "BANK_DEPOSIT") bankDepositCents += row.amountCents;
    else if (row.type === "ADJUST_IN") adjustInCents += row.amountCents;
    else if (row.type === "ADJUST_OUT") adjustOutCents += row.amountCents;
  }

  const balanceCents =
    fromTerminalCents + adjustInCents - bankDepositCents - adjustOutCents;

  return {
    balanceCents,
    fromTerminalCents,
    bankDepositCents,
    adjustInCents,
    adjustOutCents,
  };
}

/** Move cash from an open POS drawer into the store safe. */
export async function transferTerminalCashToSafe(input: {
  storeId: string;
  cashSessionId: string;
  amountCents: number;
  note?: string | null;
  recordedById: string;
}) {
  if (input.amountCents <= 0) {
    return { error: "Amount must be greater than zero." as const };
  }

  const cashSession = await prisma.cashSession.findFirst({
    where: {
      id: input.cashSessionId,
      storeId: input.storeId,
      status: "OPEN",
    },
    include: { terminal: { select: { id: true, name: true } } },
  });
  if (!cashSession) {
    return { error: "Open cash session not found." as const };
  }

  const summary = await computeExpectedCashCents({
    terminalId: cashSession.terminalId,
    openingCents: cashSession.openingCents,
    openedAt: cashSession.openedAt,
    sessionId: cashSession.id,
  });

  if (input.amountCents > summary.expectedCents) {
    const available = (summary.expectedCents / 100).toLocaleString("en-IQ");
    const need = (input.amountCents / 100).toLocaleString("en-IQ");
    return {
      error: `Not enough cash in that drawer (available د.ع ${available}, need د.ع ${need}).` as const,
    };
  }

  const reason =
    input.note?.trim() ||
    `Transfer to safe from ${cashSession.terminal.name}`;

  const result = await prisma.$transaction(async (tx) => {
    const movement = await tx.cashMovement.create({
      data: {
        sessionId: cashSession.id,
        type: "PAY_OUT",
        amountCents: input.amountCents,
        reason,
        recordedById: input.recordedById,
      },
    });

    const safe = await tx.safeMovement.create({
      data: {
        storeId: input.storeId,
        type: "FROM_TERMINAL",
        amountCents: input.amountCents,
        note: reason,
        terminalId: cashSession.terminalId,
        cashSessionId: cashSession.id,
        cashMovementId: movement.id,
        recordedById: input.recordedById,
      },
    });

    return { movementId: movement.id, safeMovementId: safe.id };
  });

  return {
    success: true as const,
    ...result,
    terminalName: cashSession.terminal.name,
    sessionId: cashSession.id,
  };
}

export async function recordSafeBankDeposit(input: {
  storeId: string;
  amountCents: number;
  reference?: string | null;
  note?: string | null;
  recordedById: string;
}) {
  if (input.amountCents <= 0) {
    return { error: "Amount must be greater than zero." as const };
  }

  const balance = await getSafeBalanceCents(input.storeId);
  if (input.amountCents > balance) {
    const available = (balance / 100).toLocaleString("en-IQ");
    const need = (input.amountCents / 100).toLocaleString("en-IQ");
    return {
      error: `Not enough cash in the safe (available د.ع ${available}, need د.ع ${need}).` as const,
    };
  }

  const row = await prisma.safeMovement.create({
    data: {
      storeId: input.storeId,
      type: "BANK_DEPOSIT",
      amountCents: input.amountCents,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      recordedById: input.recordedById,
    },
  });

  return { success: true as const, id: row.id };
}

export async function recordSafeAdjustment(input: {
  storeId: string;
  direction: "in" | "out";
  amountCents: number;
  note?: string | null;
  recordedById: string;
}) {
  if (input.amountCents <= 0) {
    return { error: "Amount must be greater than zero." as const };
  }

  if (input.direction === "out") {
    const balance = await getSafeBalanceCents(input.storeId);
    if (input.amountCents > balance) {
      return { error: "Adjustment would make the safe balance negative." as const };
    }
  }

  const row = await prisma.safeMovement.create({
    data: {
      storeId: input.storeId,
      type: input.direction === "in" ? "ADJUST_IN" : "ADJUST_OUT",
      amountCents: input.amountCents,
      note: input.note?.trim() || null,
      recordedById: input.recordedById,
    },
  });

  return { success: true as const, id: row.id };
}
