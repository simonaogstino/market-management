import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";

export async function GET(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const suppliers = await prisma.supplier.findMany({
    where: { storeId: terminal.storeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({ suppliers });
}
