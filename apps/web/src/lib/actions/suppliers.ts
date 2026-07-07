"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/admin-session";
import { parseDollarsToCents } from "@/lib/suppliers";
import { parseReturnLines, processSupplierReturn } from "@/lib/supplier-returns";

function supplierPaths(supplierId: string) {
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${supplierId}`);
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

export async function createSupplier(formData: FormData) {
  const session = await requirePermission("suppliers:manage");
  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();

  if (!name) return { error: "Supplier name is required." };
  if (!contact) return { error: "Contact is required." };

  const supplier = await prisma.supplier.create({
    data: {
      name,
      contactPerson: contact,
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

  if (!name) return { error: "Supplier name is required." };
  if (!contact) return { error: "Contact is required." };

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId: session.user.storeId },
  });
  if (!supplier) return { error: "Supplier not found." };

  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      name,
      contactPerson: contact,
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

  const totalCostCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  if (paidAtDeliveryCents > totalCostCents) {
    return { error: "Paid amount cannot exceed delivery total." };
  }

  for (const line of lines) {
    const product = await prisma.product.findFirst({
      where: { id: line.productId, storeId: session.user.storeId },
    });
    if (!product) return { error: "One or more products were not found." };
  }

  await prisma.$transaction(async (tx) => {
    const delivery = await tx.supplierDelivery.create({
      data: {
        supplierId,
        storeId: session.user.storeId,
        referenceNumber,
        deliveredAt,
        note,
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

  await prisma.supplierPayment.create({
    data: {
      supplierId,
      storeId: session.user.storeId,
      type,
      amountCents,
      paidAt,
      reference,
      note,
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
