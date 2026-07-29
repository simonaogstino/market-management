import { prisma } from "@/lib/db";
import { formatMoney as formatMoneyShared, APP_CURRENCY } from "@market/shared";

export type StoreSettings = {
  id: string;
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
  maxDiscountPercent: number;
};

export const CURRENCY_OPTIONS = [
  { code: "IQD", label: "Iraqi Dinar (د.ع)" },
] as const;

export { APP_CURRENCY };

export const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Baghdad", label: "Baghdad (Iraq)" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Riyadh", label: "Riyadh" },
  { value: "Asia/Beirut", label: "Beirut" },
  { value: "Europe/London", label: "London" },
  { value: "America/New_York", label: "Eastern (US)" },
] as const;

export function formatMoney(cents: number, currency = APP_CURRENCY) {
  return formatMoneyShared(cents, currency);
}

export function formatStoreMoney(cents: number, _settings?: Pick<StoreSettings, "currency">) {
  return formatMoney(cents, APP_CURRENCY);
}

export function formatInTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    ...options,
  }).format(date);
}

export async function getStoreSettings(storeId: string): Promise<StoreSettings> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  return {
    id: store.id,
    name: store.name,
    address: store.address,
    phone: store.phone,
    currency: APP_CURRENCY,
    lowStockThreshold: store.lowStockThreshold,
    receiptHeader: store.receiptHeader,
    receiptFooter: store.receiptFooter,
    timezone: store.timezone,
    receiptPrefix: store.receiptPrefix,
    receiptNextNumber: store.receiptNextNumber,
    maxDiscountPercent: store.maxDiscountPercent,
  };
}

export function receiptTitle(settings: StoreSettings) {
  return settings.receiptHeader?.trim() || settings.name;
}
