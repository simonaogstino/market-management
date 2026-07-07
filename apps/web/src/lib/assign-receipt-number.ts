import type { Prisma } from "@market/database";
import { formatReceiptNumber } from "./receipt-number";

type Tx = Prisma.TransactionClient;

export async function assignReceiptNumber(tx: Tx, storeId: string): Promise<string> {
  const store = await tx.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { receiptPrefix: true, receiptNextNumber: true },
  });

  const seq = store.receiptNextNumber;
  const receiptNumber = formatReceiptNumber(store.receiptPrefix, seq);

  await tx.store.update({
    where: { id: storeId },
    data: { receiptNextNumber: seq + 1 },
  });

  return receiptNumber;
}

export async function ensureSaleReceiptNumber(
  tx: Tx,
  storeId: string,
  saleId: string,
  existingReceiptNumber: string | null,
): Promise<string> {
  if (existingReceiptNumber) return existingReceiptNumber;

  const receiptNumber = await assignReceiptNumber(tx, storeId);
  await tx.sale.update({
    where: { id: saleId },
    data: { receiptNumber },
  });
  return receiptNumber;
}
