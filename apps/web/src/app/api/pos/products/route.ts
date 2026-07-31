import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";
import { requirePosStaffPermission } from "@/lib/pos-permissions";

/** Create a new product from POS during stock receive (terminal auth). */
export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = await request.json();
  const staffId = String(body.staffId ?? "").trim();
  const sku = String(body.sku ?? "").trim();
  const name = String(body.name ?? "").trim();
  const supplierId = String(body.supplierId ?? "").trim();
  const costDollars = parseFloat(String(body.cost ?? "0"));
  const priceDollars = parseFloat(String(body.price ?? "0"));

  if (!staffId) {
    return NextResponse.json({ error: "staffId is required." }, { status: 400 });
  }

  const auth = await requirePosStaffPermission(
    terminal.storeId,
    staffId,
    "pos:receive_stock",
  );
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  if (!sku || !name) {
    return NextResponse.json({ error: "SKU and name are required." }, { status: 400 });
  }
  if (!supplierId) {
    return NextResponse.json({ error: "Select the supplier for this new product." }, { status: 400 });
  }
  if (Number.isNaN(costDollars) || costDollars < 0) {
    return NextResponse.json({ error: "Enter a valid cost." }, { status: 400 });
  }
  if (Number.isNaN(priceDollars) || priceDollars < 0) {
    return NextResponse.json({ error: "Enter a valid sale price." }, { status: 400 });
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId: terminal.storeId, isActive: true },
  });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found." }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({
    where: { storeId_sku: { storeId: terminal.storeId, sku } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `SKU "${sku}" already exists.` },
      { status: 409 },
    );
  }

  const costCents = Math.round(costDollars * 100);
  const priceCents = Math.round(priceDollars * 100);

  const product = await prisma.product.create({
    data: {
      sku,
      name,
      costCents,
      priceCents,
      appPriceCents: priceCents,
      stockQty: 0,
      supplierId,
      showOnPos: true,
      showOnApps: false,
      storeId: terminal.storeId,
      isActive: true,
    },
  });

  return NextResponse.json({
    success: true,
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      stockQty: product.stockQty,
      supplierId: product.supplierId,
      costCents: product.costCents,
      priceCents: product.priceCents,
    },
  });
}
