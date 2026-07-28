import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { authenticateTerminal, unauthorized } from "@/lib/sync";
import type { StaffLoginResponse } from "@market/shared";
import { ALL_POS_PERMISSIONS, parsePosPermissions } from "@/lib/permissions";

export async function POST(request: Request) {
  const terminal = await authenticateTerminal(request);
  if (!terminal) return unauthorized();

  const body = await request.json();
  const pin = String(body.pin ?? "").trim();

  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 6 digits." }, { status: 400 });
  }

  const staffUsers = await prisma.user.findMany({
    where: {
      storeId: terminal.storeId,
      role: { in: ["STAFF", "ADMIN"] },
      isActive: true,
      pinHash: { not: null },
    },
  });

  for (const user of staffUsers) {
    if (user.pinHash && (await compare(pin, user.pinHash))) {
      const permissions =
        user.role === "ADMIN"
          ? [...ALL_POS_PERMISSIONS]
          : parsePosPermissions(user.permissions);

      const response: StaffLoginResponse = {
        staffId: user.id,
        staffName: user.name,
        permissions,
      };
      return NextResponse.json(response);
    }
  }

  return NextResponse.json({ error: "Invalid PIN." }, { status: 401 });
}
