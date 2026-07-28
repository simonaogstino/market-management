import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";
import { processSupplierReturn } from "@/lib/supplier-returns";
import { requirePosStaffPermission } from "@/lib/pos-permissions";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = (await request.json()) as {
    staffId?: string;
    supplierId?: string;
    lines?: Array<{ productId: string; quantity: number }>;
    reference?: string;
    note?: string;
  };

  if (!body.staffId || !body.supplierId || !body.lines?.length) {
    return NextResponse.json({ error: "Staff, supplier, and lines are required." }, { status: 400 });
  }

  const auth = await requirePosStaffPermission(
    terminal.storeId,
    body.staffId,
    "pos:supplier_return",
  );
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const staff = auth.staff;

  const productLines = [];
  for (const line of body.lines) {
    if (!line.productId || !line.quantity || line.quantity <= 0) continue;
    const product = await prisma.product.findFirst({
      where: { id: line.productId, storeId: terminal.storeId },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found." }, { status: 400 });
    }
    productLines.push({
      productId: line.productId,
      quantity: line.quantity,
      unitCostCents: product.costCents,
    });
  }

  if (productLines.length === 0) {
    return NextResponse.json({ error: "No valid return lines." }, { status: 400 });
  }

  const result = await processSupplierReturn({
    storeId: terminal.storeId,
    supplierId: body.supplierId,
    lines: productLines,
    referenceNumber: body.reference ?? null,
    note: body.note ?? null,
    recordedById: staff.id,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, totalCostCents: result.totalCostCents });
}
