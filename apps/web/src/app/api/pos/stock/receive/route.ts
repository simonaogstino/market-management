import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, receiveStockForTerminal, unauthorized } from "@/lib/sync";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = await request.json();
  const staffId = String(body.staffId ?? "").trim();
  const quantity = parseInt(String(body.quantity ?? "0"), 10);
  const note = String(body.note ?? "").trim() || null;
  let productId = String(body.productId ?? "").trim();
  const sku = String(body.sku ?? "").trim();

  if (!staffId) {
    return NextResponse.json({ error: "staffId is required." }, { status: 400 });
  }

  if (!productId && sku) {
    const product = await prisma.product.findFirst({
      where: { storeId: terminal.storeId, sku, isActive: true },
    });
    if (!product) {
      return NextResponse.json({ error: `Product not found: ${sku}` }, { status: 404 });
    }
    productId = product.id;
  }

  if (!productId) {
    return NextResponse.json({ error: "Product is required." }, { status: 400 });
  }

  const result = await receiveStockForTerminal(
    terminal.storeId,
    staffId,
    productId,
    quantity,
    note,
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
