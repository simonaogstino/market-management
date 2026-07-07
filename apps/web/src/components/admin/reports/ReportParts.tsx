import Link from "next/link";
import type { ReportDefinition } from "@/lib/reports/definitions";
import type { DatePreset } from "@/lib/reports/date-range";

export function ReportFilter({
  report,
  preset,
  fromStr,
  toStr,
  extraParams,
}: {
  report: ReportDefinition;
  preset: DatePreset;
  fromStr: string;
  toStr: string;
  extraParams?: Record<string, string>;
}) {
  return (
    <form className="card filters-form report-filter no-print" method="get">
      {report.needsDateRange && (
        <>
          <label>
            Period
            <select name="preset" defaultValue={preset}>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          <label>
            From
            <input type="date" name="from" defaultValue={fromStr} />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={toStr} />
          </label>
        </>
      )}
      {report.extraParams?.map((param) => (
        <label key={param.key}>
          {param.label}
          <input
            type="number"
            name={param.key}
            min={1}
            defaultValue={extraParams?.[param.key] ?? String(param.default)}
          />
        </label>
      ))}
      <button className="btn" type="submit">
        Run report
      </button>
    </form>
  );
}

export function ReportHeader({
  title,
  description,
  generatedAt,
}: {
  title: string;
  description: string;
  generatedAt: string;
}) {
  return (
    <header className="report-header">
      <div>
        <Link href="/admin/reports" className="report-back no-print">
          ← All reports
        </Link>
        <h1 style={{ margin: "0.25rem 0 0" }}>{title}</h1>
        <p style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>{description}</p>
      </div>
      <p className="report-generated">Generated {generatedAt}</p>
    </header>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="report-stat-grid">{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="card report-stat-card">
      <div className="report-stat-label">{label}</div>
      <div className={`report-stat-value${highlight ? " report-stat-highlight" : ""}`}>{value}</div>
      {sub && <div className="report-stat-sub">{sub}</div>}
    </div>
  );
}

export function ReportTable({
  headers,
  rows,
  emptyMessage = "No data for this period.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card">
        <p style={{ color: "var(--muted)", margin: 0 }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="card report-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChangeBadge({ pct }: { pct: number }) {
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.05;
  if (flat) return <span className="badge">—</span>;
  return (
    <span className={`badge ${up ? "badge-success" : "badge-danger"}`}>
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}
