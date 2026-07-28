import { NextResponse } from "next/server";
import { authenticateTerminal, unauthorized, voidTerminalSale } from "@/lib/sync";
import { requirePosStaffPermission } from "@/lib/pos-permissions";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = await request.json();
  const localId = String(body.localId ?? "").trim();
  const staffId = String(body.staffId ?? "").trim();

  if (!localId) {
    return NextResponse.json({ error: "localId is required." }, { status: 400 });
  }
  if (!staffId) {
    return NextResponse.json({ error: "staffId is required." }, { status: 400 });
  }

  const auth = await requirePosStaffPermission(terminal.storeId, staffId, "pos:void");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const result = await voidTerminalSale(terminal.id, terminal.storeId, localId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
