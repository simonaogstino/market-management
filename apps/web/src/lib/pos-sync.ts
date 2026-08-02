import type {
  PosSyncStatusResponse,
  StaffLoginResponse,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from "@market/shared";
import {
  getConflictSales,
  getPendingSales,
  getTerminalConfig,
  markSaleConflict,
  markSaleSynced,
  setLastSyncAt,
  upsertProducts,
  voidSaleLocal,
  getLastVoidableSale,
  saveStoreSettings,
} from "./pos-db";

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

async function apiFetch(path: string, init?: RequestInit) {
  const config = await getTerminalConfig();
  if (!config) throw new Error("Terminal not configured");

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-terminal-key": config.apiKey,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `API error ${response.status}`);
  }
  return response;
}

export async function loginStaff(pin: string): Promise<StaffLoginResponse> {
  const response = await apiFetch("/api/pos/staff/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
  return response.json();
}

export async function pullCatalog(): Promise<SyncPullResponse | null> {
  if (!isOnline()) return null;
  try {
    const response = await apiFetch("/api/sync/pull");
    const data = (await response.json()) as SyncPullResponse;
    await upsertProducts(data.products);
    await saveStoreSettings(data.store);
    await setLastSyncAt(data.serverTime);
    return data;
  } catch {
    return null;
  }
}

export async function pushPendingSales() {
  if (!isOnline()) return 0;

  const pending = await getPendingSales();
  if (pending.length === 0) return 0;

  const body: SyncPushRequest = {
    sales: pending.map((sale) => ({
      localId: sale.localId,
      soldAt: sale.soldAt,
      totalCents: sale.totalCents,
      kind: sale.kind ?? "SALE",
      discountPercent: sale.discountPercent,
      paymentMethod: sale.paymentMethod ?? "CASH",
      lines: sale.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitCents: line.unitCents,
        lineCents: line.lineCents,
      })),
      staffId: sale.staffId,
      staffName: sale.staffName,
    })),
  };

  try {
    const response = await apiFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as SyncPushResponse;

    for (const result of data.results) {
      if (result.status === "synced") {
        await markSaleSynced(result.localId, result.receiptNumber);
      } else {
        await markSaleConflict(
          result.localId,
          JSON.stringify(result.conflicts ?? []),
          result.receiptNumber,
        );
      }
    }

    await setLastSyncAt(data.serverTime);
    await pullCatalog();
    return data.results.length;
  } catch {
    return 0;
  }
}

export async function runSyncCycle() {
  const pushed = await pushPendingSales();
  const pulled = await pullCatalog();
  return { pushed, pulled: Boolean(pulled) };
}

export async function fetchServerSyncStatus(): Promise<PosSyncStatusResponse | null> {
  if (!isOnline()) return null;
  try {
    const response = await apiFetch("/api/pos/sync-status");
    return response.json();
  } catch {
    return null;
  }
}

export async function getLocalSyncSummary() {
  const [pending, conflicts, lastSyncAt] = await Promise.all([
    getPendingSales(),
    getConflictSales(),
    import("./pos-db").then((m) => m.getLastSyncAt()),
  ]);

  return {
    lastSyncAt,
    pendingCount: pending.length,
    conflictCount: conflicts.length,
    localConflicts: conflicts.map((s) => ({
      localId: s.localId,
      soldAt: s.soldAt,
      totalCents: s.totalCents,
      messages: s.conflictJson
        ? (JSON.parse(s.conflictJson) as Array<{ message: string }>).map((m) => m.message)
        : [],
    })),
  };
}

export async function voidLastSale(staffId: string) {
  const last = await getLastVoidableSale();
  if (!last) throw new Error("No sale to void.");

  const latest = await getLastVoidableSale();
  if (!latest || latest.localId !== last.localId) {
    throw new Error("Only the most recent sale can be voided.");
  }

  if (last.syncStatus === "synced" || last.syncStatus === "conflict") {
    if (!isOnline()) throw new Error("Go online to void a synced sale.");
    await apiFetch("/api/pos/sales/void", {
      method: "POST",
      body: JSON.stringify({ localId: last.localId, staffId }),
    });
    await pullCatalog();
  }

  await voidSaleLocal(last.localId);
  return last;
}

export async function receiveStock(params: {
  staffId: string;
  sku: string;
  quantity: number;
  note?: string;
  receiptFile?: File | null;
}) {
  if (!isOnline()) {
    throw new Error("Internet required to receive stock.");
  }

  const config = await getTerminalConfig();
  if (!config) throw new Error("Terminal not configured");

  const form = new FormData();
  form.append("staffId", params.staffId);
  form.append("sku", params.sku);
  form.append("quantity", String(params.quantity));
  if (params.note) form.append("note", params.note);
  if (params.receiptFile) form.append("receipt", params.receiptFile);

  const response = await fetch("/api/pos/stock/receive", {
    method: "POST",
    headers: {
      "x-terminal-key": config.apiKey,
    },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `API error ${response.status}`);
  }

  await pullCatalog();
  return data as {
    success: boolean;
    productName: string;
    newStockQty: number;
    movementId?: string;
    hasAttachment?: boolean;
    attachmentWarning?: string;
  };
}

export async function createPosProduct(params: {
  staffId: string;
  sku: string;
  name: string;
  cost: number;
  price: number;
  supplierId: string;
}) {
  if (!isOnline()) {
    throw new Error("Internet required to add a new product.");
  }

  const response = await apiFetch("/api/pos/products", {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await response.json();
  await pullCatalog();
  return data as {
    success: boolean;
    product: {
      id: string;
      sku: string;
      name: string;
      stockQty: number;
      supplierId: string | null;
      costCents: number;
      priceCents: number;
    };
  };
}

export type SupplierReturnReceiptDto = {
  success: boolean;
  id: string;
  totalCostCents: number;
  returnedAt: string;
  referenceNumber: string | null;
  note: string | null;
  supplierId: string;
  supplierName: string;
  staffName?: string;
  lines: Array<{
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCostCents: number;
    lineCostCents: number;
  }>;
};

export async function supplierReturnStock(params: {
  staffId: string;
  supplierId: string;
  lines: Array<{ productId: string; quantity: number }>;
  reference?: string;
  note?: string;
}): Promise<SupplierReturnReceiptDto> {
  if (!isOnline()) {
    throw new Error("Internet required to return stock to supplier.");
  }

  const response = await apiFetch("/api/pos/supplier-return", {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as SupplierReturnReceiptDto;
  await pullCatalog();
  return data;
}
