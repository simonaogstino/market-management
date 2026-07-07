import { formatMoney } from "@/lib/suppliers";
import type { CsvExport } from "./ReportActions";
import {
  ChangeBadge,
  ReportTable,
  StatCard,
  StatGrid,
} from "./ReportParts";
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
              <StatCard label="Net revenue" value={fmt(data.netCents)} />
              <StatCard label="Gross sales" value={fmt(data.grossCents)} />
              <StatCard label="Returns" value={fmt(data.returnsCents)} highlight={data.returnsCents > 0} />
              <StatCard label="Transactions" value={String(data.saleCount)} sub={`${data.returnCount} returns`} />
              <StatCard label="Voided" value={String(data.voidedCount)} highlight={data.voidedCount > 0} />
            </StatGrid>
            <h2 className="report-section-title">Daily breakdown</h2>
            <ReportTable
              headers={["Date", "Sales", "Returns", "Net"]}
              rows={data.daily.map((d) => [
                d.date,
                fmt(d.sales),
                d.returns > 0 ? `−${fmt(d.returns)}` : fmt(0),
                fmt(d.net),
              ])}
            />
          </>
        ),
        csv: {
          filename: "sales-summary.csv",
          headers: ["Date", "Sales", "Returns", "Net"],
          rows: data.daily.map((d) => [
            d.date,
            (d.sales / 100).toFixed(2),
            (d.returns / 100).toFixed(2),
            (d.net / 100).toFixed(2),
          ]),
        },
      };
    }

    case "top-products": {
      const data = await getTopProducts(range);
      return {
        content: (
          <ReportTable
            headers={["SKU", "Product", "Qty sold", "Revenue"]}
            rows={data.map((p) => [p.sku, p.name, String(p.quantity), fmt(p.revenueCents)])}
          />
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
          <ReportTable
            headers={["Terminal", "Transactions", "Net revenue"]}
            rows={data.map((t) => [t.name, String(t.count), fmt(t.netCents)])}
          />
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
          <ReportTable
            headers={["Cashier", "Transactions", "Net revenue"]}
            rows={data.map((c) => [c.name, String(c.count), fmt(c.netCents)])}
          />
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
          <ReportTable
            headers={["Category", "Qty sold", "Revenue"]}
            rows={data.map((c) => [c.name, String(c.quantity), fmt(c.revenueCents)])}
          />
        ),
        csv: {
          filename: "sales-by-category.csv",
          headers: ["Category", "Quantity", "Revenue"],
          rows: data.map((c) => [c.name, String(c.quantity), (c.revenueCents / 100).toFixed(2)]),
        },
      };
    }

    case "hourly-sales": {
      const { hours, maxCents } = await getHourlySales(range);
      return {
        content: (
          <>
            <div className="card report-heatmap">
              {hours.map((h) => (
                <div key={h.hour} className="report-heatmap-row">
                  <span className="report-heatmap-label">{h.label}</span>
                  <div className="report-heatmap-bar-wrap">
                    <div
                      className="report-heatmap-bar"
                      style={{ width: `${(Math.abs(h.netCents) / maxCents) * 100}%` }}
                    />
                  </div>
                  <span className="report-heatmap-value">
                    {h.count} · {fmt(h.netCents)}
                  </span>
                </div>
              ))}
            </div>
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
      return {
        content: (
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
                Net revenue: {fmt(data.summary.netCents)}
              </p>
            </div>
            <StatGrid>
              <StatCard label="Transactions" value={String(data.summary.saleCount)} />
              <StatCard label="Returns" value={String(data.summary.returnCount)} />
              <StatCard label="Gross sales" value={fmt(data.summary.grossCents)} />
              <StatCard label="Voided" value={String(data.summary.voidedCount)} />
            </StatGrid>
            <h2 className="report-section-title">Top products</h2>
            <ReportTable
              headers={["Product", "Qty", "Revenue"]}
              rows={data.topProducts.map((p) => [p.name, String(p.quantity), fmt(p.revenueCents)])}
            />
            <h2 className="report-section-title">By cashier</h2>
            <ReportTable
              headers={["Cashier", "Transactions", "Net"]}
              rows={data.byCashier.map((c) => [c.name, String(c.count), fmt(c.netCents)])}
            />
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
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Products in stock" value={String(data.productCount)} />
              <StatCard label="Total valuation (at cost)" value={fmt(data.totalValueCents)} />
            </StatGrid>
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
      return {
        content: (
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
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Suppliers" value={String(data.length)} />
              <StatCard label="Total owed" value={fmt(totalOwed)} highlight={totalOwed > 0} />
            </StatGrid>
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
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Deliveries" value={fmt(data.totalDelivered)} />
              <StatCard label="Returns" value={fmt(data.totalReturned)} />
              <StatCard label="Payments" value={fmt(data.totalPaid)} />
              <StatCard label="Credits" value={fmt(data.totalCredits)} />
            </StatGrid>
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
      return {
        content: (
          <>
            <StatGrid>
              <StatCard label="Pending sync" value={String(data.pendingSales)} highlight={data.pendingSales > 0} />
              <StatCard label="Open conflicts" value={String(data.openConflicts)} highlight={data.openConflicts > 0} />
            </StatGrid>
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
