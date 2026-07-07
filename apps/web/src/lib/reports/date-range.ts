export type DateRange = { from: Date; to: Date };

export type DatePreset = "today" | "week" | "month" | "custom";

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parseDateParam(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function resolveDateRange(input: {
  preset?: string;
  from?: string;
  to?: string;
}): { range: DateRange; preset: DatePreset; fromStr: string; toStr: string } {
  const now = new Date();
  const preset = (input.preset as DatePreset) || "month";

  if (preset === "today") {
    const from = startOfDay(now);
    const to = endOfDay(now);
    return { range: { from, to }, preset, fromStr: formatDateInput(from), toStr: formatDateInput(to) };
  }

  if (preset === "week") {
    const to = endOfDay(now);
    const from = startOfDay(new Date(now));
    from.setDate(from.getDate() - 6);
    return { range: { from, to }, preset, fromStr: formatDateInput(from), toStr: formatDateInput(to) };
  }

  if (preset === "month") {
    const to = endOfDay(now);
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { range: { from, to }, preset, fromStr: formatDateInput(from), toStr: formatDateInput(to) };
  }

  const from = startOfDay(parseDateParam(input.from, startOfDay(now)));
  const to = endOfDay(parseDateParam(input.to, endOfDay(now)));
  const safeFrom = from <= to ? from : to;
  const safeTo = from <= to ? to : from;
  return {
    range: { from: safeFrom, to: safeTo },
    preset: "custom",
    fromStr: formatDateInput(safeFrom),
    toStr: formatDateInput(safeTo),
  };
}

export function previousPeriod(range: DateRange): DateRange {
  const ms = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - ms);
  return { from: startOfDay(from), to: endOfDay(to) };
}

export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  const cursor = startOfDay(range.from);
  const end = startOfDay(range.to);
  while (cursor <= end) {
    days.push(formatDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
