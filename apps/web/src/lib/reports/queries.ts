import { prisma } from "@/lib/db";
import { computeSupplierBalance } from "@/lib/suppliers";
import { eachDay, type DateRange } from "./date-range";

function saleSign(kind: string) {
  return kind === "RETURN" ? -1 : 1;
}

function activeSaleWhere(range?: DateRange) {
  return {
    status: { not: "VOIDED" as const },
    ...(range ? { soldAt: { gte: range.from, lte: range.to } } : {}),
  };
}

async function fetchActiveSaleLines(range: DateRange) {
  return prisma.saleLine.findMany({
    where: { sale: activeSaleWhere(range) },
    include: {
      product: { include: { category: true, supplier: true } },
      sale: { include: { terminal: true, staff: true } },
    },
  });
}

export async function getSalesSummary(range: DateRange) {
  const sales = await prisma.sale.findMany({
    where: { soldAt: { gte: range.from, lte: range.to } },
    select: { kind: true, status: true, totalCents: true, soldAt: true },
  });

  let saleCount = 0;
  let returnCount = 0;
  let voidedCount = 0;
  let grossCents = 0;
  let returnsCents = 0;

  const dailyMap = new Map<string, { sales: number; returns: number; net: number }>();
  for (const day of eachDay(range)) {
    dailyMap.set(day, { sales: 0, returns: 0, net: 0 });
  }

  for (const s of sales) {
    if (s.status === "VOIDED") {
      voidedCount++;
      continue;
    }
    const day = s.soldAt.toISOString().slice(0, 10);
    const bucket = dailyMap.get(day) ?? { sales: 0, returns: 0, net: 0 };

    if (s.kind === "RETURN") {
      returnCount++;
      returnsCents += s.totalCents;
      bucket.returns += s.totalCents;
      bucket.net -= s.totalCents;
    } else {
      saleCount++;
      grossCents += s.totalCents;
      bucket.sales += s.totalCents;
      bucket.net += s.totalCents;
    }
    dailyMap.set(day, bucket);
  }

  const daily = eachDay(range).map((date) => ({
    date,
    ...dailyMap.get(date)!,
  }));

  return {
    saleCount,
    returnCount,
    voidedCount,
    grossCents,
    returnsCents,
    netCents: grossCents - returnsCents,
    daily,
  };
}

export async function getTopProducts(range: DateRange, limit = 50) {
  const lines = await fetchActiveSaleLines(range);
  const map = new Map<
    string,
    { sku: string; name: string; quantity: number; revenueCents: number }
  >();

  for (const line of lines) {
    const sign = saleSign(line.sale.kind);
    const existing = map.get(line.productId) ?? {
      sku: line.product.sku,
      name: line.product.name,
      quantity: 0,
      revenueCents: 0,
    };
    existing.quantity += sign * line.quantity;
    existing.revenueCents += sign * line.lineCents;
    map.set(line.productId, existing);
  }

  return [...map.values()]
    .filter((p) => p.quantity !== 0 || p.revenueCents !== 0)
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, limit);
}

export async function getSalesByTerminal(range: DateRange) {
  const sales = await prisma.sale.findMany({
    where: activeSaleWhere(range),
    include: { terminal: true },
  });

  const map = new Map<string, { name: string; count: number; netCents: number }>();
  for (const s of sales) {
    const existing = map.get(s.terminalId) ?? {
      name: s.terminal.name,
      count: 0,
      netCents: 0,
    };
    existing.count++;
    existing.netCents += saleSign(s.kind) * s.totalCents;
    map.set(s.terminalId, existing);
  }

  return [...map.values()].sort((a, b) => b.netCents - a.netCents);
}

export async function getSalesByCashier(range: DateRange) {
  const sales = await prisma.sale.findMany({
    where: activeSaleWhere(range),
    include: { staff: true },
  });

  const map = new Map<string, { name: string; count: number; netCents: number }>();
  for (const s of sales) {
    const key = s.staffId ?? "__none__";
    const existing = map.get(key) ?? {
      name: s.staff?.name ?? "Unknown",
      count: 0,
      netCents: 0,
    };
    existing.count++;
    existing.netCents += saleSign(s.kind) * s.totalCents;
    map.set(key, existing);
  }

  return [...map.values()].sort((a, b) => b.netCents - a.netCents);
}

export async function getSalesByCategory(range: DateRange) {
  const lines = await fetchActiveSaleLines(range);
  const map = new Map<string, { name: string; quantity: number; revenueCents: number }>();

  for (const line of lines) {
    const sign = saleSign(line.sale.kind);
    const catName = line.product.category?.name ?? "Uncategorized";
    const existing = map.get(catName) ?? { name: catName, quantity: 0, revenueCents: 0 };
    existing.quantity += sign * line.quantity;
    existing.revenueCents += sign * line.lineCents;
    map.set(catName, existing);
  }

  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export async function getHourlySales(range: DateRange) {
  const sales = await prisma.sale.findMany({
    where: activeSaleWhere(range),
    select: { soldAt: true, kind: true, totalCents: true },
  });

  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${h.toString().padStart(2, "0")}:00`,
    count: 0,
    netCents: 0,
  }));

  for (const s of sales) {
    const h = s.soldAt.getHours();
    hours[h].count++;
    hours[h].netCents += saleSign(s.kind) * s.totalCents;
  }

  const maxCents = Math.max(...hours.map((h) => Math.abs(h.netCents)), 1);
  return { hours, maxCents };
}

export async function getReturnsAndVoids(range: DateRange) {
  const sales = await prisma.sale.findMany({
    where: {
      soldAt: { gte: range.from, lte: range.to },
      OR: [{ kind: "RETURN" }, { status: "VOIDED" }],
    },
    orderBy: { soldAt: "desc" },
    include: {
      terminal: true,
      staff: true,
      lines: { include: { product: true } },
    },
  });

  return sales;
}

export async function getGrossProfit(range: DateRange) {
  const lines = await fetchActiveSaleLines(range);

  let revenueCents = 0;
  let costCents = 0;
  const productMap = new Map<
    string,
    { sku: string; name: string; revenueCents: number; costCents: number; quantity: number }
  >();

  for (const line of lines) {
    const sign = saleSign(line.sale.kind);
    const rev = sign * line.lineCents;
    const cost = sign * line.quantity * line.product.costCents;
    revenueCents += rev;
    costCents += cost;

    const existing = productMap.get(line.productId) ?? {
      sku: line.product.sku,
      name: line.product.name,
      revenueCents: 0,
      costCents: 0,
      quantity: 0,
    };
    existing.revenueCents += rev;
    existing.costCents += cost;
    existing.quantity += sign * line.quantity;
    productMap.set(line.productId, existing);
  }

  const profitCents = revenueCents - costCents;
  const marginPct = revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

  const byProduct = [...productMap.values()]
    .map((p) => ({
      ...p,
      profitCents: p.revenueCents - p.costCents,
      marginPct: p.revenueCents > 0 ? ((p.revenueCents - p.costCents) / p.revenueCents) * 100 : 0,
    }))
    .sort((a, b) => b.profitCents - a.profitCents);

  return { revenueCents, costCents, profitCents, marginPct, byProduct };
}

export async function getLowStock(threshold: number) {
  return prisma.product.findMany({
    where: { isActive: true, stockQty: { lte: threshold } },
    include: { category: true, supplier: true },
    orderBy: { stockQty: "asc" },
  });
}

export async function getStockValuation() {
  const products = await prisma.product.findMany({
    where: { isActive: true, stockQty: { gt: 0 } },
    include: { category: true, supplier: true },
    orderBy: { name: "asc" },
  });

  const rows = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category?.name ?? "—",
    supplier: p.supplier?.name ?? "—",
    stockQty: p.stockQty,
    costCents: p.costCents,
    valueCents: p.stockQty * p.costCents,
  }));

  const totalValueCents = rows.reduce((sum, r) => sum + r.valueCents, 0);
  return { rows, totalValueCents, productCount: rows.length };
}

export async function getDeadStock(days: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const products = await prisma.product.findMany({
    where: { isActive: true, stockQty: { gt: 0 } },
    include: { category: true },
  });

  const recentLines = await prisma.saleLine.findMany({
    where: {
      sale: {
        status: { not: "VOIDED" },
        kind: "SALE",
        soldAt: { gte: cutoff },
      },
    },
    select: { productId: true },
    distinct: ["productId"],
  });

  const soldIds = new Set(recentLines.map((l) => l.productId));
  return products
    .filter((p) => !soldIds.has(p.id))
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.category?.name ?? "—",
      stockQty: p.stockQty,
      valueCents: p.stockQty * p.costCents,
    }))
    .sort((a, b) => b.valueCents - a.valueCents);
}

export async function getStockAdjustments(range: DateRange) {
  return prisma.stockMovement.findMany({
    where: {
      type: "ADJUSTMENT",
      createdAt: { gte: range.from, lte: range.to },
    },
    include: { product: true, user: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSupplierBalances() {
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    include: {
      deliveries: { select: { totalCostCents: true, paidAtDeliveryCents: true } },
      returns: { select: { totalCostCents: true } },
      payments: { select: { type: true, amountCents: true } },
    },
    orderBy: { name: "asc" },
  });

  return suppliers.map((s) => {
    const balance = computeSupplierBalance({
      openingBalanceCents: s.openingBalanceCents,
      deliveries: s.deliveries,
      returns: s.returns,
      payments: s.payments,
    });
    return {
      id: s.id,
      name: s.name,
      contactPerson: s.contactPerson,
      ...balance,
    };
  });
}

export async function getSupplierHistory(range: DateRange) {
  const [deliveries, returns, payments] = await Promise.all([
    prisma.supplierDelivery.findMany({
      where: { deliveredAt: { gte: range.from, lte: range.to } },
      include: { supplier: true, recordedBy: true, lines: { include: { product: true } } },
      orderBy: { deliveredAt: "desc" },
    }),
    prisma.supplierReturn.findMany({
      where: { returnedAt: { gte: range.from, lte: range.to } },
      include: { supplier: true, recordedBy: true, lines: { include: { product: true } } },
      orderBy: { returnedAt: "desc" },
    }),
    prisma.supplierPayment.findMany({
      where: { paidAt: { gte: range.from, lte: range.to } },
      include: { supplier: true, recordedBy: true },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const totalDelivered = deliveries.reduce((s, d) => s + d.totalCostCents, 0);
  const totalReturned = returns.reduce((s, r) => s + r.totalCostCents, 0);
  const totalPaid = payments
    .filter((p) => p.type === "PAYMENT")
    .reduce((s, p) => s + p.amountCents, 0);
  const totalCredits = payments
    .filter((p) => p.type === "CREDIT")
    .reduce((s, p) => s + p.amountCents, 0);

  return { deliveries, returns, payments, totalDelivered, totalReturned, totalPaid, totalCredits };
}

export async function getStaffStockReceipts(range: DateRange) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      type: "RECEIVE",
      createdAt: { gte: range.from, lte: range.to },
    },
    include: { product: true, user: true },
    orderBy: { createdAt: "desc" },
  });

  const byStaff = new Map<string, { name: string; count: number; totalQty: number }>();
  for (const m of movements) {
    const key = m.userId ?? "__none__";
    const existing = byStaff.get(key) ?? { name: m.user?.name ?? "Unknown", count: 0, totalQty: 0 };
    existing.count++;
    existing.totalQty += m.quantity;
    byStaff.set(key, existing);
  }

  return {
    movements,
    byStaff: [...byStaff.values()].sort((a, b) => b.totalQty - a.totalQty),
  };
}

export async function getSyncOperations() {
  const [pendingSales, openConflicts, terminals, recentConflicts] = await Promise.all([
    prisma.sale.count({ where: { status: "PENDING_SYNC" } }),
    prisma.syncConflict.count({ where: { status: "OPEN" } }),
    prisma.terminal.findMany({ orderBy: { name: "asc" } }),
    prisma.syncConflict.findMany({
      where: { status: "OPEN" },
      include: { sale: { include: { terminal: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return { pendingSales, openConflicts, terminals, recentConflicts };
}

export async function getPeriodComparison(range: DateRange) {
  const prevFrom = new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime()) - 1);
  const prevTo = new Date(range.from.getTime() - 1);
  const previous: DateRange = { from: prevFrom, to: prevTo };

  const [current, prior] = await Promise.all([getSalesSummary(range), getSalesSummary(previous)]);

  function pctChange(cur: number, prev: number) {
    if (prev === 0) return cur === 0 ? 0 : 100;
    return ((cur - prev) / Math.abs(prev)) * 100;
  }

  return {
    current,
    previous: prior,
    previousRange: previous,
    changes: {
      netCents: pctChange(current.netCents, prior.netCents),
      saleCount: pctChange(current.saleCount, prior.saleCount),
      returnCount: pctChange(current.returnCount, prior.returnCount),
    },
  };
}

export async function getDailyClose(range: DateRange) {
  const [summary, topProducts, byCashier, byTerminal] = await Promise.all([
    getSalesSummary(range),
    getTopProducts(range, 10),
    getSalesByCashier(range),
    getSalesByTerminal(range),
  ]);

  return { summary, topProducts, byCashier, byTerminal };
}
