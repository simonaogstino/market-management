import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";
import { parseDollarsToCents } from "@/lib/cash";
import { requirePosStaffPermission } from "@/lib/pos-permissions";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = (await request.json()) as {
    staffId?: string;
    type?: string;
    amount?: string | number;
    reason?: string;
  };

  const staffId = String(body.staffId ?? "").trim();
  if (!staffId) {
    return NextResponse.json({ error: "Staff is required." }, { status: 400 });
  }

  const perm = await requirePosStaffPermission(terminal.storeId, staffId, "pos:cash_session");
  if ("error" in perm) {
    return NextResponse.json({ error: perm.error }, { status: 403 });
  }

  const type = String(body.type ?? "").trim();
  if (type !== "PAY_IN" && type !== "PAY_OUT") {
    return NextResponse.json({ error: "Invalid type." }, { status: 400 });
  }

  const amountCents = parseDollarsToCents(String(body.amount ?? ""));
  if (amountCents === null || amountCents <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
  }

  const cashSession = await prisma.cashSession.findFirst({
    where: { terminalId: terminal.id, status: "OPEN" },
  });
  if (!cashSession) {
    return NextResponse.json({ error: "Open the cash drawer first." }, { status: 404 });
  }

  const movement = await prisma.cashMovement.create({
    data: {
      sessionId: cashSession.id,
      type,
      amountCents,
      reason: body.reason?.trim() || null,
      recordedById: staffId,
    },
  });

  return NextResponse.json({
    movement: {
      id: movement.id,
      type: movement.type,
      amountCents: movement.amountCents,
    },
  });
}
