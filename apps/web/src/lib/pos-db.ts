import Dexie, { type Table } from "dexie";
import type { ProductDto, SaleLineDto, StoreSettingsDto } from "@market/shared";
import { discountedUnitCents, effectivePosPriceCents, hasActiveProductDiscount } from "@market/shared";

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
  kind: "SALE" | "RETURN" | "OWNER";
  discountPercent?: number;
  /** Pre-discount subtotal when a cart discount was applied. */
  subtotalCents?: number;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER";
  lines: Array<SaleLineDto & { productName?: string }>;
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
  permissions: string[];
}

export interface CompletedSale {
  localId: string;
  soldAt: string;
  totalCents: number;
  kind?: "SALE" | "RETURN" | "OWNER";
  discountPercent?: number;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER";
  /** Pre-discount subtotal when a discount was applied. */
  subtotalCents?: number;
  /** Cash received from customer (sale cash tender). */
  tenderCents?: number;
  /** Change returned to customer. */
  changeCents?: number;
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
    this.version(4).stores({
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
    const parsed = JSON.parse(raw) as Partial<StoreSettingsDto>;
    return {
      name: parsed.name ?? "Store",
      address: parsed.address ?? null,
      phone: parsed.phone ?? null,
      currency: parsed.currency ?? "IQD",
      lowStockThreshold: parsed.lowStockThreshold ?? 10,
      receiptHeader: parsed.receiptHeader ?? null,
      receiptFooter: parsed.receiptFooter ?? null,
      timezone: parsed.timezone ?? "UTC",
      receiptPrefix: parsed.receiptPrefix ?? "RCP-",
      receiptNextNumber: parsed.receiptNextNumber ?? 1,
      maxDiscountPercent: parsed.maxDiscountPercent ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const staffId = await getSetting("staffId");
  const staffName = await getSetting("staffName");
  if (!staffId || !staffName) return null;
  const rawPerms = await getSetting("staffPermissions");
  let permissions: string[] = [];
  if (rawPerms) {
    try {
      const parsed = JSON.parse(rawPerms);
      if (Array.isArray(parsed)) permissions = parsed.filter((p) => typeof p === "string");
    } catch {
      permissions = [];
    }
  }
  return { staffId, staffName, permissions };
}

export async function saveStaffSession(session: StaffSession) {
  await setSetting("staffId", session.staffId);
  await setSetting("staffName", session.staffName);
  await setSetting("staffPermissions", JSON.stringify(session.permissions ?? []));
}

export async function clearStaffSession() {
  await posDb.settings.delete("staffId");
  await posDb.settings.delete("staffName");
  await posDb.settings.delete("staffPermissions");
}

export async function getLastSyncAt() {
  return getSetting("lastSyncAt");
}

export async function setLastSyncAt(iso: string) {
  await setSetting("lastSyncAt", iso);
}

export async function upsertProducts(products: ProductDto[]) {
  await posDb.products.bulkPut(
    products.map((p) => ({
      ...p,
      discountPriceCents: p.discountPriceCents ?? null,
      discountQtyLeft: p.discountQtyLeft ?? 0,
    })),
  );
}

export async function listProducts() {
  return posDb.products.filter((p) => p.isActive).toArray();
}

/** Products shown in the POS sale grid / barcode search. */
export async function listPosCatalogProducts() {
  return posDb.products
    .filter((p) => p.isActive && p.showOnPos !== false)
    .toArray();
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

export async function addToCart(product: ProductDto, unitCents?: number, addQty = 1) {
  const qty = Math.max(1, Math.floor(addQty));
  const existing = await posDb.cart.get(product.id);
  const price = unitCents ?? effectivePosPriceCents(product);
  const unit = existing ? existing.unitCents : price;
  const nextQty = (existing?.quantity ?? 0) + qty;
  await putCartLine({
    productId: product.id,
    name: product.name,
    quantity: nextQty,
    unitCents: unit,
    lineCents: nextQty * unit,
  });
}

/** Reprice entire cart to sale price or cost price (owner mode). */
export async function repriceCart(mode: "sale" | "return" | "owner", discountPercent = 0) {
  const cart = await getCart();
  for (const line of cart) {
    const product = await posDb.products.get(line.productId);
    if (!product) continue;
    const listOrCost =
      mode === "owner" ? product.costCents : effectivePosPriceCents(product);
    const unitCents =
      mode === "sale" && discountPercent > 0
        ? discountedUnitCents(effectivePosPriceCents(product), discountPercent)
        : listOrCost;
    await putCartLine({
      ...line,
      unitCents,
      lineCents: line.quantity * unitCents,
    });
  }
}

/** Apply (or clear) a cart-level % discount using current list prices. Sale mode only. */
export async function applyCartDiscount(discountPercent: number) {
  await repriceCart("sale", discountPercent);
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

export async function setCartLineQuantity(productId: string, quantity: number) {
  const line = await posDb.cart.get(productId);
  if (!line) return;
  const qty = Math.floor(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    await posDb.cart.delete(productId);
    return;
  }
  await putCartLine({
    ...line,
    quantity: qty,
    lineCents: qty * line.unitCents,
  });
}

export async function removeFromCart(productId: string) {
  await posDb.cart.delete(productId);
}

export async function clearCart() {
  await posDb.cart.clear();
}

export async function completeSale(
  localId: string,
  staff: StaffSession,
  kind: "SALE" | "OWNER" = "SALE",
  discountPercent = 0,
  paymentMethod: "CASH" | "CARD" | "TRANSFER" = "CASH",
) {
  const cart = await getCart();
  if (cart.length === 0) return null;

  const totalCents = cart.reduce((sum, line) => sum + line.lineCents, 0);
  const soldAt = new Date().toISOString();
  const lines: Array<SaleLineDto & { productName?: string }> = cart.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCents: line.unitCents,
    lineCents: line.lineCents,
    productName: line.name,
  }));

  let subtotalCents: number | undefined;
  if (kind === "SALE" && discountPercent > 0) {
    let sub = 0;
    for (const line of cart) {
      const product = await posDb.products.get(line.productId);
      sub += line.quantity * (product ? effectivePosPriceCents(product) : line.unitCents);
    }
    subtotalCents = sub;
  }

  const method = kind === "OWNER" ? "CASH" : paymentMethod;

  await posDb.salesOutbox.put({
    localId,
    soldAt,
    totalCents,
    kind,
    discountPercent: kind === "SALE" && discountPercent > 0 ? discountPercent : undefined,
    subtotalCents,
    paymentMethod: method,
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
      let discountQtyLeft = product.discountQtyLeft ?? 0;
      let discountPriceCents = product.discountPriceCents ?? null;
      if (kind === "SALE" && hasActiveProductDiscount(product)) {
        const used = Math.min(line.quantity, discountQtyLeft);
        discountQtyLeft = discountQtyLeft - used;
        if (discountQtyLeft <= 0) {
          discountQtyLeft = 0;
          discountPriceCents = null;
        }
      }
      await posDb.products.put({
        ...product,
        stockQty: Math.max(product.stockQty - line.quantity, 0),
        discountQtyLeft,
        discountPriceCents,
      });
    }
  }

  await clearCart();
  return {
    localId,
    soldAt,
    totalCents,
    kind,
    discountPercent: kind === "SALE" && discountPercent > 0 ? discountPercent : undefined,
    paymentMethod: method,
    subtotalCents,
    lines,
    staffId: staff.staffId,
    staffName: staff.staffName,
  };
}

export async function completeReturn(
  localId: string,
  staff: StaffSession,
  paymentMethod: "CASH" | "CARD" | "TRANSFER" = "CASH",
) {
  const cart = await getCart();
  if (cart.length === 0) return null;

  const totalCents = cart.reduce((sum, line) => sum + line.lineCents, 0);
  const soldAt = new Date().toISOString();
  const lines: Array<SaleLineDto & { productName?: string }> = cart.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCents: line.unitCents,
    lineCents: line.lineCents,
    productName: line.name,
  }));

  await posDb.salesOutbox.put({
    localId,
    soldAt,
    totalCents,
    kind: "RETURN",
    paymentMethod,
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
  return {
    localId,
    soldAt,
    totalCents,
    kind: "RETURN" as const,
    paymentMethod,
    lines,
    staffId: staff.staffId,
    staffName: staff.staffName,
  };
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
  // soldAt is not an IndexedDB index. Sort in memory so this works with all
  // existing POS database versions without requiring a destructive reset.
  const sales = await posDb.salesOutbox.toArray();
  sales.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
  return sales.find((s) => !s.voided) ?? null;
}

function dayKeyInTimezone(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Non-voided sales from this terminal for the current local store day. */
export async function getTodaysSales(timezone = "UTC"): Promise<SaleOutbox[]> {
  const today = dayKeyInTimezone(new Date().toISOString(), timezone);
  const sales = await posDb.salesOutbox.toArray();
  return sales
    .filter((s) => !s.voided && dayKeyInTimezone(s.soldAt, timezone) === today)
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export async function toCompletedSale(sale: SaleOutbox): Promise<CompletedSale> {
  const lines = await Promise.all(
    sale.lines.map(async (line) => {
      const productName =
        line.productName ??
        (await posDb.products.get(line.productId))?.name ??
        "Item";
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitCents: line.unitCents,
        lineCents: line.lineCents,
        productName,
      };
    }),
  );

  return {
    localId: sale.localId,
    soldAt: sale.soldAt,
    totalCents: sale.totalCents,
    kind: sale.kind,
    discountPercent: sale.discountPercent,
    paymentMethod: sale.paymentMethod,
    subtotalCents: sale.subtotalCents,
    lines,
    staffId: sale.staffId,
    staffName: sale.staffName,
    receiptNumber: sale.receiptNumber ?? null,
  };
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
