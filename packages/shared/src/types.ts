export type Role = "ADMIN" | "STAFF" | "VENDOR" | "CUSTOMER";

export type SaleStatus = "PENDING_SYNC" | "SYNCED" | "CONFLICT" | "VOIDED";

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  costCents: number;
  priceCents: number;
  supplierId: string | null;
  categoryId: string | null;
  stockQty: number;
  version: number;
  isActive: boolean;
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
  kind?: "SALE" | "RETURN";
  lines: SaleLineDto[];
  staffId?: string;
  staffName?: string;
}

export interface StaffLoginResponse {
  staffId: string;
  staffName: string;
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
}

export interface SyncPushRequest {
  sales: SalePushDto[];
}

export interface SyncPushResult {
  localId: string;
  status: "synced" | "conflict";
  serverSaleId?: string;
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
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  LBP: "L.L.",
  AED: "د.إ",
  SAR: "﷼",
};

export function formatMoney(cents: number, currency = "USD") {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}
