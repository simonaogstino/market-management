import { prisma, Role } from "../src/index";
import { hash } from "bcryptjs";

async function main() {
  const store = await prisma.store.upsert({
    where: { id: "seed-store-1" },
    update: {
      address: "123 Market Street",
      phone: "+1 555-0100",
      currency: "USD",
      lowStockThreshold: 10,
      receiptHeader: "Main Store",
      receiptFooter: "Thank you for shopping with us!",
      timezone: "Asia/Beirut",
      receiptPrefix: "RCP-",
      receiptNextNumber: 1,
    },
    create: {
      id: "seed-store-1",
      name: "Main Store",
      address: "123 Market Street",
      phone: "+1 555-0100",
      currency: "USD",
      lowStockThreshold: 10,
      receiptHeader: "Main Store",
      receiptFooter: "Thank you for shopping with us!",
      timezone: "Asia/Beirut",
      receiptPrefix: "RCP-",
      receiptNextNumber: 1,
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

  const category = await prisma.category.upsert({
    where: { storeId_name: { storeId: store.id, name: "General" } },
    update: {},
    create: { name: "General", storeId: store.id },
  });

  const products = [
    { sku: "SKU-001", name: "Sample Product A", costCents: 650, priceCents: 999, stockQty: 100 },
    { sku: "SKU-002", name: "Sample Product B", costCents: 1000, priceCents: 1499, stockQty: 50 },
    { sku: "SKU-003", name: "Sample Product C", costCents: 300, priceCents: 499, stockQty: 200 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { storeId_sku: { storeId: store.id, sku: p.sku } },
      update: {
        costCents: p.costCents,
        supplierId: "seed-supplier-fresh",
      },
      create: {
        ...p,
        supplierId: "seed-supplier-fresh",
        categoryId: category.id,
        storeId: store.id,
      },
    });
  }

  await prisma.terminal.upsert({
    where: { apiKey: "pos-terminal-1-key" },
    update: {},
    create: {
      name: "POS Terminal 1",
      apiKey: "pos-terminal-1-key",
      storeId: store.id,
    },
  });

  await prisma.terminal.upsert({
    where: { apiKey: "pos-terminal-2-key" },
    update: {},
    create: {
      name: "POS Terminal 2",
      apiKey: "pos-terminal-2-key",
      storeId: store.id,
    },
  });

  await backfillReceiptNumbers(store.id);

  console.log("Seed complete.");
  console.log("Admin login: admin@store.local / admin123");
  console.log("Accountant login: accountant@store.local / accountant123 (sales only)");
  console.log("Staff PINs: 111111 (Alice), 222222 (Bob)");
  console.log("POS API keys: pos-terminal-1-key, pos-terminal-2-key");
}

function formatReceiptNumber(prefix: string, seq: number) {
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

async function backfillReceiptNumbers(storeId: string) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const sales = await prisma.sale.findMany({
    where: {
      receiptNumber: null,
      terminal: { storeId },
    },
    orderBy: { soldAt: "asc" },
  });

  if (sales.length === 0) return;

  let next = store.receiptNextNumber;
  for (const sale of sales) {
    await prisma.sale.update({
      where: { id: sale.id },
      data: { receiptNumber: formatReceiptNumber(store.receiptPrefix, next) },
    });
    next++;
  }

  await prisma.store.update({
    where: { id: storeId },
    data: { receiptNextNumber: next },
  });
}

async function seedOfficeUsers(storeId: string) {
  const passwordHash = await hash("accountant123", 10);
  await prisma.user.upsert({
    where: { email: "accountant@store.local" },
    update: {
      permissions: JSON.stringify(["sales:view", "reports:view"]),
      isActive: true,
    },
    create: {
      email: "accountant@store.local",
      name: "Jane Doe (Accountant)",
      passwordHash,
      role: Role.OFFICE,
      permissions: JSON.stringify(["sales:view", "reports:view"]),
      isActive: true,
      storeId,
    },
  });
}

async function seedSuppliers(storeId: string) {
  await prisma.supplier.upsert({
    where: { id: "seed-supplier-fresh" },
    update: { isActive: true },
    create: {
      id: "seed-supplier-fresh",
      name: "Fresh Foods Wholesale",
      contactPerson: "Mike — +1 555-0100",
      storeId,
    },
  });
}

async function seedStaff(storeId: string, passwordHash: string) {
  const staff = [
    { id: "seed-staff-alice", name: "Alice", pin: "111111" },
    { id: "seed-staff-bob", name: "Bob", pin: "222222" },
  ];

  for (const s of staff) {
    const pinHash = await hash(s.pin, 10);
    await prisma.user.upsert({
      where: { id: s.id },
      update: { pinHash, name: s.name, isActive: true },
      create: {
        id: s.id,
        email: null,
        name: s.name,
        passwordHash,
        pinHash,
        role: Role.STAFF,
        isActive: true,
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
