import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { SalePushDto, SyncPushResult } from "@market/shared";
import { prisma, SaleStatus } from "@market/database";
import { authOptions } from "./auth";
import { ensureSaleReceiptNumber } from "./assign-receipt-number";
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }
  return session;
}

export async function authenticateTerminal(request: Request) {
  const apiKey = request.headers.get("x-terminal-key");
  if (!apiKey) return null;

  return prisma.terminal.findFirst({
    where: { apiKey, isActive: true },
    include: { store: true },
  });
}

export async function processSalePush(
  terminalId: string,
  storeId: string,
  sale: SalePushDto,
): Promise<SyncPushResult> {
  const kind = sale.kind ?? "SALE";
  const isReturn = kind === "RETURN";

  const existing = await prisma.sale.findUnique({
    where: { terminalId_localId: { terminalId, localId: sale.localId } },
  });

  if (existing?.status === "SYNCED") {
    return {
      localId: sale.localId,
      status: "synced",
      serverSaleId: existing.id,
      receiptNumber: existing.receiptNumber ?? undefined,
    };
  }
  if (existing?.status === "VOIDED") {
    return {
      localId: sale.localId,
      status: "synced",
      serverSaleId: existing.id,
      receiptNumber: existing.receiptNumber ?? undefined,
    };
  }
  const conflicts: Array<{ productId: string; message: string }> = [];

  if (!isReturn) {
    for (const line of sale.lines) {
      const product = await prisma.product.findFirst({
        where: { id: line.productId, storeId },
      });
      if (!product) {
        conflicts.push({
          productId: line.productId,
          message: "Product not found on server",
        });
        continue;
      }
      if (product.stockQty < line.quantity) {
        conflicts.push({
          productId: line.productId,
          message: `Insufficient stock: need ${line.quantity}, have ${product.stockQty}`,
        });
      }
    }
  } else {
    for (const line of sale.lines) {
      const product = await prisma.product.findFirst({
        where: { id: line.productId, storeId },
      });
      if (!product) {
        conflicts.push({
          productId: line.productId,
          message: "Product not found on server",
        });
      }
    }
  }

  if (conflicts.length > 0) {
    const conflictSale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.upsert({
        where: { terminalId_localId: { terminalId, localId: sale.localId } },
        update: {
          status: SaleStatus.CONFLICT,
          kind: isReturn ? "RETURN" : "SALE",
          totalCents: sale.totalCents,
          soldAt: new Date(sale.soldAt),
          staffId: sale.staffId ?? undefined,
        },
        create: {
          localId: sale.localId,
          terminalId,
          kind: isReturn ? "RETURN" : "SALE",
          status: SaleStatus.CONFLICT,
          totalCents: sale.totalCents,
          soldAt: new Date(sale.soldAt),
          staffId: sale.staffId ?? undefined,
          lines: {
            create: sale.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitCents: line.unitCents,
              lineCents: line.lineCents,
            })),
          },
        },
      });

      await ensureSaleReceiptNumber(tx, storeId, created.id, created.receiptNumber);

      await tx.syncConflict.deleteMany({ where: { saleId: created.id } });
      await tx.syncConflict.createMany({
        data: conflicts.map((c) => ({
          saleId: created.id,
          productId: c.productId,
          message: c.message,
        })),
      });

      return tx.sale.findUniqueOrThrow({ where: { id: created.id } });
    });

    return {
      localId: sale.localId,
      status: "conflict",
      conflicts,
      receiptNumber: conflictSale.receiptNumber ?? undefined,
    };
  }
  const syncedSale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.upsert({
      where: { terminalId_localId: { terminalId, localId: sale.localId } },
      update: {
        status: SaleStatus.SYNCED,
        kind: isReturn ? "RETURN" : "SALE",
        syncedAt: new Date(),
        totalCents: sale.totalCents,
        soldAt: new Date(sale.soldAt),
        staffId: sale.staffId ?? undefined,
      },
      create: {
        localId: sale.localId,
        terminalId,
        kind: isReturn ? "RETURN" : "SALE",
        status: SaleStatus.SYNCED,
        syncedAt: new Date(),
        totalCents: sale.totalCents,
        soldAt: new Date(sale.soldAt),
        staffId: sale.staffId ?? undefined,
        lines: {
          create: sale.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCents: line.unitCents,
            lineCents: line.lineCents,
          })),
        },
      },
    });

    for (const line of sale.lines) {
      await tx.product.update({
        where: { id: line.productId },
        data: {
          stockQty: isReturn ? { increment: line.quantity } : { decrement: line.quantity },
          version: { increment: 1 },
        },
      });
    }

    await ensureSaleReceiptNumber(tx, storeId, created.id, created.receiptNumber);

    return tx.sale.findUniqueOrThrow({ where: { id: created.id } });
  });

  return {
    localId: sale.localId,
    status: "synced",
    serverSaleId: syncedSale.id,
    receiptNumber: syncedSale.receiptNumber ?? undefined,
  };
}
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function voidTerminalSale(terminalId: string, storeId: string, localId: string) {
  const sale = await prisma.sale.findUnique({
    where: { terminalId_localId: { terminalId, localId } },
    include: { lines: true },
  });

  if (!sale) {
    return { error: "Sale not found." };
  }
  if (sale.status === "VOIDED") {
    return { success: true };
  }

  const latest = await prisma.sale.findFirst({
    where: { terminalId, status: { not: "VOIDED" } },
    orderBy: { soldAt: "desc" },
  });

  if (!latest || latest.localId !== localId) {
    return { error: "Only the most recent sale on this terminal can be voided." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: sale.id },
      data: { status: SaleStatus.VOIDED, voidedAt: new Date() },
    });

    if (sale.status === "SYNCED" || sale.status === "CONFLICT") {
      const isReturn = sale.kind === "RETURN";
      for (const line of sale.lines) {
        await tx.product.update({
          where: { id: line.productId },
          data: {
            stockQty: isReturn
              ? { decrement: line.quantity }
              : { increment: line.quantity },
            version: { increment: 1 },
          },
        });
      }
    }
  });

  return { success: true };
}

export async function receiveStockForTerminal(
  terminalStoreId: string,
  staffId: string,
  productId: string,
  quantity: number,
  note: string | null,
) {
  const staff = await prisma.user.findFirst({
    where: {
      id: staffId,
      storeId: terminalStoreId,
      role: { in: ["STAFF", "ADMIN"] },
      isActive: true,
    },
  });
  if (!staff) return { error: "Invalid staff." };

  if (!quantity || quantity <= 0) {
    return { error: "Quantity must be positive." };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: terminalStoreId, isActive: true },
  });
  if (!product) return { error: "Product not found." };

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        stockQty: { increment: quantity },
        version: { increment: 1 },
      },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        storeId: terminalStoreId,
        type: "RECEIVE",
        quantity,
        note: note ?? "Received via POS",
        userId: staff.id,
      },
    });
  });

  return { success: true, productName: product.name, newStockQty: product.stockQty + quantity };
}
