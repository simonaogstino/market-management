"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@market/shared";

export type ChartPoint = { name: string; value: number };
export type ChartMultiPoint = { name: string; [key: string]: string | number };

const CHART_COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#ca8a04",
  "#475569",
];

const CHART_HEIGHT = 300;

function moneyTick(v: number) {
  return formatMoney(Math.round(v));
}

function shortLabel(name: string, max = 18) {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}

export function ReportChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card report-chart-card">
      <h3 className="report-chart-title">{title}</h3>
      <div className="report-chart-body">{children}</div>
    </div>
  );
}

function EmptyChart() {
  return <p className="report-chart-empty">No data to chart.</p>;
}

type ValueMode = "money" | "number";

function tooltipFormatter(mode: ValueMode) {
  return (value: unknown) => {
    const raw = Array.isArray(value) ? value[0] : value;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return String(raw ?? "");
    return mode === "money" ? formatMoney(Math.round(n)) : String(n);
  };
}

export function ReportBarChart({
  data,
  title,
  layout = "vertical",
  valueMode = "money",
  color = CHART_COLORS[0],
}: {
  data: ChartPoint[];
  title: string;
  layout?: "vertical" | "horizontal";
  valueMode?: ValueMode;
  color?: string;
}) {
  if (data.length === 0) {
    return (
      <ReportChartCard title={title}>
        <EmptyChart />
      </ReportChartCard>
    );
  }

  const isHorizontal = layout === "horizontal";
  const tickFmt = valueMode === "money" ? moneyTick : (v: number) => String(v);

  return (
    <ReportChartCard title={title}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          {isHorizontal ? (
            <>
              <XAxis type="number" tickFormatter={tickFmt} fontSize={12} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickFormatter={(v) => shortLabel(String(v))}
                fontSize={12}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tickFormatter={(v) => shortLabel(String(v), 12)} fontSize={12} />
              <YAxis tickFormatter={tickFmt} fontSize={12} width={72} />
            </>
          )}
          <Tooltip formatter={tooltipFormatter(valueMode)} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </ReportChartCard>
  );
}

export function ReportGroupedBarChart({
  data,
  title,
  series,
  valueMode = "money",
}: {
  data: ChartMultiPoint[];
  title: string;
  series: Array<{ key: string; label: string; color?: string }>;
  valueMode?: ValueMode;
}) {
  if (data.length === 0 || series.length === 0) {
    return (
      <ReportChartCard title={title}>
        <EmptyChart />
      </ReportChartCard>
    );
  }

  const tickFmt = valueMode === "money" ? moneyTick : (v: number) => String(v);

  return (
    <ReportChartCard title={title}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tickFormatter={(v) => shortLabel(String(v), 14)} fontSize={12} />
          <YAxis tickFormatter={tickFmt} fontSize={12} width={72} />
          <Tooltip formatter={tooltipFormatter(valueMode)} />
          <Legend />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ReportChartCard>
  );
}

export function ReportLineChart({
  data,
  title,
  series,
  valueMode = "money",
}: {
  data: ChartMultiPoint[];
  title: string;
  series: Array<{ key: string; label: string; color?: string }>;
  valueMode?: ValueMode;
}) {
  if (data.length === 0 || series.length === 0) {
    return (
      <ReportChartCard title={title}>
        <EmptyChart />
      </ReportChartCard>
    );
  }

  const tickFmt = valueMode === "money" ? moneyTick : (v: number) => String(v);

  return (
    <ReportChartCard title={title}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tickFormatter={(v) => shortLabel(String(v), 10)} fontSize={12} />
          <YAxis tickFormatter={tickFmt} fontSize={12} width={72} />
          <Tooltip formatter={tooltipFormatter(valueMode)} />
          <Legend />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={data.length <= 31}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ReportChartCard>
  );
}

export function ReportPieChart({
  data,
  title,
  valueMode = "money",
}: {
  data: ChartPoint[];
  title: string;
  valueMode?: ValueMode;
}) {
  if (data.length === 0) {
    return (
      <ReportChartCard title={title}>
        <EmptyChart />
      </ReportChartCard>
    );
  }

  return (
    <ReportChartCard title={title}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ name }) => shortLabel(String(name), 14)}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={tooltipFormatter(valueMode)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ReportChartCard>
  );
}

/** Cap long lists for readable charts. */
export function topN(points: ChartPoint[], n: number): ChartPoint[] {
  return points.slice(0, n);
}
