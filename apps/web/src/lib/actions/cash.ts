"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/admin-session";
import { parseDollarsToCents } from "@/lib/cash";
import { computeExpectedCashCents } from "@/lib/cash-server";

function cashPaths(sessionId?: string) {
  revalidatePath("/admin/cash");
  if (sessionId) revalidatePath(`/admin/cash/${sessionId}`);
}

export async function openCashSessionAdmin(formData: FormData) {
  const session = await requirePermission("cash:manage");
  const terminalId = String(formData.get("terminalId") ?? "").trim();
  const openingCents = parseDollarsToCents(String(formData.get("openingAmount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!terminalId) return { error: "Select a terminal." };
  if (openingCents === null || openingCents < 0) {
    return { error: "Opening float must be zero or greater." };
  }

  const terminal = await prisma.terminal.findFirst({
    where: { id: terminalId, storeId: session.user.storeId, isActive: true },
  });
  if (!terminal) return { error: "Terminal not found." };

  const existing = await prisma.cashSession.findFirst({
    where: { terminalId, status: "OPEN" },
  });
  if (existing) return { error: "This terminal already has an open cash session." };

  const cashSession = await prisma.cashSession.create({
    data: {
      storeId: session.user.storeId,
      terminalId,
      openingCents,
      note,
      openedById: session.user.id,
    },
  });

  cashPaths(cashSession.id);
  return { success: true, sessionId: cashSession.id };
}

export async function closeCashSessionAdmin(sessionId: string, formData: FormData) {
  const session = await requirePermission("cash:manage");
  const countedCents = parseDollarsToCents(String(formData.get("countedAmount") ?? ""));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (countedCents === null || countedCents < 0) {
    return { error: "Counted cash must be zero or greater." };
  }

  const cashSession = await prisma.cashSession.findFirst({
    where: { id: sessionId, storeId: session.user.storeId, status: "OPEN" },
  });
  if (!cashSession) return { error: "Open cash session not found." };

  const closedAt = new Date();
  const summary = await computeExpectedCashCents({
    terminalId: cashSession.terminalId,
    openingCents: cashSession.openingCents,
    openedAt: cashSession.openedAt,
    closedAt,
    sessionId: cashSession.id,
  });

  await prisma.cashSession.update({
    where: { id: cashSession.id },
    data: {
      status: "CLOSED",
      closedAt,
      expectedCents: summary.expectedCents,
      countedCents,
      varianceCents: countedCents - summary.expectedCents,
      closedById: session.user.id,
      note: note ?? cashSession.note,
    },
  });

  cashPaths(sessionId);
  return { success: true };
}

export async function addCashMovementAdmin(sessionId: string, formData: FormData) {
  const session = await requirePermission("cash:manage");
  const type = String(formData.get("type") ?? "").trim();
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (type !== "PAY_IN" && type !== "PAY_OUT") {
    return { error: "Invalid movement type." };
  }
  if (amountCents === null || amountCents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const cashSession = await prisma.cashSession.findFirst({
    where: { id: sessionId, storeId: session.user.storeId, status: "OPEN" },
  });
  if (!cashSession) return { error: "Open cash session not found." };

  await prisma.cashMovement.create({
    data: {
      sessionId,
      type,
      amountCents,
      reason,
      recordedById: session.user.id,
    },
  });

  cashPaths(sessionId);
  return { success: true };
}
