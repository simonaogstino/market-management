import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveReceiveReceiptFile } from "@/lib/receive-uploads";
import { authenticateTerminal, receiveStockForTerminal, unauthorized } from "@/lib/sync";
import { requirePosStaffPermission } from "@/lib/pos-permissions";

export const runtime = "nodejs";

async function parseReceiveRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const receipt = form.get("receipt");
    return {
      staffId: String(form.get("staffId") ?? "").trim(),
      quantity: parseInt(String(form.get("quantity") ?? "0"), 10),
      note: String(form.get("note") ?? "").trim() || null,
      productId: String(form.get("productId") ?? "").trim(),
      sku: String(form.get("sku") ?? "").trim(),
      receiptFile: receipt instanceof File && receipt.size > 0 ? receipt : null,
    };
  }

  const body = (await request.json()) as {
    staffId?: string;
    quantity?: number | string;
    note?: string;
    productId?: string;
    sku?: string;
  };
  return {
    staffId: String(body.staffId ?? "").trim(),
    quantity: parseInt(String(body.quantity ?? "0"), 10),
    note: String(body.note ?? "").trim() || null,
    productId: String(body.productId ?? "").trim(),
    sku: String(body.sku ?? "").trim(),
    receiptFile: null as File | null,
  };
}

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const parsed = await parseReceiveRequest(request);
  let { productId } = parsed;
  const { staffId, quantity, note, sku, receiptFile } = parsed;

  if (!staffId) {
    return NextResponse.json({ error: "staffId is required." }, { status: 400 });
  }

  const auth = await requirePosStaffPermission(terminal.storeId, staffId, "pos:receive_stock");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
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

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let hasAttachment = false;
  if (receiptFile && result.movementId) {
    const saved = await saveReceiveReceiptFile({
      storeId: terminal.storeId,
      movementId: result.movementId,
      file: receiptFile,
    });
    if (!saved.ok) {
      return NextResponse.json(
        {
          ...result,
          hasAttachment: false,
          attachmentWarning: saved.error,
        },
        { status: 200 },
      );
    }
    await prisma.stockMovement.update({
      where: { id: result.movementId },
      data: {
        attachmentPath: saved.path,
        attachmentName: saved.name,
        attachmentMime: saved.mime,
      },
    });
    hasAttachment = true;
  }

  return NextResponse.json({ ...result, hasAttachment });
}
