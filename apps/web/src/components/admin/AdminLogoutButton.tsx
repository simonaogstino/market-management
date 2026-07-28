"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function AdminLogoutButton() {
  return (
    <button
      type="button"
      className="admin-logout-btn"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut size={16} strokeWidth={2} aria-hidden />
      Log out
    </button>
  );
}
