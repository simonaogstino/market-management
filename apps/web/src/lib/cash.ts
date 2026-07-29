import { formatMoney, parseDollarsToCents } from "@/lib/suppliers";

export { formatMoney, parseDollarsToCents };

export type PaymentMethodCode = "CASH" | "CARD" | "TRANSFER";

export const PAYMENT_METHODS: Array<{ value: PaymentMethodCode; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "TRANSFER", label: "Transfer" },
];

export function paymentMethodLabel(method: string) {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export function isPaymentMethod(value: string): value is PaymentMethodCode {
  return PAYMENT_METHODS.some((m) => m.value === value);
}
