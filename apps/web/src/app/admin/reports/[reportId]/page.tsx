import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/admin-session";
import { ReportActions } from "@/components/admin/reports/ReportActions";
import { ReportFilter, ReportHeader } from "@/components/admin/reports/ReportParts";
import { renderReport } from "@/components/admin/reports/ReportRenderer";
import { getReportById } from "@/lib/reports/definitions";
import { resolveDateRange } from "@/lib/reports/date-range";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePageAccess("reports:view");

  const { reportId } = await params;
  const report = getReportById(reportId);
  if (!report) notFound();

  const sp = await searchParams;
  const { range, preset, fromStr, toStr } = resolveDateRange({
    preset: sp.preset,
    from: sp.from,
    to: sp.to,
  });

  const extraParams: Record<string, number> = {};
  for (const param of report.extraParams ?? []) {
    const raw = sp[param.key];
    const n = raw ? parseInt(raw, 10) : param.default;
    extraParams[param.key] = Number.isNaN(n) || n < 1 ? param.default : n;
  }

  const extraParamStrings = Object.fromEntries(
    Object.entries(extraParams).map(([k, v]) => [k, String(v)]),
  );

  const { content, csv } = await renderReport(reportId, range, extraParams);
  const generatedAt = new Date().toLocaleString();

  return (
    <div className="report-page">
      <ReportHeader title={report.title} description={report.description} generatedAt={generatedAt} />
      <div className="report-toolbar">
        <ReportFilter
          report={report}
          preset={preset}
          fromStr={fromStr}
          toStr={toStr}
          extraParams={extraParamStrings}
        />
        <ReportActions csv={csv} />
      </div>
      {report.needsDateRange && (
        <p className="report-range-note">
          Period: {fromStr} – {toStr}
        </p>
      )}
      <div className="report-body">{content}</div>
    </div>
  );
}
