import {
  PaymentMethod,
  prisma,
  Role,
  SaleKind,
  SaleStatus,
  StockMovementType,
  SupplierPaymentType,
} from "../src/index";
import { hash } from "bcryptjs";

/** IQD amounts are stored as integer fils (1 IQD = 100). */
const iqd = (dinars: number) => Math.round(dinars * 100);

function atLocal(year: number, monthIndex: number, day: number, hour = 10, minute = 0) {
  // Asia/Baghdad-ish wall clock stored as local Date for demo purposes
  return new Date(year, monthIndex, day, hour, minute, 0, 0);
}

function formatReceiptNumber(prefix: string, seq: number) {
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

async function main() {
  const store = await prisma.store.upsert({
    where: { id: "seed-store-1" },
    update: {
      address: "123 Market Street",
      phone: "+964 770 000 0000",
      currency: "IQD",
      lowStockThreshold: 10,
      receiptHeader: "Main Store",
      receiptFooter: "Thank you for shopping with us!",
      timezone: "Asia/Baghdad",
      receiptPrefix: "RCP-",
      maxDiscountPercent: 15,
    },
    create: {
      id: "seed-store-1",
      name: "Main Store",
      address: "123 Market Street",
      phone: "+964 770 000 0000",
      currency: "IQD",
      lowStockThreshold: 10,
      receiptHeader: "Main Store",
      receiptFooter: "Thank you for shopping with us!",
      timezone: "Asia/Baghdad",
      receiptPrefix: "RCP-",
      receiptNextNumber: 1,
      maxDiscountPercent: 15,
    },
  });

  const passwordHash = await hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@store.local" },
    update: {},
    create: {
      email: "admin@store.local",
      name: "Store Admin",
      passwordHash,
      role: Role.ADMIN,
      storeId: store.id,
    },
  });

  await seedStaff(store.id, passwordHash);
  await seedOfficeUsers(store.id);
  await seedSuppliers(store.id);

  const groceries = await prisma.category.upsert({
    where: { storeId_name: { storeId: store.id, name: "Groceries" } },
    update: {},
    create: { name: "Groceries", storeId: store.id },
  });
  const beverages = await prisma.category.upsert({
    where: { storeId_name: { storeId: store.id, name: "Beverages" } },
    update: {},
    create: { name: "Beverages", storeId: store.id },
  });
  const household = await prisma.category.upsert({
    where: { storeId_name: { storeId: store.id, name: "Household" } },
    update: {},
    create: { name: "Household", storeId: store.id },
  });

  const productDefs = [
    {
      id: "seed-prod-rice",
      sku: "RICE-5KG",
      name: "Basmati Rice 5kg",
      costCents: iqd(8500),
      priceCents: iqd(11000),
      categoryId: groceries.id,
      supplierId: "seed-supplier-fresh",
    },
    {
      id: "seed-prod-oil",
      sku: "OIL-1L",
      name: "Cooking Oil 1L",
      costCents: iqd(2200),
      priceCents: iqd(3000),
      categoryId: groceries.id,
      supplierId: "seed-supplier-fresh",
    },
    {
      id: "seed-prod-sugar",
      sku: "SUGAR-1KG",
      name: "Sugar 1kg",
      costCents: iqd(1200),
      priceCents: iqd(1750),
      categoryId: groceries.id,
      supplierId: "seed-supplier-fresh",
    },
    {
      id: "seed-prod-tea",
      sku: "TEA-500",
      name: "Black Tea 500g",
      costCents: iqd(3500),
      priceCents: iqd(4800),
      categoryId: groceries.id,
      supplierId: "seed-supplier-fresh",
    },
    {
      id: "seed-prod-water",
      sku: "WATER-12",
      name: "Water Pack 12×500ml",
      costCents: iqd(2500),
      priceCents: iqd(3500),
      categoryId: beverages.id,
      supplierId: "seed-supplier-bev",
    },
    {
      id: "seed-prod-cola",
      sku: "COLA-1.5",
      name: "Cola 1.5L",
      costCents: iqd(900),
      priceCents: iqd(1250),
      categoryId: beverages.id,
      supplierId: "seed-supplier-bev",
    },
    {
      id: "seed-prod-juice",
      sku: "JUICE-1L",
      name: "Orange Juice 1L",
      costCents: iqd(1400),
      priceCents: iqd(2000),
      categoryId: beverages.id,
      supplierId: "seed-supplier-bev",
    },
    {
      id: "seed-prod-soap",
      sku: "SOAP-BAR",
      name: "Laundry Soap Bar",
      costCents: iqd(600),
      priceCents: iqd(1000),
      categoryId: household.id,
      supplierId: "seed-supplier-home",
    },
    {
      id: "seed-prod-detergent",
      sku: "DET-2KG",
      name: "Detergent 2kg",
      costCents: iqd(4500),
      priceCents: iqd(6000),
      categoryId: household.id,
      supplierId: "seed-supplier-home",
    },
    {
      id: "seed-prod-tissue",
      sku: "TISSUE-10",
      name: "Tissue Pack 10 rolls",
      costCents: iqd(2800),
      priceCents: iqd(4000),
      categoryId: household.id,
      supplierId: "seed-supplier-home",
    },
    // keep legacy SKUs so old POS demos still work
    {
      id: "seed-prod-a",
      sku: "SKU-001",
      name: "Sample Product A",
      costCents: iqd(650),
      priceCents: iqd(999),
      categoryId: groceries.id,
      supplierId: "seed-supplier-fresh",
    },
    {
      id: "seed-prod-b",
      sku: "SKU-002",
      name: "Sample Product B",
      costCents: iqd(1000),
      priceCents: iqd(1499),
      categoryId: groceries.id,
      supplierId: "seed-supplier-fresh",
    },
    {
      id: "seed-prod-c",
      sku: "SKU-003",
      name: "Sample Product C",
      costCents: iqd(300),
      priceCents: iqd(499),
      categoryId: beverages.id,
      supplierId: "seed-supplier-bev",
    },
  ];

  for (const p of productDefs) {
    await prisma.product.upsert({
      where: { storeId_sku: { storeId: store.id, sku: p.sku } },
      update: {
        name: p.name,
        costCents: p.costCents,
        priceCents: p.priceCents,
        categoryId: p.categoryId,
        supplierId: p.supplierId,
        isActive: true,
        showOnPos: true,
        stockQty: 0,
      },
      create: {
        id: p.id,
        sku: p.sku,
        name: p.name,
        costCents: p.costCents,
        priceCents: p.priceCents,
        categoryId: p.categoryId,
        supplierId: p.supplierId,
        stockQty: 0,
        storeId: store.id,
      },
    });
  }

  // Resolve products by SKU (ids may differ if created earlier without seed ids)
  const bySku = Object.fromEntries(
    (
      await prisma.product.findMany({
        where: { storeId: store.id, sku: { in: productDefs.map((p) => p.sku) } },
      })
    ).map((p) => [p.sku, p]),
  );

  const terminal1 = await prisma.terminal.upsert({
    where: { apiKey: "pos-terminal-1-key" },
    update: { isActive: true },
    create: {
      name: "POS Terminal 1",
      apiKey: "pos-terminal-1-key",
      storeId: store.id,
    },
  });

  const terminal2 = await prisma.terminal.upsert({
    where: { apiKey: "pos-terminal-2-key" },
    update: { isActive: true },
    create: {
      name: "POS Terminal 2",
      apiKey: "pos-terminal-2-key",
      storeId: store.id,
    },
  });

  await clearDemoTransactions(store.id, [terminal1.id, terminal2.id]);

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@store.local" } });
  const alice = await prisma.user.findUniqueOrThrow({ where: { id: "seed-staff-alice" } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { id: "seed-staff-bob" } });

  const year = new Date().getFullYear();
  // July of current year (monthIndex 6)
  const july = (day: number, hour = 11, minute = 0) => atLocal(year, 6, day, hour, minute);
  const today = new Date();
  const todayAt = (hour: number, minute = 0) =>
    atLocal(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute);

  // --- Deliveries ---
  await createDelivery({
    id: "seed-del-july-fresh",
    supplierId: "seed-supplier-fresh",
    storeId: store.id,
    referenceNumber: "FF-JUL-2401",
    deliveredAt: july(3, 9),
    note: "Seed: July grocery restock",
    recordedById: admin.id,
    paidAtDeliveryCents: iqd(50000),
    lines: [
      { product: bySku["RICE-5KG"], quantity: 40, unitCostCents: iqd(8500) },
      { product: bySku["OIL-1L"], quantity: 60, unitCostCents: iqd(2200) },
      { product: bySku["SUGAR-1KG"], quantity: 80, unitCostCents: iqd(1200) },
      { product: bySku["TEA-500"], quantity: 30, unitCostCents: iqd(3500) },
    ],
  });

  await createDelivery({
    id: "seed-del-july-bev",
    supplierId: "seed-supplier-bev",
    storeId: store.id,
    referenceNumber: "BV-JUL-118",
    deliveredAt: july(5, 10),
    note: "Seed: July beverages",
    recordedById: admin.id,
    paidAtDeliveryCents: 0,
    lines: [
      { product: bySku["WATER-12"], quantity: 50, unitCostCents: iqd(2500) },
      { product: bySku["COLA-1.5"], quantity: 72, unitCostCents: iqd(900) },
      { product: bySku["JUICE-1L"], quantity: 36, unitCostCents: iqd(1400) },
    ],
  });

  await createDelivery({
    id: "seed-del-july-home",
    supplierId: "seed-supplier-home",
    storeId: store.id,
    referenceNumber: "HM-JUL-55",
    deliveredAt: july(8, 14),
    note: "Seed: July household",
    recordedById: admin.id,
    paidAtDeliveryCents: iqd(25000),
    lines: [
      { product: bySku["SOAP-BAR"], quantity: 100, unitCostCents: iqd(600) },
      { product: bySku["DET-2KG"], quantity: 24, unitCostCents: iqd(4500) },
      { product: bySku["TISSUE-10"], quantity: 40, unitCostCents: iqd(2800) },
    ],
  });

  await createDelivery({
    id: "seed-del-recent-fresh",
    supplierId: "seed-supplier-fresh",
    storeId: store.id,
    referenceNumber: "FF-AUG-010",
    deliveredAt: todayAt(8, 30),
    note: "Seed: today's grocery top-up",
    recordedById: admin.id,
    paidAtDeliveryCents: iqd(20000),
    lines: [
      { product: bySku["OIL-1L"], quantity: 24, unitCostCents: iqd(2200) },
      { product: bySku["SUGAR-1KG"], quantity: 40, unitCostCents: iqd(1200) },
      { product: bySku["SKU-001"], quantity: 20, unitCostCents: iqd(650) },
    ],
  });

  await prisma.supplierPayment.create({
    data: {
      id: "seed-pay-bev-july",
      supplierId: "seed-supplier-bev",
      storeId: store.id,
      type: SupplierPaymentType.PAYMENT,
      amountCents: iqd(75000),
      paidAt: july(20, 16),
      reference: "CHQ-5521",
      note: "Seed: partial payment on July beverages",
      recordedById: admin.id,
    },
  });

  // --- Supplier returns ---
  await createSupplierReturn({
    id: "seed-return-july-damaged",
    supplierId: "seed-supplier-bev",
    storeId: store.id,
    referenceNumber: "RET-BV-09",
    returnedAt: july(12, 11),
    note: "Seed: damaged cola bottles",
    recordedById: admin.id,
    lines: [{ product: bySku["COLA-1.5"], quantity: 6, unitCostCents: iqd(900) }],
  });

  await createSupplierReturn({
    id: "seed-return-today-oil",
    supplierId: "seed-supplier-fresh",
    storeId: store.id,
    referenceNumber: "RET-FF-03",
    returnedAt: todayAt(9, 15),
    note: "Seed: leaking oil bottles returned",
    recordedById: admin.id,
    lines: [{ product: bySku["OIL-1L"], quantity: 3, unitCostCents: iqd(2200) }],
  });

  // --- July sales ---
  let receiptSeq = 1;
  const prefix = store.receiptPrefix;

  const julySales: Array<{
    localId: string;
    terminalId: string;
    staffId: string;
    soldAt: Date;
    paymentMethod: PaymentMethod;
    kind?: SaleKind;
    lines: Array<{ sku: string; quantity: number; unitCents?: number }>;
  }> = [
    {
      localId: "seed-sale-july-01",
      terminalId: terminal1.id,
      staffId: alice.id,
      soldAt: july(4, 10, 20),
      paymentMethod: PaymentMethod.CASH,
      lines: [
        { sku: "RICE-5KG", quantity: 2 },
        { sku: "OIL-1L", quantity: 3 },
        { sku: "SUGAR-1KG", quantity: 4 },
      ],
    },
    {
      localId: "seed-sale-july-02",
      terminalId: terminal1.id,
      staffId: alice.id,
      soldAt: july(7, 12, 5),
      paymentMethod: PaymentMethod.CARD,
      lines: [
        { sku: "WATER-12", quantity: 2 },
        { sku: "COLA-1.5", quantity: 6 },
        { sku: "TEA-500", quantity: 1 },
      ],
    },
    {
      localId: "seed-sale-july-03",
      terminalId: terminal2.id,
      staffId: bob.id,
      soldAt: july(10, 16, 40),
      paymentMethod: PaymentMethod.CASH,
      lines: [
        { sku: "DET-2KG", quantity: 1 },
        { sku: "SOAP-BAR", quantity: 5 },
        { sku: "TISSUE-10", quantity: 2 },
      ],
    },
    {
      localId: "seed-sale-july-04",
      terminalId: terminal1.id,
      staffId: bob.id,
      soldAt: july(15, 11, 10),
      paymentMethod: PaymentMethod.TRANSFER,
      lines: [
        { sku: "RICE-5KG", quantity: 1 },
        { sku: "JUICE-1L", quantity: 4 },
        { sku: "SKU-001", quantity: 2 },
      ],
    },
    {
      localId: "seed-sale-july-05",
      terminalId: terminal2.id,
      staffId: alice.id,
      soldAt: july(22, 18, 25),
      paymentMethod: PaymentMethod.CASH,
      lines: [
        { sku: "WATER-12", quantity: 3 },
        { sku: "COLA-1.5", quantity: 4 },
        { sku: "OIL-1L", quantity: 2 },
        { sku: "SUGAR-1KG", quantity: 3 },
      ],
    },
    {
      localId: "seed-sale-july-return-01",
      terminalId: terminal1.id,
      staffId: alice.id,
      soldAt: july(23, 14, 0),
      paymentMethod: PaymentMethod.CASH,
      kind: SaleKind.RETURN,
      lines: [{ sku: "COLA-1.5", quantity: 1, unitCents: iqd(1250) }],
    },
    {
      localId: "seed-sale-july-06",
      terminalId: terminal1.id,
      staffId: bob.id,
      soldAt: july(28, 13, 50),
      paymentMethod: PaymentMethod.CARD,
      lines: [
        { sku: "TEA-500", quantity: 2 },
        { sku: "SKU-002", quantity: 3 },
        { sku: "SKU-003", quantity: 5 },
      ],
    },
  ];

  for (const sale of julySales) {
    receiptSeq = await createSale({
      ...sale,
      receiptNumber: formatReceiptNumber(prefix, receiptSeq),
      nextSeq: receiptSeq,
    });
  }

  // --- Today's sales ---
  const todaySales = [
    {
      localId: "seed-sale-today-01",
      terminalId: terminal1.id,
      staffId: alice.id,
      soldAt: todayAt(9, 45),
      paymentMethod: PaymentMethod.CASH,
      lines: [
        { sku: "OIL-1L", quantity: 2 },
        { sku: "SUGAR-1KG", quantity: 2 },
        { sku: "WATER-12", quantity: 1 },
      ],
    },
    {
      localId: "seed-sale-today-02",
      terminalId: terminal1.id,
      staffId: alice.id,
      soldAt: todayAt(11, 20),
      paymentMethod: PaymentMethod.CARD,
      lines: [
        { sku: "RICE-5KG", quantity: 1 },
        { sku: "TEA-500", quantity: 1 },
        { sku: "SOAP-BAR", quantity: 3 },
      ],
    },
    {
      localId: "seed-sale-today-03",
      terminalId: terminal2.id,
      staffId: bob.id,
      soldAt: todayAt(13, 5),
      paymentMethod: PaymentMethod.CASH,
      lines: [
        { sku: "COLA-1.5", quantity: 4 },
        { sku: "JUICE-1L", quantity: 2 },
        { sku: "TISSUE-10", quantity: 1 },
      ],
    },
    {
      localId: "seed-sale-today-04",
      terminalId: terminal2.id,
      staffId: bob.id,
      soldAt: todayAt(15, 30),
      paymentMethod: PaymentMethod.TRANSFER,
      lines: [
        { sku: "DET-2KG", quantity: 1 },
        { sku: "SKU-001", quantity: 4 },
        { sku: "SKU-003", quantity: 6 },
      ],
    },
  ] as const;

  for (const sale of todaySales) {
    receiptSeq = await createSale({
      ...sale,
      receiptNumber: formatReceiptNumber(prefix, receiptSeq),
      nextSeq: receiptSeq,
    });
  }

  await prisma.store.update({
    where: { id: store.id },
    data: { receiptNextNumber: receiptSeq },
  });

  console.log("Seed complete.");
  console.log(`Demo data: ${productDefs.length} products, July + today sales, 3 suppliers, deliveries & returns.`);
  console.log("Admin login: admin@store.local / admin123");
  console.log("Accountant login: accountant@store.local / accountant123 (sales only)");
  console.log("Staff PINs: 111111 (Alice), 222222 (Bob)");
  console.log("POS API keys: pos-terminal-1-key, pos-terminal-2-key");
}

type ProductRow = { id: string; sku: string; priceCents: number; costCents: number; stockQty: number };

async function clearDemoTransactions(storeId: string, terminalIds: string[]) {
  await prisma.stockMovement.deleteMany({
    where: {
      storeId,
      OR: [
        { supplierDeliveryId: { startsWith: "seed-del-" } },
        { supplierReturnId: { startsWith: "seed-return-" } },
        { note: { startsWith: "Seed:" } },
      ],
    },
  });
  await prisma.sale.deleteMany({
    where: { terminalId: { in: terminalIds }, localId: { startsWith: "seed-" } },
  });
  await prisma.supplierReturn.deleteMany({
    where: { storeId, id: { startsWith: "seed-return-" } },
  });
  await prisma.supplierDelivery.deleteMany({
    where: { storeId, id: { startsWith: "seed-del-" } },
  });
  await prisma.supplierPayment.deleteMany({
    where: { storeId, id: { startsWith: "seed-pay-" } },
  });
}

async function createDelivery(args: {
  id: string;
  supplierId: string;
  storeId: string;
  referenceNumber: string;
  deliveredAt: Date;
  note: string;
  recordedById: string;
  paidAtDeliveryCents: number;
  lines: Array<{ product: ProductRow; quantity: number; unitCostCents: number }>;
}) {
  const lines = args.lines.filter((l) => l.product);
  const listTotalCents = lines.reduce((s, l) => s + l.quantity * l.unitCostCents, 0);

  await prisma.supplierDelivery.create({
    data: {
      id: args.id,
      supplierId: args.supplierId,
      storeId: args.storeId,
      referenceNumber: args.referenceNumber,
      deliveredAt: args.deliveredAt,
      note: args.note,
      listTotalCents,
      discountPercent: 0,
      discountCents: 0,
      totalCostCents: listTotalCents,
      paidAtDeliveryCents: args.paidAtDeliveryCents,
      updateStock: true,
      recordedById: args.recordedById,
      lines: {
        create: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitCostCents: l.unitCostCents,
          lineCostCents: l.quantity * l.unitCostCents,
        })),
      },
    },
  });

  for (const line of lines) {
    await prisma.product.update({
      where: { id: line.product.id },
      data: { stockQty: { increment: line.quantity }, version: { increment: 1 } },
    });
    await prisma.stockMovement.create({
      data: {
        productId: line.product.id,
        storeId: args.storeId,
        type: StockMovementType.RECEIVE,
        quantity: line.quantity,
        note: args.note,
        userId: args.recordedById,
        supplierDeliveryId: args.id,
      },
    });
  }
}

async function createSupplierReturn(args: {
  id: string;
  supplierId: string;
  storeId: string;
  referenceNumber: string;
  returnedAt: Date;
  note: string;
  recordedById: string;
  lines: Array<{ product: ProductRow; quantity: number; unitCostCents: number }>;
}) {
  const lines = args.lines.filter((l) => l.product);
  const totalCostCents = lines.reduce((s, l) => s + l.quantity * l.unitCostCents, 0);

  await prisma.supplierReturn.create({
    data: {
      id: args.id,
      supplierId: args.supplierId,
      storeId: args.storeId,
      referenceNumber: args.referenceNumber,
      returnedAt: args.returnedAt,
      note: args.note,
      totalCostCents,
      recordedById: args.recordedById,
      lines: {
        create: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitCostCents: l.unitCostCents,
          lineCostCents: l.quantity * l.unitCostCents,
        })),
      },
    },
  });

  for (const line of lines) {
    await prisma.product.update({
      where: { id: line.product.id },
      data: { stockQty: { decrement: line.quantity }, version: { increment: 1 } },
    });
    await prisma.stockMovement.create({
      data: {
        productId: line.product.id,
        storeId: args.storeId,
        type: StockMovementType.RETURN_TO_SUPPLIER,
        quantity: -line.quantity,
        note: args.note,
        userId: args.recordedById,
        supplierReturnId: args.id,
      },
    });
  }
}

async function createSale(args: {
  localId: string;
  terminalId: string;
  staffId: string;
  soldAt: Date;
  paymentMethod: PaymentMethod;
  kind?: SaleKind;
  receiptNumber: string;
  nextSeq: number;
  lines: Array<{ sku: string; quantity: number; unitCents?: number }>;
}) {
  const products = await prisma.product.findMany({
    where: { sku: { in: args.lines.map((l) => l.sku) } },
  });
  const map = Object.fromEntries(products.map((p) => [p.sku, p]));

  const kind = args.kind ?? SaleKind.SALE;
  const built = args.lines.map((line) => {
    const product = map[line.sku];
    if (!product) throw new Error(`Missing product SKU ${line.sku}`);
    const unitCents = line.unitCents ?? product.priceCents;
    return {
      productId: product.id,
      quantity: line.quantity,
      unitCents,
      lineCents: unitCents * line.quantity,
    };
  });
  const totalCents = built.reduce((s, l) => s + l.lineCents, 0);

  await prisma.sale.create({
    data: {
      localId: args.localId,
      terminalId: args.terminalId,
      staffId: args.staffId,
      kind,
      status: SaleStatus.SYNCED,
      receiptNumber: args.receiptNumber,
      totalCents,
      paymentMethod: args.paymentMethod,
      soldAt: args.soldAt,
      syncedAt: args.soldAt,
      lines: { create: built },
    },
  });

  for (const line of built) {
    const delta = kind === SaleKind.RETURN ? line.quantity : -line.quantity;
    await prisma.product.update({
      where: { id: line.productId },
      data: { stockQty: { increment: delta }, version: { increment: 1 } },
    });
  }

  return args.nextSeq + 1;
}

async function seedOfficeUsers(storeId: string) {
  const passwordHash = await hash("accountant123", 10);
  await prisma.user.upsert({
    where: { email: "accountant@store.local" },
    update: {
      permissions: JSON.stringify([
        "sales:view",
        "reports:view",
        "cash:view",
        "safe:view",
        "safe:manage",
      ]),
      isActive: true,
    },
    create: {
      email: "accountant@store.local",
      name: "Jane Doe (Accountant)",
      passwordHash,
      role: Role.OFFICE,
      permissions: JSON.stringify([
        "sales:view",
        "reports:view",
        "cash:view",
        "safe:view",
        "safe:manage",
      ]),
      isActive: true,
      storeId,
    },
  });
}

async function seedSuppliers(storeId: string) {
  const suppliers = [
    {
      id: "seed-supplier-fresh",
      name: "Fresh Foods Wholesale",
      contactPerson: "Mike Hassan",
      phone: "+964 770 111 0001",
      openingBalanceCents: iqd(150000),
    },
    {
      id: "seed-supplier-bev",
      name: "Baghdad Beverages Co.",
      contactPerson: "Sara Ali",
      phone: "+964 770 222 0002",
      openingBalanceCents: iqd(80000),
    },
    {
      id: "seed-supplier-home",
      name: "HomeCare Supplies",
      contactPerson: "Omar Karim",
      phone: "+964 770 333 0003",
      openingBalanceCents: 0,
    },
  ];

  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        openingBalanceCents: s.openingBalanceCents,
        isActive: true,
      },
      create: { ...s, storeId },
    });
  }
}

async function seedStaff(storeId: string, passwordHash: string) {
  const defaultPosPerms = JSON.stringify([
    "pos:sell",
    "pos:return",
    "pos:cash_session",
    "pos:receive_stock",
  ]);
  const staff = [
    { id: "seed-staff-alice", name: "Alice", pin: "111111" },
    { id: "seed-staff-bob", name: "Bob", pin: "222222" },
  ];

  for (const s of staff) {
    const pinHash = await hash(s.pin, 10);
    await prisma.user.upsert({
      where: { id: s.id },
      update: {
        pinHash,
        name: s.name,
        isActive: true,
        permissions: defaultPosPerms,
      },
      create: {
        id: s.id,
        email: null,
        name: s.name,
        passwordHash,
        pinHash,
        role: Role.STAFF,
        isActive: true,
        permissions: defaultPosPerms,
        storeId,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
