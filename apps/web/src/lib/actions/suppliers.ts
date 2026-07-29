"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/admin-session";
import { applySupplierInvoiceDiscount, parseDollarsToCents } from "@/lib/suppliers";
import { payFromCashBox } from "@/lib/cash-server";
import { parseReturnLines, processSupplierReturn } from "@/lib/supplier-returns";

function supplierPaths(supplierId: string) {
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath("/admin/cash");
}

function parseDeliveryLines(formData: FormData) {
  const lines: Array<{ productId: string; quantity: number; unitCostCents: number }> = [];
  const count = parseInt(String(formData.get("lineCount") ?? "0"), 10);

  for (let i = 0; i < count; i++) {
    const productId = String(formData.get(`line_${i}_productId`) ?? "").trim();
    const quantity = parseInt(String(formData.get(`line_${i}_quantity`) ?? "0"), 10);
    const unitCostCents = parseDollarsToCents(String(formData.get(`line_${i}_unitCost`) ?? ""));

    if (!productId) continue;
    if (!quantity || quantity <= 0) continue;
    if (unitCostCents === null) continue;

    lines.push({ productId, quantity, unitCostCents });
  }

  return lines;
}

function parseDiscountPercent(formData: FormData) {
  const raw = parseInt(String(formData.get("discountPercent") ?? "0"), 10);
  if (Number.isNaN(raw) || raw < 0 || raw > 100) return null;
  return raw;
}

export async function createSupplier(formData: FormData) {
  const session = await requirePermission("suppliers:manage");
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const discountPercent = parseDiscountPercent(formData);

  if (!name) return { error: "Supplier name is required." };
  if (!contact) return { error: "Contact is required." };
  if (discountPercent === null) {
    return { error: "Invoice discount must be between 0 and 100." };
  }

  const supplier = await prisma.supplier.create({
    data: {
      name,
      contactPerson: contact,
      discountPercent,
      storeId: session.user.storeId,
    },
  });

  revalidatePath("/admin/suppliers");
  return { success: true, supplierId: supplier.id };
}

export async function updateSupplier(supplierId: string, formData: FormData) {
  const session = await requirePermission("suppliers:manage");
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  const discountPercent = parseDiscountPercent(formData);

  if (!name) return { error: "Supplier name is required." };
  if (!contact) return { error: "Contact is required." };
  if (discountPercent === null) {
    return { error: "Invoice discount must be between 0 and 100." };
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId: session.user.storeId },
  });
  if (!supplier) return { error: "Supplier not found." };

  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      name,
      contactPerson: contact,
      discountPercent,
      isActive,
    },
  });

  supplierPaths(supplierId);
  revalidatePath(`/admin/suppliers/${supplierId}/edit`);
  return { success: true };
}

export async function toggleSupplierActiveForm(formData: FormData) {
  const session = await requirePermission("suppliers:manage");
  const supplierId = String(formData.get("supplierId") ?? "");

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId: session.user.storeId },
  });
  if (!supplier) return;

  await prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: !supplier.isActive },
  });

  supplierPaths(supplierId);
}

export async function createSupplierDelivery(supplierId: string, formData: FormData) {
  const session = await requirePermission("suppliers:manage");
  const referenceNumber = String(formData.get("referenceNumber") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const deliveredAtRaw = String(formData.get("deliveredAt") ?? "");
  const paidAtDeliveryCents = parseDollarsToCents(String(formData.get("paidAtDelivery") ?? "0"));
  const updateStock = formData.get("updateStock") === "on";
  const lines = parseDeliveryLines(formData);

  if (paidAtDeliveryCents === null) {
    return { error: "Paid amount must be a valid number." };
  }
  if (lines.length === 0) {
    return { error: "Add at least one product line with quantity and cost." };
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId: session.user.storeId, isActive: true },
  });
  if (!supplier) return { error: "Supplier not found." };

  const deliveredAt = deliveredAtRaw ? new Date(deliveredAtRaw) : new Date();
  if (Number.isNaN(deliveredAt.getTime())) {
    return { error: "Delivery date is invalid." };
  }

  const listTotalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  const formDiscount = formData.get("discountPercent");
  const discountPercent =
    formDiscount != null && String(formDiscount).trim() !== ""
      ? parseInt(String(formDiscount), 10)
      : supplier.discountPercent;
  if (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: "Invoice discount must be between 0 and 100." };
  }
  const { discountCents, netCents: totalCostCents } = applySupplierInvoiceDiscount(
    listTotalCents,
    discountPercent,
  );

  if (paidAtDeliveryCents > totalCostCents) {
    return { error: "Paid amount cannot exceed net delivery total (after discount)." };
  }

  const cashTerminalId = String(formData.get("cashTerminalId") ?? "").trim();
  if (paidAtDeliveryCents > 0) {
    if (!cashTerminalId) {
      return { error: "Select which cash box to pay from when paying on delivery." };
    }
  }

  for (const line of lines) {
    const product = await prisma.product.findFirst({
      where: { id: line.productId, storeId: session.user.storeId },
    });
    if (!product) return { error: "One or more products were not found." };
  }

  if (paidAtDeliveryCents > 0 && cashTerminalId) {
    const cashResult = await payFromCashBox({
      storeId: session.user.storeId,
      terminalId: cashTerminalId,
      amountCents: paidAtDeliveryCents,
      reason: `Supplier delivery payment${referenceNumber ? ` ${referenceNumber}` : ""} — ${supplier.name}`,
      recordedById: session.user.id,
    });
    if ("error" in cashResult) return { error: cashResult.error };
  }

  await prisma.$transaction(async (tx) => {
    const delivery = await tx.supplierDelivery.create({
      data: {
        supplierId,
        storeId: session.user.storeId,
        referenceNumber,
        deliveredAt,
        note,
        listTotalCents,
        discountPercent,
        discountCents,
        totalCostCents,
        paidAtDeliveryCents,
        updateStock,
        recordedById: session.user.id,
        lines: {
          create: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCostCents: line.unitCostCents,
            lineCostCents: line.quantity * line.unitCostCents,
          })),
        },
      },
    });

    if (updateStock) {
      for (const line of lines) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: product.stockQty + line.quantity, version: { increment: 1 } },
        });
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            storeId: session.user.storeId,
            type: "RECEIVE",
            quantity: line.quantity,
            note: referenceNumber
              ? `Supplier delivery ${referenceNumber}`
              : `Supplier delivery to ${supplier.name}`,
            userId: session.user.id,
            supplierDeliveryId: delivery.id,
          },
        });
      }
    }
  });

  supplierPaths(supplierId);
  revalidatePath("/admin/stock");
  revalidatePath("/admin/products");
  return { success: true };
}

export async function createSupplierPayment(supplierId: string, formData: FormData) {
  const session = await requirePermission("suppliers:manage");
  const type = String(formData.get("type") ?? "PAYMENT") as "PAYMENT" | "CREDIT";
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const paidAtRaw = String(formData.get("paidAt") ?? "");
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const payFromCash = formData.get("payFromCash") === "on";
  const cashTerminalId = String(formData.get("cashTerminalId") ?? "").trim();

  if (!["PAYMENT", "CREDIT"].includes(type)) {
    return { error: "Invalid payment type." };
  }
  if (amountCents === null || amountCents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId: session.user.storeId, isActive: true },
  });
  if (!supplier) return { error: "Supplier not found." };

  const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    return { error: "Payment date is invalid." };
  }

  if (type === "PAYMENT" && payFromCash) {
    if (!cashTerminalId) {
      return { error: "Select which cash box to pay from." };
    }
    const cashResult = await payFromCashBox({
      storeId: session.user.storeId,
      terminalId: cashTerminalId,
      amountCents,
      reason: `Supplier payment — ${supplier.name}${reference ? ` (${reference})` : ""}`,
      recordedById: session.user.id,
    });
    if ("error" in cashResult) return { error: cashResult.error };
  }

  await prisma.supplierPayment.create({
    data: {
      supplierId,
      storeId: session.user.storeId,
      type,
      amountCents,
      paidAt,
      reference,
      note:
        type === "PAYMENT" && payFromCash
          ? [note, "Paid from cash box"].filter(Boolean).join(" · ")
          : note,
      recordedById: session.user.id,
    },
  });

  supplierPaths(supplierId);
  return { success: true };
}

export async function createSupplierReturn(supplierId: string, formData: FormData) {
  const session = await requirePermission("suppliers:manage");
  const referenceNumber = String(formData.get("referenceNumber") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const returnedAtRaw = String(formData.get("returnedAt") ?? "");
  const lines = parseReturnLines(formData);

  const returnedAt = returnedAtRaw ? new Date(returnedAtRaw) : new Date();
  if (Number.isNaN(returnedAt.getTime())) {
    return { error: "Return date is invalid." };
  }

  const result = await processSupplierReturn({
    storeId: session.user.storeId,
    supplierId,
    lines,
    referenceNumber,
    note,
    returnedAt,
    recordedById: session.user.id,
  });

  if ("error" in result) return { error: result.error };

  supplierPaths(supplierId);
  revalidatePath("/admin/stock");
  revalidatePath("/admin/products");
  return { success: true };
}
