import { prisma } from "@/lib/db";
import { APP_CURRENCY, type StoreSettings } from "@/lib/store-settings-shared";

export type {
  StoreSettings,
} from "@/lib/store-settings-shared";

export {
  APP_CURRENCY,
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  formatMoney,
  formatStoreMoney,
  formatInTimezone,
  receiptTitle,
} from "@/lib/store-settings-shared";

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
