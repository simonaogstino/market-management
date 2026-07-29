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
