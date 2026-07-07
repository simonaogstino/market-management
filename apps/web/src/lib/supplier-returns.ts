import { prisma } from "@/lib/db";

export type SupplierReturnLineInput = {
  productId: string;
  quantity: number;
  unitCostCents: number;
};

export async function processSupplierReturn(input: {
  storeId: string;
  supplierId: string;
  lines: SupplierReturnLineInput[];
  referenceNumber?: string | null;
  note?: string | null;
  returnedAt?: Date;
  recordedById?: string | null;
}) {
  if (input.lines.length === 0) {
    return { error: "Add at least one product line." as const };
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, storeId: input.storeId, isActive: true },
  });
  if (!supplier) return { error: "Supplier not found." as const };

  const returnedAt = input.returnedAt ?? new Date();
  const totalCostCents = input.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitCostCents,
    0,
  );

  for (const line of input.lines) {
    const product = await prisma.product.findFirst({
      where: { id: line.productId, storeId: input.storeId },
    });
    if (!product) return { error: "One or more products were not found." as const };
    if (product.stockQty < line.quantity) {
      return {
        error: `Insufficient stock for ${product.name}: have ${product.stockQty}, need ${line.quantity}.`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    const supplierReturn = await tx.supplierReturn.create({
      data: {
        supplierId: input.supplierId,
        storeId: input.storeId,
        referenceNumber: input.referenceNumber ?? null,
        returnedAt,
        note: input.note ?? null,
        totalCostCents,
        recordedById: input.recordedById ?? null,
        lines: {
          create: input.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCostCents: line.unitCostCents,
            lineCostCents: line.quantity * line.unitCostCents,
          })),
        },
      },
    });

    for (const line of input.lines) {
      await tx.product.update({
        where: { id: line.productId },
        data: {
          stockQty: { decrement: line.quantity },
          version: { increment: 1 },
        },
      });
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          storeId: input.storeId,
          type: "RETURN_TO_SUPPLIER",
          quantity: -line.quantity,
          note: input.referenceNumber
            ? `Return to ${supplier.name} (${input.referenceNumber})`
            : `Return to ${supplier.name}`,
          userId: input.recordedById ?? null,
          supplierReturnId: supplierReturn.id,
        },
      });
    }
  });

  return { success: true as const, totalCostCents };
}

function parseReturnLines(formData: FormData) {
  const lines: SupplierReturnLineInput[] = [];
  const count = parseInt(String(formData.get("lineCount") ?? "0"), 10);

  for (let i = 0; i < count; i++) {
    const productId = String(formData.get(`line_${i}_productId`) ?? "").trim();
    const quantity = parseInt(String(formData.get(`line_${i}_quantity`) ?? "0"), 10);
    const unitCostRaw = String(formData.get(`line_${i}_unitCost`) ?? "");
    const unitCostCents = Math.round(parseFloat(unitCostRaw) * 100);

    if (!productId) continue;
    if (!quantity || quantity <= 0) continue;
    if (Number.isNaN(unitCostCents) || unitCostCents < 0) continue;

    lines.push({ productId, quantity, unitCostCents });
  }

  return lines;
}

export { parseReturnLines };
