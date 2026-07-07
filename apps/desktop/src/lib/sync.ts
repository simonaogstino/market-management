import type { SyncPullResponse, SyncPushRequest, SyncPushResponse } from "@market/shared";
import {
  getPendingSales,
  getTerminalConfig,
  markSaleConflict,
  markSaleSynced,
  saveTerminalConfig,
  upsertProducts,
} from "./db";

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

async function apiFetch(path: string, init?: RequestInit) {
  const config = await getTerminalConfig();
  if (!config) throw new Error("Terminal not configured");

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-terminal-key": config.apiKey,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  return response;
}

export async function verifyTerminal() {
  const response = await apiFetch("/api/terminals/me");
  const data = await response.json();
  await saveTerminalConfig({
    apiBaseUrl: (await getTerminalConfig())!.apiBaseUrl,
    apiKey: (await getTerminalConfig())!.apiKey,
    terminalId: data.terminalId,
    terminalName: data.terminalName,
  });
  return data;
}

export async function pullCatalog(): Promise<SyncPullResponse | null> {
  if (!isOnline()) return null;

  try {
    const response = await apiFetch("/api/sync/pull");
    const data = (await response.json()) as SyncPullResponse;
    await upsertProducts(data.products);
    return data;
  } catch {
    return null;
  }
}

export async function pushPendingSales(): Promise<number> {
  if (!isOnline()) return 0;

  const pending = await getPendingSales();
  if (pending.length === 0) return 0;

  const body: SyncPushRequest = {
    sales: pending.map((sale) => ({
      localId: sale.local_id,
      soldAt: sale.sold_at,
      totalCents: sale.total_cents,
      lines: JSON.parse(sale.lines_json),
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
        await markSaleSynced(result.localId);
      } else {
        await markSaleConflict(result.localId, JSON.stringify(result.conflicts ?? []));
      }
    }

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
