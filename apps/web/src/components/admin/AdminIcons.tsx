import Link from "next/link";
import type { ReactNode } from "react";
import {
  Eye,
  LayoutDashboard,
  Monitor,
  Package,
  Pencil,
  Plus,
  Power,
  Receipt,
  BarChart3,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  products: Package,
  stock: Warehouse,
  sales: Receipt,
  reports: BarChart3,
  suppliers: Truck,
  staff: Users,
  users: UserCog,
  terminals: Monitor,
  pos: ShoppingCart,
};

export function AdminNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  const Icon = NAV_ICONS[icon] ?? LayoutDashboard;
  return (
    <Link href={href} className="admin-nav-link" title={label}>
      <Icon size={18} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

export function IconEditLink({ href, label = "Edit" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="icon-action" title={label} aria-label={label}>
      <Pencil size={16} strokeWidth={2} />
    </Link>
  );
}

export function IconViewLink({ href, label = "View" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="icon-action" title={label} aria-label={label}>
      <Eye size={16} strokeWidth={2} />
    </Link>
  );
}

export function IconToggleButton({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <button type="submit" className="icon-action" title={label} aria-label={label}>
      {children}
    </button>
  );
}

export function IconPower({ active }: { active: boolean }) {
  return (
    <Power
      size={16}
      strokeWidth={2}
      style={{ color: active ? "var(--danger)" : "var(--success)" }}
    />
  );
}

export function AddButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn btn-with-icon">
      <Plus size={16} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

export function IconEditButton({ href, label = "Edit" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="btn btn-secondary btn-with-icon btn-icon-only"
      title={label}
      aria-label={label}
    >
      <Pencil size={16} strokeWidth={2} />
    </Link>
  );
}
