export const PERMISSION_GROUPS = [
  {
    label: "General",
    items: [
      { key: "dashboard", label: "View dashboard" },
      { key: "settings:view", label: "View store settings" },
      { key: "settings:manage", label: "Edit store settings" },
    ],
  },
  {
    label: "Products",
    items: [
      { key: "products:view", label: "View products" },
      { key: "products:manage", label: "Add & edit products" },
    ],
  },
  {
    label: "Stock",
    items: [
      { key: "stock:view", label: "View stock & movements" },
      { key: "stock:manage", label: "Receive & adjust stock" },
    ],
  },
  {
    label: "Sales",
    items: [{ key: "sales:view", label: "View sales history" }],
  },
  {
    label: "Reports",
    items: [{ key: "reports:view", label: "View reports" }],
  },
  {
    label: "POS",
    items: [
      { key: "terminals:view", label: "View POS terminals" },
      { key: "staff:view", label: "View POS staff" },
      { key: "staff:manage", label: "Manage POS staff & PINs" },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { key: "suppliers:view", label: "View suppliers & balances" },
      { key: "suppliers:manage", label: "Manage suppliers, deliveries & payments" },
    ],
  },
  {
    label: "Expenses",
    items: [
      { key: "expenses:view", label: "View expenses" },
      { key: "expenses:manage", label: "Add & edit expenses" },
    ],
  },
  {
    label: "Cash",
    items: [
      { key: "cash:view", label: "View cash sessions" },
      { key: "cash:manage", label: "Open, close & adjust cash drawers" },
      { key: "safe:view", label: "View safe / vault" },
      { key: "safe:manage", label: "Transfer to safe & bank deposits" },
    ],
  },
  {
    label: "Office users",
    items: [
      { key: "users:view", label: "View office users" },
      { key: "users:manage", label: "Create & edit office users" },
    ],
  },
] as const;

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key),
);

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** POS cashier privileges (stored on STAFF users via `permissions` JSON). */
export const POS_PERMISSION_GROUPS = [
  {
    label: "Sales",
    items: [
      { key: "pos:sell", label: "Complete sales" },
      { key: "pos:return", label: "Customer returns" },
      { key: "pos:discount", label: "Apply custom discount" },
      { key: "pos:owner_sale", label: "Owner / family at cost" },
      { key: "pos:void", label: "Void last sale (legacy)" },
    ],
  },
  {
    label: "Stock & suppliers",
    items: [
      { key: "pos:receive_stock", label: "Receive stock" },
      { key: "pos:supplier_return", label: "Return to supplier" },
    ],
  },
  {
    label: "Other",
    items: [
      { key: "pos:cash_session", label: "Open / close cash drawer" },
      { key: "pos:view_sync", label: "View sync & conflicts" },
    ],
  },
] as const;

export const ALL_POS_PERMISSIONS = POS_PERMISSION_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key),
);

export type PosPermission = (typeof ALL_POS_PERMISSIONS)[number];

/** Default for new cashiers: sell + customer return + cash drawer. */
export const DEFAULT_POS_PERMISSIONS: PosPermission[] = [
  "pos:sell",
  "pos:return",
  "pos:cash_session",
];

export function parsePermissions(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((p) => ALL_PERMISSIONS.includes(p)) : [];
  } catch {
    return [];
  }
}

export function parsePosPermissions(json: string | null | undefined): PosPermission[] {
  if (!json) return [...DEFAULT_POS_PERMISSIONS];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [...DEFAULT_POS_PERMISSIONS];
    const filtered = parsed.filter((p): p is PosPermission =>
      (ALL_POS_PERMISSIONS as readonly string[]).includes(p),
    );
    return filtered.length > 0 ? filtered : [...DEFAULT_POS_PERMISSIONS];
  } catch {
    return [...DEFAULT_POS_PERMISSIONS];
  }
}

export function hasPermission(
  role: string,
  permissions: string[],
  required: Permission,
): boolean {
  if (role === "ADMIN") return true;
  if (role === "OFFICE") return permissions.includes(required);
  return false;
}

export function hasPosPermission(
  role: string,
  permissions: string[],
  required: PosPermission,
): boolean {
  if (role === "ADMIN") return true;
  return permissions.includes(required);
}

export const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: string;
  permission: Permission;
}> = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", permission: "dashboard" },
  { href: "/admin/products", label: "Products", icon: "products", permission: "products:view" },
  { href: "/admin/stock", label: "Stock", icon: "stock", permission: "stock:view" },
  { href: "/admin/sales", label: "Sales", icon: "sales", permission: "sales:view" },
  { href: "/admin/reports", label: "Reports", icon: "reports", permission: "reports:view" },
  { href: "/admin/suppliers", label: "Suppliers", icon: "suppliers", permission: "suppliers:view" },
  { href: "/admin/expenses", label: "Expenses", icon: "expenses", permission: "expenses:view" },
  { href: "/admin/cash", label: "Cash", icon: "cash", permission: "cash:view" },
  { href: "/admin/safe", label: "Safe", icon: "safe", permission: "safe:view" },
  { href: "/admin/staff", label: "POS Staff", icon: "staff", permission: "staff:view" },
  { href: "/admin/users", label: "Office Users", icon: "users", permission: "users:view" },
  { href: "/admin/terminals", label: "POS Terminals", icon: "terminals", permission: "terminals:view" },
  { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings:view" },
];

export function getDefaultAdminPath(role: string, permissions: string[]): string {
  if (role === "ADMIN") return "/admin";
  const item = NAV_ITEMS.find((nav) => hasPermission(role, permissions, nav.permission));
  return item?.href ?? "/admin/unauthorized";
}
