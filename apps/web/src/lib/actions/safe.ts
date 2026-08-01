"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/admin-session";
import { parseDollarsToCents } from "@/lib/cash";
import {
  recordSafeAdjustment,
  recordSafeBankDeposit,
  transferTerminalCashToSafe,
} from "@/lib/safe-server";

function safePaths(cashSessionId?: string) {
  revalidatePath("/admin/safe");
  revalidatePath("/admin/cash");
  if (cashSessionId) revalidatePath(`/admin/cash/${cashSessionId}`);
}

export async function transferToSafeAction(formData: FormData) {
  const session = await requirePermission("safe:manage");
  const cashSessionId = String(formData.get("cashSessionId") ?? "").trim();
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!cashSessionId) return { error: "Select a cash drawer." };
  if (amountCents === null || amountCents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const result = await transferTerminalCashToSafe({
    storeId: session.user.storeId,
    cashSessionId,
    amountCents,
    note,
    recordedById: session.user.id,
  });

  if ("error" in result) return { error: result.error };

  safePaths(result.sessionId);
  return { success: true };
}

export async function bankDepositFromSafeAction(formData: FormData) {
  const session = await requirePermission("safe:manage");
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (amountCents === null || amountCents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const result = await recordSafeBankDeposit({
    storeId: session.user.storeId,
    amountCents,
    reference,
    note,
    recordedById: session.user.id,
  });

  if ("error" in result) return { error: result.error };

  safePaths();
  return { success: true };
}

export async function adjustSafeAction(formData: FormData) {
  const session = await requirePermission("safe:manage");
  const direction = String(formData.get("direction") ?? "").trim();
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (direction !== "in" && direction !== "out") {
    return { error: "Invalid adjustment direction." };
  }
  if (amountCents === null || amountCents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const result = await recordSafeAdjustment({
    storeId: session.user.storeId,
    direction,
    amountCents,
    note,
    recordedById: session.user.id,
  });

  if ("error" in result) return { error: result.error };

  safePaths();
  return { success: true };
}
