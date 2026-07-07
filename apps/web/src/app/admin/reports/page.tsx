import Link from "next/link";
import { requirePageAccess } from "@/lib/admin-session";
import { REPORT_CATEGORIES, REPORTS } from "@/lib/reports/definitions";

export default async function ReportsIndexPage() {
  await requirePageAccess("reports:view");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Reports</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Business reports with date filters, print/PDF, and CSV export.
      </p>

      {REPORT_CATEGORIES.map((category) => {
        const items = REPORTS.filter((r) => r.category === category);
        return (
          <section key={category} className="report-category-section">
            <h2 className="report-category-title">{category}</h2>
            <div className="report-index-grid">
              {items.map((report) => (
                <Link key={report.id} href={`/admin/reports/${report.id}`} className="card report-index-card">
                  <strong>{report.title}</strong>
                  <p>{report.description}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
