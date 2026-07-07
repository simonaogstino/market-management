"use client";

import { Download, Printer } from "lucide-react";

export type CsvExport = {
  filename: string;
  headers: string[];
  rows: string[][];
};

export function ReportActions({ csv }: { csv?: CsvExport }) {
  function handlePrint() {
    window.print();
  }

  function handleCsv() {
    if (!csv) return;
    const escape = (v: string) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    const lines = [
      csv.headers.map(escape).join(","),
      ...csv.rows.map((row) => row.map(escape).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csv.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="report-actions no-print">
      <button type="button" className="btn btn-secondary btn-with-icon" onClick={handlePrint}>
        <Printer size={16} strokeWidth={2} aria-hidden />
        <span>Print / PDF</span>
      </button>
      {csv && (
        <button type="button" className="btn btn-secondary btn-with-icon" onClick={handleCsv}>
          <Download size={16} strokeWidth={2} aria-hidden />
          <span>Export CSV</span>
        </button>
      )}
    </div>
  );
}
