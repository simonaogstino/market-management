import { NextResponse } from "next/server";
import { authenticateTerminal, unauthorized, voidTerminalSale } from "@/lib/sync";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = await request.json();
  const localId = String(body.localId ?? "").trim();
  if (!localId) {
    return NextResponse.json({ error: "localId is required." }, { status: 400 });
  }

  const result = await voidTerminalSale(terminal.id, terminal.storeId, localId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
