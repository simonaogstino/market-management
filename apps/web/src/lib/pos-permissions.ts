import { prisma } from "@/lib/db";
import {
  hasPosPermission,
  parsePosPermissions,
  type PosPermission,
} from "@/lib/permissions";

export async function requirePosStaffPermission(
  storeId: string,
  staffId: string,
  permission: PosPermission,
) {
  const staff = await prisma.user.findFirst({
    where: {
      id: staffId,
      storeId,
      role: { in: ["STAFF", "ADMIN"] },
      isActive: true,
    },
  });

  if (!staff) {
    return { error: "Invalid staff." as const };
  }

  const permissions =
    staff.role === "ADMIN"
      ? []
      : parsePosPermissions(staff.permissions);

  if (!hasPosPermission(staff.role, permissions, permission)) {
    return { error: "You do not have permission for this action." as const };
  }

  return { staff };
}
