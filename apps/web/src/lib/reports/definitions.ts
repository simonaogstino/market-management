export type ReportCategory = "Sales" | "Profit" | "Inventory" | "Suppliers" | "Operations";

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  needsDateRange: boolean;
  extraParams?: Array<{ key: string; label: string; type: "number"; default: number }>;
};

export const REPORTS: ReportDefinition[] = [
  {
    id: "sales-summary",
    title: "Sales summary",
    description: "Revenue, transaction counts, returns, and daily breakdown.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "top-products",
    title: "Top products",
    description: "Best-selling products by quantity and revenue.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "sales-by-terminal",
    title: "Sales by terminal",
    description: "Revenue and transaction count per POS terminal.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "sales-by-cashier",
    title: "Sales by cashier",
    description: "Staff performance — sales and returns per cashier.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "sales-by-category",
    title: "Sales by category",
    description: "Revenue breakdown by product category.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "hourly-sales",
    title: "Hourly sales",
    description: "Sales volume by hour of day for staffing decisions.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "returns-voids",
    title: "Returns & voids",
    description: "Customer returns and voided transactions audit trail.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "period-comparison",
    title: "Period comparison",
    description: "Compare selected period vs the previous period of equal length.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "daily-close",
    title: "Daily close",
    description: "End-of-day summary for printing or saving as PDF.",
    category: "Sales",
    needsDateRange: true,
  },
  {
    id: "gross-profit",
    title: "Gross profit",
    description: "Revenue vs cost of goods sold with margin analysis.",
    category: "Profit",
    needsDateRange: true,
  },
  {
    id: "low-stock",
    title: "Low stock",
    description: "Products at or below reorder threshold.",
    category: "Inventory",
    needsDateRange: false,
    extraParams: [{ key: "threshold", label: "Stock threshold", type: "number", default: 10 }],
  },
  {
    id: "stock-valuation",
    title: "Stock valuation",
    description: "Inventory on hand valued at purchase cost.",
    category: "Inventory",
    needsDateRange: false,
  },
  {
    id: "dead-stock",
    title: "Dead stock",
    description: "Products with stock but no recent sales.",
    category: "Inventory",
    needsDateRange: false,
    extraParams: [{ key: "days", label: "Days without sales", type: "number", default: 30 }],
  },
  {
    id: "stock-adjustments",
    title: "Stock adjustments",
    description: "Manual stock adjustments and shrinkage log.",
    category: "Inventory",
    needsDateRange: true,
  },
  {
    id: "supplier-balances",
    title: "Supplier balances",
    description: "Amount owed to each supplier.",
    category: "Suppliers",
    needsDateRange: false,
  },
  {
    id: "supplier-history",
    title: "Supplier purchases & payments",
    description: "Deliveries, returns, and payments in date range.",
    category: "Suppliers",
    needsDateRange: true,
  },
  {
    id: "staff-stock-receipts",
    title: "Stock received by staff",
    description: "Who received stock via deliveries or POS receive.",
    category: "Operations",
    needsDateRange: true,
  },
  {
    id: "sync-operations",
    title: "POS sync & conflicts",
    description: "Pending sync sales, open conflicts, and terminal status.",
    category: "Operations",
    needsDateRange: false,
  },
];

export function getReportById(id: string) {
  return REPORTS.find((r) => r.id === id);
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  "Sales",
  "Profit",
  "Inventory",
  "Suppliers",
  "Operations",
];
