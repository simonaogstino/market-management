"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@market/shared";
import { getTerminalConfig, type StaffSession } from "@/lib/pos-db";

type SessionPayload = {
  id: string;
  openedAt: string;
  openingCents: number;
  openedByName?: string | null;
  note?: string | null;
  movements: Array<{
    id: string;
    type: "PAY_IN" | "PAY_OUT";
    amountCents: number;
    reason: string | null;
    createdAt: string;
  }>;
  summary: {
    openingCents: number;
    cashSalesCents: number;
    cashReturnsCents: number;
    payInCents: number;
    payOutCents: number;
    expectedCents: number;
  };
};

async function cashFetch(path: string, init?: RequestInit) {
  const config = await getTerminalConfig();
  if (!config) throw new Error("Terminal not configured.");
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-terminal-key": config.apiKey,
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let data: { error?: string; session?: SessionPayload | null; movement?: unknown } = {};
  if (text) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new Error(
        res.ok
          ? "Invalid response from cash API."
          : text.slice(0, 160).trim() || `Cash API error ${res.status}`,
      );
    }
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Cash API error ${res.status}`);
  }
  return data;
}

export function PosCashPanel({
  staff,
  onClose,
  onChanged,
}: {
  staff: StaffSession;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openingAmount, setOpeningAmount] = useState("0");
  const [countedAmount, setCountedAmount] = useState("");
  const [moveType, setMoveType] = useState<"PAY_IN" | "PAY_OUT">("PAY_IN");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await cashFetch("/api/pos/cash/session");
      setSession(data.session ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cash session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openDrawer() {
    setError("");
    setMessage("");
    try {
      await cashFetch("/api/pos/cash/session", {
        method: "POST",
        body: JSON.stringify({
          action: "open",
          staffId: staff.staffId,
          openingAmount,
        }),
      });
      setMessage("Cash drawer opened.");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open drawer.");
    }
  }

  async function closeDrawer() {
    setError("");
    setMessage("");
    try {
      const data = await cashFetch("/api/pos/cash/session", {
        method: "POST",
        body: JSON.stringify({
          action: "close",
          staffId: staff.staffId,
          countedAmount,
        }),
      });
      const variance = data.session?.varianceCents ?? 0;
      setMessage(
        `Drawer closed. Expected ${formatMoney(data.session.expectedCents)}, counted ${formatMoney(data.session.countedCents)}, variance ${formatMoney(variance)}.`,
      );
      setCountedAmount("");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close drawer.");
    }
  }

  async function addMovement() {
    setError("");
    setMessage("");
    try {
      await cashFetch("/api/pos/cash/movement", {
        method: "POST",
        body: JSON.stringify({
          staffId: staff.staffId,
          type: moveType,
          amount: moveAmount,
          reason: moveReason,
        }),
      });
      setMoveAmount("");
      setMoveReason("");
      setMessage(moveType === "PAY_IN" ? "Cash paid in." : "Cash paid out.");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record movement.");
    }
  }

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal" style={{ maxWidth: 520 }}>
        <h2>Cash drawer</h2>
        {loading && <p className="pos-muted">Loading…</p>}
        {error && <div className="pos-error-banner">{error}</div>}
        {message && <div className="pos-success-banner">{message}</div>}

        {!loading && !session && (
          <div className="admin-form">
            <p className="pos-muted">No open session. Open the drawer with a starting float.</p>
            <label>
              Opening float (IQD)
              <input
                type="number"
                min={0}
                step={1}
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </label>
            <button className="btn" type="button" onClick={() => void openDrawer()}>
              Open drawer
            </button>
          </div>
        )}

        {!loading && session && (
          <div className="admin-form">
            <div className="invoice-totals" style={{ background: "#0f172a", borderColor: "#334155" }}>
              <div className="invoice-totals-row">
                <span>Opening float</span>
                <strong>{formatMoney(session.summary.openingCents)}</strong>
              </div>
              <div className="invoice-totals-row">
                <span>Cash sales</span>
                <strong>+{formatMoney(session.summary.cashSalesCents)}</strong>
              </div>
              <div className="invoice-totals-row">
                <span>Cash returns</span>
                <strong>−{formatMoney(session.summary.cashReturnsCents)}</strong>
              </div>
              <div className="invoice-totals-row">
                <span>Pay in</span>
                <strong>+{formatMoney(session.summary.payInCents)}</strong>
              </div>
              <div className="invoice-totals-row">
                <span>Pay out</span>
                <strong>−{formatMoney(session.summary.payOutCents)}</strong>
              </div>
              <div className="invoice-totals-row invoice-totals-net">
                <span>Expected in drawer</span>
                <strong>{formatMoney(session.summary.expectedCents)}</strong>
              </div>
            </div>

            <fieldset className="permissions-fieldset">
              <legend>Pay in / pay out</legend>
              <label>
                Type
                <select
                  value={moveType}
                  onChange={(e) => setMoveType(e.target.value as "PAY_IN" | "PAY_OUT")}
                >
                  <option value="PAY_IN">Pay in (add cash)</option>
                  <option value="PAY_OUT">Pay out (remove cash)</option>
                </select>
              </label>
              <label>
                Amount (IQD)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={moveAmount}
                  onChange={(e) => setMoveAmount(e.target.value)}
                />
              </label>
              <label>
                Reason
                <input
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="e.g. Safe drop, change refill"
                />
              </label>
              <button className="btn btn-secondary" type="button" onClick={() => void addMovement()}>
                Record movement
              </button>
            </fieldset>

            <fieldset className="permissions-fieldset">
              <legend>Close drawer</legend>
              <label>
                Counted cash (IQD)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={countedAmount}
                  onChange={(e) => setCountedAmount(e.target.value)}
                />
              </label>
              <button className="btn" type="button" onClick={() => void closeDrawer()}>
                Close &amp; reconcile
              </button>
            </fieldset>
          </div>
        )}

        <div className="pos-modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
