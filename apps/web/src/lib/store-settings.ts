import { prisma } from "@/lib/db";
import { formatMoney as formatMoneyShared } from "@market/shared";

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
};

export const CURRENCY_OPTIONS = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "LBP", label: "Lebanese Pound (L.L.)" },
  { code: "AED", label: "UAE Dirham (د.إ)" },
  { code: "SAR", label: "Saudi Riyal (﷼)" },
] as const;

export const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern (US)" },
  { value: "America/Chicago", label: "Central (US)" },
  { value: "America/Denver", label: "Mountain (US)" },
  { value: "America/Los_Angeles", label: "Pacific (US)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris / Central Europe" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Riyadh", label: "Riyadh" },
  { value: "Asia/Beirut", label: "Beirut" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
] as const;

export function formatMoney(cents: number, currency = "USD") {
  return formatMoneyShared(cents, currency);
}

export function formatStoreMoney(cents: number, settings: Pick<StoreSettings, "currency">) {
  return formatMoney(cents, settings.currency);
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
    currency: store.currency,
    lowStockThreshold: store.lowStockThreshold,
    receiptHeader: store.receiptHeader,
    receiptFooter: store.receiptFooter,
    timezone: store.timezone,
  };
}

export function receiptTitle(settings: StoreSettings) {
  return settings.receiptHeader?.trim() || settings.name;
}
