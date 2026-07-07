import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ALL_PERMISSIONS, hasPermission, type Permission } from "@/lib/permissions";

export async function getAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (session.user.role !== "ADMIN" && session.user.role !== "OFFICE") return null;
  return session;
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function requireAdminRole() {
  const session = await requireAdminSession();
  if (session.user.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireAdminSession();
  if (!hasPermission(session.user.role, session.user.permissions, permission)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requirePageAccess(permission: Permission) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.user.role, session.user.permissions, permission)) {
    redirect("/admin/unauthorized");
  }
  return session;
}

export function getEffectivePermissions(role: string, permissions: string[]) {
  return role === "ADMIN" ? [...ALL_PERMISSIONS] : permissions;
}
