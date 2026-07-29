import { formatMoney } from "@/lib/suppliers";
import type { CsvExport } from "./ReportActions";
import {
  ChangeBadge,
  ReportTable,
  StatCard,
  StatGrid,
} from "./ReportParts";
import {
  ReportBarChart,
  ReportGroupedBarChart,
  ReportLineChart,
  ReportPieChart,
  topN,
} from "./ReportCharts";
import {
  getDailyClose,
  getDeadStock,
  getGrossProfit,
  getHourlySales,
  getLowStock,
  getPeriodComparison,
  getReturnsAndVoids,
  getSalesByCashier,
  getSalesByCategory,
  getSalesByTerminal,
  getSalesSummary,
  getStaffStockReceipts,
  getStockAdjustments,
  getStockValuation,
  getSupplierBalances,
  getSupplierHistory,
  getSyncOperations,
  getTopProducts,
} from "@/lib/reports/queries";
import type { DateRange } from "@/lib/reports/date-range";
import { formatDateInput } from "@/lib/reports/date-range";

function fmt(n: number) {
  return formatMoney(n);
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

export async function renderReport(
  reportId: string,
  range: DateRange,
  params: Record<string, number>,
): Promise<{ content: React.ReactNode; csv?: CsvExport }> {
  switch (reportId) {
    case "sales-summary": {
      const data = await getSalesSummary(range);
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Net revenue (retail)" value={fmt(data.netCents)} />
              <StatCard label="Gross sales" value={fmt(data.grossCents)} />
              <StatCard label="Returns" value={fmt(data.returnsCents)} highlight={data.returnsCents > 0} />
              <StatCard
                label="Owner / family at cost"
                value={fmt(data.ownerCents)}
                sub={`${data.ownerCount} txn`}
              />
              <StatCard label="Retail transactions" value={String(data.saleCount)} sub={`${data.returnCount} returns`} />
              <StatCard label="Voided" value={String(data.voidedCount)} highlight={data.voidedCount > 0} />
            </StatGrid>
            {data.daily.length > 0 && (
              <ReportLineChart
                title="Daily trend"
                data={data.daily.map((d) => ({
                  name: d.date,
                  sales: d.sales,
                  returns: d.returns,
                  net: d.net,
                }))}
                series={[
                  { key: "sales", label: "Sales", color: "#2563eb" },
                  { key: "returns", label: "Returns", color: "#ea580c" },
                  { key: "net", label: "Net", color: "#16a34a" },
                ]}
              />
            )}
            <h2 className="report-section-title">Daily breakdown</h2>
            <ReportTable
              headers={["Date", "Sales", "Returns", "Owner / family", "Net (retail)"]}
              rows={data.daily.map((d) => [
                d.date,
                fmt(d.sales),
                d.returns > 0 ? `−${fmt(d.returns)}` : fmt(0),
                fmt(d.owner),
                fmt(d.net),
              ])}
            />
          </>
        ),
        csv: {
          filename: "sales-summary.csv",
          headers: ["Date", "Sales", "Returns", "Owner family", "Net retail"],
          rows: data.daily.map((d) => [
            d.date,
            (d.sales / 100).toFixed(2),
            (d.returns / 100).toFixed(2),
            (d.owner / 100).toFixed(2),
            (d.net / 100).toFixed(2),
          ]),
        },
      };
    }

    case "top-products": {
      const data = await getTopProducts(range);
      return {
        content: (
          <>
            <ReportBarChart
              title="Top products by revenue"
              layout="horizontal"
              data={topN(
                data.map((p) => ({ name: p.name, value: p.revenueCents })),
                15,
              )}
            />
            <ReportTable
              headers={["SKU", "Product", "Qty sold", "Revenue"]}
              rows={data.map((p) => [p.sku, p.name, String(p.quantity), fmt(p.revenueCents)])}
            />
          </>
        ),
        csv: {
          filename: "top-products.csv",
          headers: ["SKU", "Product", "Quantity", "Revenue"],
          rows: data.map((p) => [p.sku, p.name, String(p.quantity), (p.revenueCents / 100).toFixed(2)]),
        },
      };
    }

    case "sales-by-terminal": {
      const data = await getSalesByTerminal(range);
      return {
        content: (
          <>
            <ReportBarChart
              title="Net revenue by terminal"
              data={data.map((t) => ({ name: t.name, value: t.netCents }))}
            />
            <ReportTable
              headers={["Terminal", "Transactions", "Net revenue"]}
              rows={data.map((t) => [t.name, String(t.count), fmt(t.netCents)])}
            />
          </>
        ),
        csv: {
          filename: "sales-by-terminal.csv",
          headers: ["Terminal", "Transactions", "Net revenue"],
          rows: data.map((t) => [t.name, String(t.count), (t.netCents / 100).toFixed(2)]),
        },
      };
    }

    case "sales-by-cashier": {
      const data = await getSalesByCashier(range);
      return {
        content: (
          <>
            <ReportBarChart
              title="Net revenue by cashier"
              data={data.map((c) => ({ name: c.name, value: c.netCents }))}
            />
            <ReportTable
              headers={["Cashier", "Transactions", "Net revenue"]}
              rows={data.map((c) => [c.name, String(c.count), fmt(c.netCents)])}
            />
          </>
        ),
        csv: {
          filename: "sales-by-cashier.csv",
          headers: ["Cashier", "Transactions", "Net revenue"],
          rows: data.map((c) => [c.name, String(c.count), (c.netCents / 100).toFixed(2)]),
        },
      };
    }

    case "sales-by-category": {
      const data = await getSalesByCategory(range);
      return {
        content: (
          <>
            <ReportPieChart
              title="Revenue by category"
              data={data.map((c) => ({ name: c.name, value: c.revenueCents }))}
            />
            <ReportTable
              headers={["Category", "Qty sold", "Revenue"]}
              rows={data.map((c) => [c.name, String(c.quantity), fmt(c.revenueCents)])}
            />
          </>
        ),
        csv: {
          filename: "sales-by-category.csv",
          headers: ["Category", "Quantity", "Revenue"],
          rows: data.map((c) => [c.name, String(c.quantity), (c.revenueCents / 100).toFixed(2)]),
        },
      };
    }

    case "hourly-sales": {
      const { hours } = await getHourlySales(range);
      return {
        content: (
          <>
            <ReportBarChart
              title="Net revenue by hour"
              data={hours.map((h) => ({ name: h.label, value: h.netCents }))}
            />
            <ReportTable
              headers={["Hour", "Transactions", "Net revenue"]}
              rows={hours.map((h) => [h.label, String(h.count), fmt(h.netCents)])}
            />
          </>
        ),
        csv: {
          filename: "hourly-sales.csv",
          headers: ["Hour", "Transactions", "Net revenue"],
          rows: hours.map((h) => [h.label, String(h.count), (h.netCents / 100).toFixed(2)]),
        },
      };
    }

    case "returns-voids": {
      const data = await getReturnsAndVoids(range);
      const byType = new Map<string, number>();
      const byDay = new Map<string, number>();
      for (const s of data) {
        const typeKey = s.kind === "RETURN" ? "Return" : "Void";
        byType.set(typeKey, (byType.get(typeKey) ?? 0) + s.totalCents);
        const day = s.soldAt.toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + s.totalCents);
      }
      return {
        content: (
          <>
            {byType.size > 0 && (
              <ReportPieChart
                title="Amount by type"
                data={[...byType.entries()].map(([name, value]) => ({ name, value }))}
              />
            )}
            {byDay.size > 1 && (
              <ReportBarChart
                title="Amount by day"
                data={[...byDay.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([name, value]) => ({ name, value }))}
              />
            )}
            <ReportTable
              headers={["Date", "Type", "Terminal", "Staff", "Items", "Amount", "Status"]}
              rows={data.map((s) => [
                s.soldAt.toLocaleString(),
                s.kind === "RETURN" ? "Return" : "Void",
                s.terminal.name,
                s.staff?.name ?? "—",
                s.lines.map((l) => `${l.quantity}× ${l.product.name}`).join(", "),
                fmt(s.totalCents),
                s.status,
              ])}
            />
          </>
        ),
        csv: {
          filename: "returns-voids.csv",
          headers: ["Date", "Type", "Terminal", "Staff", "Amount", "Status"],
          rows: data.map((s) => [
            s.soldAt.toISOString(),
            s.kind === "RETURN" ? "Return" : "Void",
            s.terminal.name,
            s.staff?.name ?? "",
            (s.totalCents / 100).toFixed(2),
            s.status,
          ]),
        },
      };
    }

    case "period-comparison": {
      const data = await getPeriodComparison(range);
      return {
        content: (
          <>
            <p className="report-range-note">
              Current: {formatDateInput(range.from)} – {formatDateInput(range.to)} · Previous:{" "}
              {formatDateInput(data.previousRange.from)} – {formatDateInput(data.previousRange.to)}
            </p>
            <StatGrid>
              <StatCard
                label="Net revenue"
                value={fmt(data.current.netCents)}
                sub={`was ${fmt(data.previous.netCents)}`}
              />
              <StatCard label="Change" value={pct(data.changes.netCents)} />
              <StatCard
                label="Transactions"
                value={String(data.current.saleCount)}
                sub={`was ${data.previous.saleCount}`}
              />
              <StatCard label="Txn change" value={pct(data.changes.saleCount)} />
              <StatCard
                label="Returns"
                value={String(data.current.returnCount)}
                sub={`was ${data.previous.returnCount}`}
              />
              <StatCard label="Return change" value={<ChangeBadge pct={data.changes.returnCount} />} />
            </StatGrid>
            <ReportGroupedBarChart
              title="Current vs previous"
              data={[
                {
                  name: "Net revenue",
                  current: data.current.netCents,
                  previous: data.previous.netCents,
                },
                {
                  name: "Gross sales",
                  current: data.current.grossCents,
                  previous: data.previous.grossCents,
                },
                {
                  name: "Returns",
                  current: data.current.returnsCents,
                  previous: data.previous.returnsCents,
                },
              ]}
              series={[
                { key: "current", label: "Current", color: "#2563eb" },
                { key: "previous", label: "Previous", color: "#94a3b8" },
              ]}
            />
            <h2 className="report-section-title">Side by side</h2>
            <ReportTable
              headers={["Metric", "Current", "Previous", "Change"]}
              rows={[
                ["Net revenue", fmt(data.current.netCents), fmt(data.previous.netCents), <ChangeBadge key="n" pct={data.changes.netCents} />],
                ["Gross sales", fmt(data.current.grossCents), fmt(data.previous.grossCents), "—"],
                ["Returns", fmt(data.current.returnsCents), fmt(data.previous.returnsCents), "—"],
                ["Transactions", String(data.current.saleCount), String(data.previous.saleCount), <ChangeBadge key="t" pct={data.changes.saleCount} />],
              ]}
            />
          </>
        ),
        csv: {
          filename: "period-comparison.csv",
          headers: ["Metric", "Current", "Previous"],
          rows: [
            ["Net revenue", (data.current.netCents / 100).toFixed(2), (data.previous.netCents / 100).toFixed(2)],
            ["Gross sales", (data.current.grossCents / 100).toFixed(2), (data.previous.grossCents / 100).toFixed(2)],
            ["Returns", (data.current.returnsCents / 100).toFixed(2), (data.previous.returnsCents / 100).toFixed(2)],
            ["Transactions", String(data.current.saleCount), String(data.previous.saleCount)],
          ],
        },
      };
    }

    case "daily-close": {
      const data = await getDailyClose(range);
      return {
        content: (
          <>
            <div className="card report-daily-close-banner">
              <h2 style={{ margin: 0 }}>Daily close — {formatDateInput(range.from)}</h2>
              <p style={{ margin: "0.5rem 0 0", fontSize: "1.75rem", fontWeight: 700 }}>
                Net retail revenue: {fmt(data.summary.netCents)}
              </p>
              {data.summary.ownerCents > 0 && (
                <p style={{ margin: "0.35rem 0 0", color: "var(--muted)" }}>
                  Owner / family at cost: {fmt(data.summary.ownerCents)} ({data.summary.ownerCount} txn)
                </p>
              )}
            </div>
            <StatGrid>
              <StatCard label="Retail transactions" value={String(data.summary.saleCount)} />
              <StatCard label="Returns" value={String(data.summary.returnCount)} />
              <StatCard label="Gross sales" value={fmt(data.summary.grossCents)} />
              <StatCard label="Owner / family" value={fmt(data.summary.ownerCents)} />
              <StatCard label="Voided" value={String(data.summary.voidedCount)} />
            </StatGrid>
            {data.topProducts.length > 0 && (
              <ReportBarChart
                title="Top products"
                layout="horizontal"
                data={topN(
                  data.topProducts.map((p) => ({ name: p.name, value: p.revenueCents })),
                  15,
                )}
              />
            )}
            <h2 className="report-section-title">Top products</h2>
            <ReportTable
              headers={["Product", "Qty", "Revenue"]}
              rows={data.topProducts.map((p) => [p.name, String(p.quantity), fmt(p.revenueCents)])}
            />
            {data.byCashier.length > 0 && (
              <ReportBarChart
                title="By cashier"
                data={data.byCashier.map((c) => ({ name: c.name, value: c.netCents }))}
              />
            )}
            <h2 className="report-section-title">By cashier</h2>
            <ReportTable
              headers={["Cashier", "Transactions", "Net"]}
              rows={data.byCashier.map((c) => [c.name, String(c.count), fmt(c.netCents)])}
            />
            {data.byTerminal.length > 0 && (
              <ReportBarChart
                title="By terminal"
                data={data.byTerminal.map((t) => ({ name: t.name, value: t.netCents }))}
              />
            )}
            <h2 className="report-section-title">By terminal</h2>
            <ReportTable
              headers={["Terminal", "Transactions", "Net"]}
              rows={data.byTerminal.map((t) => [t.name, String(t.count), fmt(t.netCents)])}
            />
            <div className="card report-email-note no-print">
              <strong>Scheduled email</strong>
              <p style={{ margin: "0.5rem 0 0", color: "var(--muted)" }}>
                Automatic daily email reports require SMTP configuration. Use Print / PDF above to save
                this daily close summary for your records.
              </p>
            </div>
          </>
        ),
        csv: {
          filename: `daily-close-${formatDateInput(range.from)}.csv`,
          headers: ["Section", "Label", "Value"],
          rows: [
            ["Summary", "Net revenue", (data.summary.netCents / 100).toFixed(2)],
            ["Summary", "Transactions", String(data.summary.saleCount)],
            ["Summary", "Returns", String(data.summary.returnCount)],
            ...data.topProducts.map((p) => ["Top product", p.name, (p.revenueCents / 100).toFixed(2)]),
          ],
        },
      };
    }

    case "gross-profit": {
      const data = await getGrossProfit(range);
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Revenue" value={fmt(data.revenueCents)} />
              <StatCard label="Cost of goods" value={fmt(data.costCents)} />
              <StatCard label="Gross profit" value={fmt(data.profitCents)} highlight={data.profitCents < 0} />
              <StatCard label="Margin" value={pct(data.marginPct)} />
            </StatGrid>
            <ReportBarChart
              title="Profit by product"
              layout="horizontal"
              data={topN(
                [...data.byProduct]
                  .sort((a, b) => b.profitCents - a.profitCents)
                  .map((p) => ({ name: p.name, value: p.profitCents })),
                15,
              )}
              color="#16a34a"
            />
            <h2 className="report-section-title">Profit by product</h2>
            <ReportTable
              headers={["SKU", "Product", "Qty", "Revenue", "Cost", "Profit", "Margin"]}
              rows={data.byProduct.map((p) => [
                p.sku,
                p.name,
                String(p.quantity),
                fmt(p.revenueCents),
                fmt(p.costCents),
                fmt(p.profitCents),
                pct(p.marginPct),
              ])}
            />
          </>
        ),
        csv: {
          filename: "gross-profit.csv",
          headers: ["SKU", "Product", "Qty", "Revenue", "Cost", "Profit", "Margin %"],
          rows: data.byProduct.map((p) => [
            p.sku,
            p.name,
            String(p.quantity),
            (p.revenueCents / 100).toFixed(2),
            (p.costCents / 100).toFixed(2),
            (p.profitCents / 100).toFixed(2),
            p.marginPct.toFixed(1),
          ]),
        },
      };
    }

    case "low-stock": {
      const threshold = params.threshold ?? 10;
      const data = await getLowStock(threshold);
      return {
        content: (
          <>
            <p className="report-range-note">Products with stock ≤ {threshold}</p>
            <ReportBarChart
              title="Low stock levels"
              layout="horizontal"
              valueMode="number"
              color="#ea580c"
              data={topN(
                [...data]
                  .sort((a, b) => a.stockQty - b.stockQty)
                  .map((p) => ({ name: p.name, value: p.stockQty })),
                20,
              )}
            />
            <ReportTable
              headers={["SKU", "Product", "Category", "Supplier", "Stock"]}
              rows={data.map((p) => [
                p.sku,
                p.name,
                p.category?.name ?? "—",
                p.supplier?.name ?? "—",
                <span key={p.id} className="badge badge-warning">{p.stockQty}</span>,
              ])}
            />
          </>
        ),
        csv: {
          filename: "low-stock.csv",
          headers: ["SKU", "Product", "Category", "Supplier", "Stock"],
          rows: data.map((p) => [
            p.sku,
            p.name,
            p.category?.name ?? "",
            p.supplier?.name ?? "",
            String(p.stockQty),
          ]),
        },
      };
    }

    case "stock-valuation": {
      const data = await getStockValuation();
      const byCategory = new Map<string, number>();
      for (const r of data.rows) {
        const cat = r.category || "Uncategorized";
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + r.valueCents);
      }
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Products in stock" value={String(data.productCount)} />
              <StatCard label="Total valuation (at cost)" value={fmt(data.totalValueCents)} />
            </StatGrid>
            <ReportBarChart
              title="Top products by inventory value"
              layout="horizontal"
              data={topN(
                [...data.rows]
                  .sort((a, b) => b.valueCents - a.valueCents)
                  .map((r) => ({ name: r.name, value: r.valueCents })),
                15,
              )}
            />
            {byCategory.size > 0 && (
              <ReportPieChart
                title="Value by category"
                data={[...byCategory.entries()].map(([name, value]) => ({ name, value }))}
              />
            )}
            <ReportTable
              headers={["SKU", "Product", "Category", "Supplier", "Qty", "Unit cost", "Value"]}
              rows={data.rows.map((r) => [
                r.sku,
                r.name,
                r.category,
                r.supplier,
                String(r.stockQty),
                fmt(r.costCents),
                fmt(r.valueCents),
              ])}
            />
          </>
        ),
        csv: {
          filename: "stock-valuation.csv",
          headers: ["SKU", "Product", "Category", "Supplier", "Qty", "Unit cost", "Value"],
          rows: data.rows.map((r) => [
            r.sku,
            r.name,
            r.category,
            r.supplier,
            String(r.stockQty),
            (r.costCents / 100).toFixed(2),
            (r.valueCents / 100).toFixed(2),
          ]),
        },
      };
    }

    case "dead-stock": {
      const days = params.days ?? 30;
      const data = await getDeadStock(days);
      return {
        content: (
          <>
            <p className="report-range-note">Active products with stock but no sales in the last {days} days</p>
            <ReportBarChart
              title="Dead stock value at cost"
              layout="horizontal"
              color="#ca8a04"
              data={topN(
                [...data]
                  .sort((a, b) => b.valueCents - a.valueCents)
                  .map((p) => ({ name: p.name, value: p.valueCents })),
                15,
              )}
            />
            <ReportTable
              headers={["SKU", "Product", "Category", "Stock", "Value at cost"]}
              rows={data.map((p) => [p.sku, p.name, p.category, String(p.stockQty), fmt(p.valueCents)])}
            />
          </>
        ),
        csv: {
          filename: "dead-stock.csv",
          headers: ["SKU", "Product", "Category", "Stock", "Value"],
          rows: data.map((p) => [
            p.sku,
            p.name,
            p.category,
            String(p.stockQty),
            (p.valueCents / 100).toFixed(2),
          ]),
        },
      };
    }

    case "stock-adjustments": {
      const data = await getStockAdjustments(range);
      const byProduct = new Map<string, number>();
      for (const m of data) {
        const name = m.product.name;
        byProduct.set(name, (byProduct.get(name) ?? 0) + Math.abs(m.quantity));
      }
      const productPoints = [...byProduct.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }));
      return {
        content: (
          <>
            {productPoints.length > 0 && (
              <ReportBarChart
                title="Absolute qty change by product"
                layout="horizontal"
                valueMode="number"
                data={topN(productPoints, 15)}
              />
            )}
            <ReportTable
              headers={["Date", "Product", "Qty change", "Note", "By"]}
              rows={data.map((m) => [
                m.createdAt.toLocaleString(),
                m.product.name,
                <span key={m.id} className={m.quantity < 0 ? "badge badge-danger" : "badge badge-success"}>
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity}
                </span>,
                m.note ?? "—",
                m.user?.name ?? "—",
              ])}
            />
          </>
        ),
        csv: {
          filename: "stock-adjustments.csv",
          headers: ["Date", "Product", "Qty change", "Note", "By"],
          rows: data.map((m) => [
            m.createdAt.toISOString(),
            m.product.name,
            String(m.quantity),
            m.note ?? "",
            m.user?.name ?? "",
          ]),
        },
      };
    }

    case "supplier-balances": {
      const data = await getSupplierBalances();
      const totalOwed = data.reduce((s, r) => s + r.remainingToPayCents, 0);
      const owed = data
        .filter((s) => s.remainingToPayCents > 0)
        .sort((a, b) => b.remainingToPayCents - a.remainingToPayCents);
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Suppliers" value={String(data.length)} />
              <StatCard label="Total owed" value={fmt(totalOwed)} highlight={totalOwed > 0} />
            </StatGrid>
            {owed.length > 0 && (
              <ReportBarChart
                title="Amount owed by supplier"
                layout="horizontal"
                color="#ea580c"
                data={owed.map((s) => ({ name: s.name, value: s.remainingToPayCents }))}
              />
            )}
            <ReportTable
              headers={["Supplier", "Delivered", "Returned", "Paid", "Owed", "Credit"]}
              rows={data.map((s) => [
                s.name,
                fmt(s.totalDelivered),
                fmt(s.totalReturned),
                fmt(s.totalPaid),
                s.remainingToPayCents > 0 ? fmt(s.remainingToPayCents) : "—",
                s.prepaidCreditCents > 0 ? fmt(s.prepaidCreditCents) : "—",
              ])}
            />
          </>
        ),
        csv: {
          filename: "supplier-balances.csv",
          headers: ["Supplier", "Delivered", "Returned", "Paid", "Owed", "Credit"],
          rows: data.map((s) => [
            s.name,
            (s.totalDelivered / 100).toFixed(2),
            (s.totalReturned / 100).toFixed(2),
            (s.totalPaid / 100).toFixed(2),
            (s.remainingToPayCents / 100).toFixed(2),
            (s.prepaidCreditCents / 100).toFixed(2),
          ]),
        },
      };
    }

    case "supplier-history": {
      const data = await getSupplierHistory(range);
      const byDay = new Map<string, { deliveries: number; returns: number; payments: number }>();
      for (const d of data.deliveries) {
        const day = d.deliveredAt.toISOString().slice(0, 10);
        const row = byDay.get(day) ?? { deliveries: 0, returns: 0, payments: 0 };
        row.deliveries += d.totalCostCents;
        byDay.set(day, row);
      }
      for (const r of data.returns) {
        const day = r.returnedAt.toISOString().slice(0, 10);
        const row = byDay.get(day) ?? { deliveries: 0, returns: 0, payments: 0 };
        row.returns += r.totalCostCents;
        byDay.set(day, row);
      }
      for (const p of data.payments) {
        const day = p.paidAt.toISOString().slice(0, 10);
        const row = byDay.get(day) ?? { deliveries: 0, returns: 0, payments: 0 };
        row.payments += p.amountCents;
        byDay.set(day, row);
      }
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Deliveries" value={fmt(data.totalDelivered)} />
              <StatCard label="Returns" value={fmt(data.totalReturned)} />
              <StatCard label="Payments" value={fmt(data.totalPaid)} />
              <StatCard label="Credits" value={fmt(data.totalCredits)} />
            </StatGrid>
            <ReportGroupedBarChart
              title="Period totals"
              data={[
                {
                  name: "Totals",
                  delivered: data.totalDelivered,
                  returned: data.totalReturned,
                  paid: data.totalPaid,
                  credits: data.totalCredits,
                },
              ]}
              series={[
                { key: "delivered", label: "Deliveries", color: "#2563eb" },
                { key: "returned", label: "Returns", color: "#ea580c" },
                { key: "paid", label: "Payments", color: "#16a34a" },
                { key: "credits", label: "Credits", color: "#7c3aed" },
              ]}
            />
            {byDay.size > 1 && (
              <ReportGroupedBarChart
                title="Activity by day"
                data={[...byDay.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([name, v]) => ({
                    name,
                    deliveries: v.deliveries,
                    returns: v.returns,
                    payments: v.payments,
                  }))}
                series={[
                  { key: "deliveries", label: "Deliveries", color: "#2563eb" },
                  { key: "returns", label: "Returns", color: "#ea580c" },
                  { key: "payments", label: "Payments", color: "#16a34a" },
                ]}
              />
            )}
            <h2 className="report-section-title">Deliveries</h2>
            <ReportTable
              headers={["Date", "Supplier", "Reference", "Total", "Paid on delivery", "By"]}
              rows={data.deliveries.map((d) => [
                d.deliveredAt.toLocaleDateString(),
                d.supplier.name,
                d.referenceNumber ?? "—",
                fmt(d.totalCostCents),
                fmt(d.paidAtDeliveryCents),
                d.recordedBy?.name ?? "—",
              ])}
            />
            <h2 className="report-section-title">Returns to supplier</h2>
            <ReportTable
              headers={["Date", "Supplier", "Reference", "Total", "By"]}
              rows={data.returns.map((r) => [
                r.returnedAt.toLocaleDateString(),
                r.supplier.name,
                r.referenceNumber ?? "—",
                fmt(r.totalCostCents),
                r.recordedBy?.name ?? "—",
              ])}
            />
            <h2 className="report-section-title">Payments & credits</h2>
            <ReportTable
              headers={["Date", "Supplier", "Type", "Amount", "Reference", "By"]}
              rows={data.payments.map((p) => [
                p.paidAt.toLocaleDateString(),
                p.supplier.name,
                p.type,
                fmt(p.amountCents),
                p.reference ?? "—",
                p.recordedBy?.name ?? "—",
              ])}
            />
          </>
        ),
        csv: {
          filename: "supplier-history.csv",
          headers: ["Type", "Date", "Supplier", "Amount", "Reference"],
          rows: [
            ...data.deliveries.map((d) => [
              "Delivery",
              d.deliveredAt.toISOString().slice(0, 10),
              d.supplier.name,
              (d.totalCostCents / 100).toFixed(2),
              d.referenceNumber ?? "",
            ]),
            ...data.returns.map((r) => [
              "Return",
              r.returnedAt.toISOString().slice(0, 10),
              r.supplier.name,
              (r.totalCostCents / 100).toFixed(2),
              r.referenceNumber ?? "",
            ]),
            ...data.payments.map((p) => [
              p.type,
              p.paidAt.toISOString().slice(0, 10),
              p.supplier.name,
              (p.amountCents / 100).toFixed(2),
              p.reference ?? "",
            ]),
          ],
        },
      };
    }

    case "staff-stock-receipts": {
      const data = await getStaffStockReceipts(range);
      return {
        content: (
          <>
            {data.byStaff.length > 0 && (
              <ReportBarChart
                title="Units received by staff"
                valueMode="number"
                data={data.byStaff.map((s) => ({ name: s.name, value: s.totalQty }))}
              />
            )}
            <h2 className="report-section-title">By staff member</h2>
            <ReportTable
              headers={["Staff", "Receipts", "Total units"]}
              rows={data.byStaff.map((s) => [s.name, String(s.count), String(s.totalQty)])}
            />
            <h2 className="report-section-title">Detail</h2>
            <ReportTable
              headers={["Date", "Product", "Qty", "By", "Note"]}
              rows={data.movements.map((m) => [
                m.createdAt.toLocaleString(),
                m.product.name,
                String(m.quantity),
                m.user?.name ?? "—",
                m.note ?? "—",
              ])}
            />
          </>
        ),
        csv: {
          filename: "staff-stock-receipts.csv",
          headers: ["Date", "Product", "Qty", "Staff", "Note"],
          rows: data.movements.map((m) => [
            m.createdAt.toISOString(),
            m.product.name,
            String(m.quantity),
            m.user?.name ?? "",
            m.note ?? "",
          ]),
        },
      };
    }

    case "sync-operations": {
      const data = await getSyncOperations();
      const statusPoints = [
        { name: "Pending sync", value: data.pendingSales },
        { name: "Open conflicts", value: data.openConflicts },
        {
          name: "Active terminals",
          value: data.terminals.filter((t) => t.isActive).length,
        },
        {
          name: "Inactive terminals",
          value: data.terminals.filter((t) => !t.isActive).length,
        },
      ].filter((p) => p.value > 0);
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Pending sync" value={String(data.pendingSales)} highlight={data.pendingSales > 0} />
              <StatCard label="Open conflicts" value={String(data.openConflicts)} highlight={data.openConflicts > 0} />
            </StatGrid>
            {statusPoints.length > 0 && (
              <ReportPieChart title="Sync status overview" valueMode="number" data={statusPoints} />
            )}
            <h2 className="report-section-title">Terminals</h2>
            <ReportTable
              headers={["Terminal", "Status", "Last sync"]}
              rows={data.terminals.map((t) => [
                t.name,
                t.isActive ? <span className="badge badge-success">Active</span> : <span className="badge">Inactive</span>,
                t.lastSyncAt ? t.lastSyncAt.toLocaleString() : "Never",
              ])}
            />
            <h2 className="report-section-title">Open conflicts</h2>
            <ReportTable
              headers={["Date", "Terminal", "Message"]}
              rows={data.recentConflicts.map((c) => [
                c.createdAt.toLocaleString(),
                c.sale.terminal.name,
                c.message,
              ])}
              emptyMessage="No open sync conflicts."
            />
          </>
        ),
        csv: {
          filename: "sync-operations.csv",
          headers: ["Terminal", "Active", "Last sync"],
          rows: data.terminals.map((t) => [
            t.name,
            t.isActive ? "Yes" : "No",
            t.lastSyncAt?.toISOString() ?? "",
          ]),
        },
      };
    }

    default:
      return { content: <p>Unknown report.</p> };
  }
}
