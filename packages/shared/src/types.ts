export type Role = "ADMIN" | "STAFF" | "VENDOR" | "CUSTOMER";

export type SaleStatus = "PENDING_SYNC" | "SYNCED" | "CONFLICT" | "VOIDED";

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  costCents: number;
  priceCents: number;
  appPriceCents: number;
  /** Promo unit price while discountQtyLeft > 0; null when inactive. */
  discountPriceCents: number | null;
  /** Remaining units sold at the promo price. */
  discountQtyLeft: number;
  supplierId: string | null;
  categoryId: string | null;
  stockQty: number;
  version: number;
  isActive: boolean;
  showOnPos: boolean;
  showOnApps: boolean;
  updatedAt: string;
}

export interface CategoryDto {
  id: string;
  name: string;
}

export interface SaleLineDto {
  productId: string;
  quantity: number;
  unitCents: number;
  lineCents: number;
}

export interface SalePushDto {
  localId: string;
  soldAt: string;
  totalCents: number;
  kind?: "SALE" | "RETURN" | "OWNER";
  /** Cart-level discount percent applied to list prices (SALE only). */
  discountPercent?: number;
  paymentMethod?: "CASH" | "CARD" | "TRANSFER";
  lines: SaleLineDto[];
  staffId?: string;
  staffName?: string;
}

export interface StaffLoginResponse {
  staffId: string;
  staffName: string;
  permissions: string[];
}

export interface PosSyncStatusResponse {
  serverTime: string;
  lastSyncAt: string | null;
  pendingCount: number;
  conflictCount: number;
  conflicts: Array<{
    localId: string;
    soldAt: string;
    totalCents: number;
    messages: string[];
  }>;
}

export interface SyncPullResponse {
  serverTime: string;
  products: ProductDto[];
  categories: CategoryDto[];
  store: StoreSettingsDto;
}

export interface StoreSettingsDto {
  name: string;
  address: string | null;
  phone: string | null;
  currency: string;
  lowStockThreshold: number;
  receiptHeader: string | null;
  receiptFooter: string | null;
  timezone: string;
  receiptPrefix: string;
  receiptNextNumber: number;
  /** Max % POS may discount (0 = no discounts). */
  maxDiscountPercent: number;
}

/** Apply a percent-off to a list price in cents (integer-safe). */
export function discountedUnitCents(listCents: number, percent: number) {
  const p = Math.max(0, Math.min(100, percent));
  if (p <= 0) return listCents;
  return Math.round((listCents * (100 - p)) / 100);
}

export function hasActiveProductDiscount(p: {
  discountPriceCents?: number | null;
  discountQtyLeft?: number;
}) {
  return (
    p.discountPriceCents != null &&
    p.discountPriceCents >= 0 &&
    (p.discountQtyLeft ?? 0) > 0
  );
}

/** POS sale unit price: promo while qty remains, otherwise list price. */
export function effectivePosPriceCents(p: {
  priceCents: number;
  discountPriceCents?: number | null;
  discountQtyLeft?: number;
}) {
  if (hasActiveProductDiscount(p)) return p.discountPriceCents!;
  return p.priceCents;
}

export interface SyncPushRequest {
  sales: SalePushDto[];
}

export interface SyncPushResult {
  localId: string;
  status: "synced" | "conflict";
  serverSaleId?: string;
  receiptNumber?: string;
  conflicts?: Array<{ productId: string; message: string }>;
}

export interface SyncPushResponse {
  serverTime: string;
  results: SyncPushResult[];
}

export interface TerminalConfig {
  terminalId: string;
  terminalName: string;
  apiKey: string;
  apiBaseUrl: string;
}

export const SYNC_INTERVAL_MS = 30_000;

const CURRENCY_SYMBOLS: Record<string, string> = {
  IQD: "د.ع",
};

/** App currency is fixed to Iraqi Dinar. */
export const APP_CURRENCY = "IQD" as const;

export function formatMoney(cents: number, _currency: string = APP_CURRENCY) {
  const amount = cents / 100;
  // IQD is displayed as whole dinars (no fractional fils in everyday use).
  const formatted = Math.round(amount).toLocaleString("en-IQ");
  return `${CURRENCY_SYMBOLS.IQD} ${formatted}`;
}
