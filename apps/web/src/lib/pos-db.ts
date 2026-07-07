import Dexie, { type Table } from "dexie";
import type { ProductDto, SaleLineDto, StoreSettingsDto } from "@market/shared";

export interface CartLine {
  productId: string;
  name: string;
  quantity: number;
  unitCents: number;
  lineCents: number;
}

export interface SaleOutbox {
  localId: string;
  soldAt: string;
  totalCents: number;
  kind: "SALE" | "RETURN";
  lines: SaleLineDto[];
  syncStatus: "pending" | "synced" | "conflict";
  conflictJson?: string;
  createdAt: string;
  staffId?: string;
  staffName?: string;
  voided?: boolean;
  receiptNumber?: string;
}

export interface StaffSession {
  staffId: string;
  staffName: string;
}

export interface CompletedSale {
  localId: string;
  soldAt: string;
  totalCents: number;
  kind?: "SALE" | "RETURN";
  lines: Array<SaleLineDto & { productName?: string }>;
  staffId?: string;
  staffName?: string;
  receiptNumber?: string | null;
}

class PosDatabase extends Dexie {
  products!: Table<ProductDto, string>;
  cart!: Table<CartLine, string>;
  salesOutbox!: Table<SaleOutbox, string>;
  settings!: Table<{ key: string; value: string }, string>;

  constructor() {
    super("market_pos");
    this.version(1).stores({
      products: "id, sku, name",
      cart: "productId",
      salesOutbox: "localId, syncStatus",
      settings: "key",
    });
    this.version(2).stores({
      products: "id, sku, name",
      cart: "productId",
      salesOutbox: "localId, syncStatus, voided",
      settings: "key",
    });
    this.version(3).stores({
      products: "id, sku, name",
      cart: "productId",
      salesOutbox: "localId, syncStatus, voided, kind",
      settings: "key",
    });
  }
}

export const posDb = new PosDatabase();

export async function getSetting(key: string) {
  const row = await posDb.settings.get(key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await posDb.settings.put({ key, value });
}

export async function getTerminalConfig() {
  const apiKey = await getSetting("apiKey");
  if (!apiKey) return null;
  return {
    apiKey,
    terminalId: (await getSetting("terminalId")) ?? "",
    terminalName: (await getSetting("terminalName")) ?? "POS",
  };
}

export async function saveTerminalConfig(config: {
  apiKey: string;
  terminalId?: string;
  terminalName?: string;
}) {
  await setSetting("apiKey", config.apiKey);
  if (config.terminalId) await setSetting("terminalId", config.terminalId);
  if (config.terminalName) await setSetting("terminalName", config.terminalName);
}

export async function saveStoreSettings(settings: StoreSettingsDto) {
  await setSetting("storeSettings", JSON.stringify(settings));
}

export async function getStoreSettings(): Promise<StoreSettingsDto | null> {
  const raw = await getSetting("storeSettings");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoreSettingsDto;
  } catch {
    return null;
  }
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const staffId = await getSetting("staffId");
  const staffName = await getSetting("staffName");
  if (!staffId || !staffName) return null;
  return { staffId, staffName };
}

export async function saveStaffSession(session: StaffSession) {
  await setSetting("staffId", session.staffId);
  await setSetting("staffName", session.staffName);
}

export async function clearStaffSession() {
  await posDb.settings.delete("staffId");
  await posDb.settings.delete("staffName");
}

export async function getLastSyncAt() {
  return getSetting("lastSyncAt");
}

export async function setLastSyncAt(iso: string) {
  await setSetting("lastSyncAt", iso);
}

export async function upsertProducts(products: ProductDto[]) {
  await posDb.products.bulkPut(products);
}

export async function listProducts() {
  return posDb.products.filter((p) => p.isActive).toArray();
}

export async function getCart(): Promise<CartLine[]> {
  return posDb.cart.toArray();
}

async function putCartLine(line: CartLine) {
  if (line.quantity <= 0) {
    await posDb.cart.delete(line.productId);
    return;
  }
  await posDb.cart.put({
    ...line,
    lineCents: line.quantity * line.unitCents,
  });
}

export async function addToCart(product: ProductDto) {
  const existing = await posDb.cart.get(product.id);
  const nextQty = (existing?.quantity ?? 0) + 1;
  await putCartLine({
    productId: product.id,
    name: product.name,
    quantity: nextQty,
    unitCents: product.priceCents,
    lineCents: nextQty * product.priceCents,
  });
}

export async function incrementCartLine(productId: string) {
  const line = await posDb.cart.get(productId);
  if (!line) return;
  await putCartLine({ ...line, quantity: line.quantity + 1 });
}

export async function decrementCartLine(productId: string) {
  const line = await posDb.cart.get(productId);
  if (!line) return;
  await putCartLine({ ...line, quantity: line.quantity - 1 });
}

export async function removeFromCart(productId: string) {
  await posDb.cart.delete(productId);
}

export async function clearCart() {
  await posDb.cart.clear();
}

export async function completeSale(localId: string, staff: StaffSession) {
  const cart = await getCart();
  if (cart.length === 0) return null;

  const totalCents = cart.reduce((sum, line) => sum + line.lineCents, 0);
  const soldAt = new Date().toISOString();
  const lines: SaleLineDto[] = cart.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCents: line.unitCents,
    lineCents: line.lineCents,
  }));

  await posDb.salesOutbox.put({
    localId,
    soldAt,
    totalCents,
    kind: "SALE",
    lines,
    syncStatus: "pending",
    createdAt: soldAt,
    staffId: staff.staffId,
    staffName: staff.staffName,
    voided: false,
  });

  for (const line of cart) {
    const product = await posDb.products.get(line.productId);
    if (product) {
      await posDb.products.put({
        ...product,
        stockQty: Math.max(product.stockQty - line.quantity, 0),
      });
    }
  }

  await clearCart();
  return { localId, soldAt, totalCents, kind: "SALE" as const, lines, staffId: staff.staffId, staffName: staff.staffName };
}

export async function completeReturn(localId: string, staff: StaffSession) {
  const cart = await getCart();
  if (cart.length === 0) return null;

  const totalCents = cart.reduce((sum, line) => sum + line.lineCents, 0);
  const soldAt = new Date().toISOString();
  const lines: SaleLineDto[] = cart.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCents: line.unitCents,
    lineCents: line.lineCents,
  }));

  await posDb.salesOutbox.put({
    localId,
    soldAt,
    totalCents,
    kind: "RETURN",
    lines,
    syncStatus: "pending",
    createdAt: soldAt,
    staffId: staff.staffId,
    staffName: staff.staffName,
    voided: false,
  });

  for (const line of cart) {
    const product = await posDb.products.get(line.productId);
    if (product) {
      await posDb.products.put({
        ...product,
        stockQty: product.stockQty + line.quantity,
      });
    }
  }

  await clearCart();
  return { localId, soldAt, totalCents, kind: "RETURN" as const, lines, staffId: staff.staffId, staffName: staff.staffName };
}

export async function getPendingSales() {
  const all = await posDb.salesOutbox.where("syncStatus").equals("pending").toArray();
  return all.filter((s) => !s.voided);
}

export async function markSaleSynced(localId: string, receiptNumber?: string) {
  const sale = await posDb.salesOutbox.get(localId);
  if (sale) {
    await posDb.salesOutbox.put({
      ...sale,
      syncStatus: "synced",
      ...(receiptNumber ? { receiptNumber } : {}),
    });
  }
}

export async function markSaleConflict(
  localId: string,
  conflictJson: string,
  receiptNumber?: string,
) {
  const sale = await posDb.salesOutbox.get(localId);
  if (sale) {
    await posDb.salesOutbox.put({
      ...sale,
      syncStatus: "conflict",
      conflictJson,
      ...(receiptNumber ? { receiptNumber } : {}),
    });
  }
}

export async function countPendingSales() {
  const all = await posDb.salesOutbox.where("syncStatus").equals("pending").toArray();
  return all.filter((s) => !s.voided).length;
}

export async function countConflictSales() {
  const all = await posDb.salesOutbox.where("syncStatus").equals("conflict").toArray();
  return all.filter((s) => !s.voided).length;
}

export async function getConflictSales() {
  const all = await posDb.salesOutbox.where("syncStatus").equals("conflict").toArray();
  return all.filter((s) => !s.voided);
}

export async function getLastVoidableSale(): Promise<SaleOutbox | null> {
  const sales = await posDb.salesOutbox.orderBy("soldAt").reverse().toArray();
  return sales.find((s) => !s.voided) ?? null;
}

async function restoreLocalStock(lines: SaleLineDto[]) {
  for (const line of lines) {
    const product = await posDb.products.get(line.productId);
    if (product) {
      await posDb.products.put({
        ...product,
        stockQty: product.stockQty + line.quantity,
      });
    }
  }
}

export async function voidSaleLocal(localId: string) {
  const sale = await posDb.salesOutbox.get(localId);
  if (!sale || sale.voided) return null;

  await posDb.salesOutbox.put({ ...sale, voided: true });

  const isReturn = sale.kind === "RETURN";
  for (const line of sale.lines) {
    const product = await posDb.products.get(line.productId);
    if (product) {
      await posDb.products.put({
        ...product,
        stockQty: isReturn
          ? Math.max(product.stockQty - line.quantity, 0)
          : product.stockQty + line.quantity,
      });
    }
  }

  return sale;
}
