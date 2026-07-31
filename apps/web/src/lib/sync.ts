import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { SalePushDto, SyncPushResult } from "@market/shared";
import {
  discountedUnitCents,
  effectivePosPriceCents,
  hasActiveProductDiscount,
} from "@market/shared";
import { prisma, SaleStatus } from "@market/database";
import { authOptions } from "./auth";
import { ensureSaleReceiptNumber } from "./assign-receipt-number";
import { logger } from "./logger";
import { hasPosPermission, parsePosPermissions } from "./permissions";

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

  const { ensureDatabase } = await import("@/ensure-database");
  await ensureDatabase();

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
  const saleKind = kind === "RETURN" ? "RETURN" : kind === "OWNER" ? "OWNER" : "SALE";
  const paymentMethod =
    sale.paymentMethod === "CARD" || sale.paymentMethod === "TRANSFER"
      ? sale.paymentMethod
      : "CASH";

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

  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const maxDiscountPercent = store.maxDiscountPercent ?? 0;

  let staffMayDiscount = false;
  if (sale.staffId) {
    const staffUser = await prisma.user.findFirst({
      where: { id: sale.staffId, storeId },
      select: { role: true, permissions: true },
    });
    if (staffUser) {
      const perms = parsePosPermissions(staffUser.permissions);
      staffMayDiscount = hasPosPermission(staffUser.role, perms, "pos:discount");
    }
  }

  const claimedDiscount = Math.max(0, Math.min(100, sale.discountPercent ?? 0));

  if (saleKind === "SALE") {
    if (claimedDiscount > 0) {
      if (!staffMayDiscount) {
        conflicts.push({
          productId: sale.lines[0]?.productId ?? "discount",
          message: "Staff is not allowed to apply discounts",
        });
      } else if (claimedDiscount > maxDiscountPercent) {
        conflicts.push({
          productId: sale.lines[0]?.productId ?? "discount",
          message: `Discount ${claimedDiscount}% exceeds store maximum of ${maxDiscountPercent}%`,
        });
      }
    }

    for (const line of sale.lines) {
      const product = await prisma.product.findFirst({
        where: { id: line.productId, storeId },
      });
      if (!product) continue; // stock loop below will catch missing products

      const listCents = effectivePosPriceCents(product);
      const minUnit = discountedUnitCents(listCents, maxDiscountPercent);
      const atProductPromo =
        hasActiveProductDiscount(product) &&
        line.unitCents >= (product.discountPriceCents ?? 0);

      if (line.unitCents < minUnit) {
        conflicts.push({
          productId: line.productId,
          message: `Unit price below allowed discount (min ${minUnit}¢ vs list ${listCents}¢)`,
        });
      } else if (line.unitCents < product.priceCents && !atProductPromo) {
        if (!staffMayDiscount || maxDiscountPercent <= 0) {
          conflicts.push({
            productId: line.productId,
            message: "Discounted price not allowed for this staff / store",
          });
        }
      }

      if (line.lineCents !== line.quantity * line.unitCents) {
        conflicts.push({
          productId: line.productId,
          message: "Line total does not match quantity × unit price",
        });
      }
    }

    const sumLines = sale.lines.reduce((s, l) => s + l.lineCents, 0);
    if (sumLines !== sale.totalCents) {
      conflicts.push({
        productId: sale.lines[0]?.productId ?? "total",
        message: "Sale total does not match sum of line totals",
      });
    }
  }

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
          kind: saleKind,
          paymentMethod,
          totalCents: sale.totalCents,
          soldAt: new Date(sale.soldAt),
          staffId: sale.staffId ?? undefined,
        },
        create: {
          localId: sale.localId,
          terminalId,
          kind: saleKind,
          paymentMethod,
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

    logger.warn("Sale sync conflict", {
      localId: sale.localId,
      terminalId,
      kind: saleKind,
      conflicts,
      receiptNumber: conflictSale.receiptNumber,
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
        kind: saleKind,
        paymentMethod,
        syncedAt: new Date(),
        totalCents: sale.totalCents,
        soldAt: new Date(sale.soldAt),
        staffId: sale.staffId ?? undefined,
      },
      create: {
        localId: sale.localId,
        terminalId,
        kind: saleKind,
        paymentMethod,
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
      const product = await tx.product.findUnique({ where: { id: line.productId } });
      if (!product) continue;

      const stockQty = isReturn
        ? product.stockQty + line.quantity
        : Math.max(0, product.stockQty - line.quantity);

      let discountQtyLeft = product.discountQtyLeft;
      let discountPriceCents = product.discountPriceCents;
      // Consume limited promo only on normal sales (not returns / owner).
      if (saleKind === "SALE" && !isReturn && hasActiveProductDiscount(product)) {
        const used = Math.min(line.quantity, discountQtyLeft);
        discountQtyLeft = discountQtyLeft - used;
        if (discountQtyLeft <= 0) {
          discountQtyLeft = 0;
          discountPriceCents = null;
        }
      }

      await tx.product.update({
        where: { id: line.productId },
        data: {
          stockQty,
          discountQtyLeft,
          discountPriceCents,
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
