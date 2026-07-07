import { NextResponse } from "next/server";
import type { SyncPullResponse } from "@market/shared";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";

export async function GET(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const [products, categories, store] = await Promise.all([
    prisma.product.findMany({
      where: { storeId: terminal.storeId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { storeId: terminal.storeId },
      orderBy: { name: "asc" },
    }),
    prisma.store.findUniqueOrThrow({ where: { id: terminal.storeId } }),
  ]);
  await prisma.terminal.update({
    where: { id: terminal.id },
    data: { lastSyncAt: new Date() },
  });

  const response: SyncPullResponse = {
    serverTime: new Date().toISOString(),
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      description: p.description,
      costCents: p.costCents,
      priceCents: p.priceCents,
      supplierId: p.supplierId,
      categoryId: p.categoryId,
      stockQty: p.stockQty,
      version: p.version,
      isActive: p.isActive,
      updatedAt: p.updatedAt.toISOString(),
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    store: {
      name: store.name,
      address: store.address,
      phone: store.phone,
      currency: store.currency,
      lowStockThreshold: store.lowStockThreshold,
      receiptHeader: store.receiptHeader,
      receiptFooter: store.receiptFooter,
      timezone: store.timezone,
      receiptPrefix: store.receiptPrefix,
      receiptNextNumber: store.receiptNextNumber,
    },
  };
  return NextResponse.json(response);
}
