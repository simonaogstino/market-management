"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/suppliers";

export type SupplierReturnRow = {
  id: string;
  returnedAt: string;
  referenceNumber: string | null;
  recordedByLabel: string;
  totalCostCents: number;
  lines: Array<{
    id: string;
    quantity: number;
    unitCostCents: number;
    product: { sku: string; name: string };
  }>;
};

type FilterPanel = "date" | "reference" | "items" | null;

function startOfDay(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(isoDate: string) {
  const d = new Date(`${isoDate}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function SupplierReturnsTable({ returns }: { returns: SupplierReturnRow[] }) {
  const [openFilter, setOpenFilter] = useState<FilterPanel>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [referenceQuery, setReferenceQuery] = useState("");
  const [itemsQuery, setItemsQuery] = useState("");

  const filtered = useMemo(() => {
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;
    const refQ = referenceQuery.trim().toLowerCase();
    const itemsQ = itemsQuery.trim().toLowerCase();

    return returns.filter((ret) => {
      if (from || to) {
        const at = new Date(ret.returnedAt);
        if (Number.isNaN(at.getTime())) return false;
        if (from && at < from) return false;
        if (to && at > to) return false;
      }

      if (refQ) {
        const ref = (ret.referenceNumber ?? "").toLowerCase();
        if (!ref.includes(refQ)) return false;
      }

      if (itemsQ) {
        const haystack = ret.lines
          .map((line) => `${line.product.sku} ${line.product.name}`)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(itemsQ)) return false;
      }

      return true;
    });
  }, [returns, fromDate, toDate, referenceQuery, itemsQuery]);

  const dateActive = Boolean(fromDate || toDate);
  const referenceActive = Boolean(referenceQuery.trim());
  const itemsActive = Boolean(itemsQuery.trim());
  const hasActiveFilter = dateActive || referenceActive || itemsActive;

  function toggleFilter(panel: Exclude<FilterPanel, null>) {
    setOpenFilter((current) => (current === panel ? null : panel));
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setReferenceQuery("");
    setItemsQuery("");
  }

  if (returns.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No returns recorded yet.</p>;
  }

  return (
    <div>
      {openFilter === "date" && (
        <div className="filters-form" style={{ marginBottom: "1rem" }}>
          <label>
            From
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          {dateActive && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
            >
              Clear dates
            </button>
          )}
        </div>
      )}

      {openFilter === "reference" && (
        <div className="filters-form" style={{ marginBottom: "1rem" }}>
          <label>
            Reference
            <input
              type="text"
              value={referenceQuery}
              placeholder="Search reference…"
              autoFocus
              onChange={(e) => setReferenceQuery(e.target.value)}
            />
          </label>
          {referenceActive && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setReferenceQuery("")}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {openFilter === "items" && (
        <div className="filters-form" style={{ marginBottom: "1rem" }}>
          <label>
            Items
            <input
              type="text"
              value={itemsQuery}
              placeholder="Search SKU or product name…"
              autoFocus
              onChange={(e) => setItemsQuery(e.target.value)}
            />
          </label>
          {itemsActive && (
            <button type="button" className="btn btn-secondary" onClick={() => setItemsQuery("")}>
              Clear
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No returns match these filters.
          {hasActiveFilter && (
            <>
              {" "}
              <button type="button" className="link-button" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          )}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="table-filter-trigger"
                  aria-expanded={openFilter === "date"}
                  onClick={() => toggleFilter("date")}
                >
                  Date{dateActive ? " · filtered" : ""}
                  <span aria-hidden>{openFilter === "date" ? " ▴" : " ▾"}</span>
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="table-filter-trigger"
                  aria-expanded={openFilter === "reference"}
                  onClick={() => toggleFilter("reference")}
                >
                  Reference{referenceActive ? " · filtered" : ""}
                  <span aria-hidden>{openFilter === "reference" ? " ▴" : " ▾"}</span>
                </button>
              </th>
              <th>Recorded by</th>
              <th>
                <button
                  type="button"
                  className="table-filter-trigger"
                  aria-expanded={openFilter === "items"}
                  onClick={() => toggleFilter("items")}
                >
                  Items{itemsActive ? " · filtered" : ""}
                  <span aria-hidden>{openFilter === "items" ? " ▴" : " ▾"}</span>
                </button>
              </th>
              <th>Total (purchase price)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ret) => (
              <tr key={ret.id}>
                <td>{new Date(ret.returnedAt).toLocaleDateString()}</td>
                <td>{ret.referenceNumber ?? "—"}</td>
                <td>{ret.recordedByLabel}</td>
                <td>
                  <ul className="delivery-items-list">
                    {ret.lines.map((line) => (
                      <li key={line.id}>
                        {line.product.sku} × {line.quantity} @ {formatMoney(line.unitCostCents)}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>{formatMoney(ret.totalCostCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
