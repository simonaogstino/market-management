export { formatMoney } from "@market/shared";

export function parseDollarsToCents(value: string) {
  const dollars = parseFloat(value);
  if (Number.isNaN(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

type DeliveryTotals = { totalCostCents: number; paidAtDeliveryCents: number };
type ReturnTotals = { totalCostCents: number };
type PaymentTotals = { type: string; amountCents: number };

export function computeSupplierBalance(input: {
  openingBalanceCents: number;
  deliveries: DeliveryTotals[];
  returns: ReturnTotals[];
  payments: PaymentTotals[];
}) {
  const totalDelivered = input.deliveries.reduce((sum, d) => sum + d.totalCostCents, 0);
  const totalReturned = input.returns.reduce((sum, r) => sum + r.totalCostCents, 0);
  const paidOnDelivery = input.deliveries.reduce((sum, d) => sum + d.paidAtDeliveryCents, 0);
  const paymentsMade = input.payments
    .filter((p) => p.type === "PAYMENT")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const creditsReceived = input.payments
    .filter((p) => p.type === "CREDIT")
    .reduce((sum, p) => sum + p.amountCents, 0);

  const totalPaid = paidOnDelivery + paymentsMade;
  const netPurchases = totalDelivered - totalReturned;
  const balanceOwedCents =
    input.openingBalanceCents + netPurchases - totalPaid - creditsReceived;

  return {
    totalDelivered,
    totalReturned,
    netPurchases,
    totalPaid,
    creditsReceived,
    balanceOwedCents,
    prepaidCreditCents: balanceOwedCents < 0 ? Math.abs(balanceOwedCents) : 0,
    remainingToPayCents: balanceOwedCents > 0 ? balanceOwedCents : 0,
  };
}
