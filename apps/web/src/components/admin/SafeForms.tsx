"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  adjustSafeAction,
  bankDepositFromSafeAction,
  transferToSafeAction,
} from "@/lib/actions/safe";
import { formatMoney } from "@/lib/cash";

type OpenDrawer = {
  sessionId: string;
  terminalName: string;
  cashInBoxCents: number;
};

export function SafeTransferForm({ drawers }: { drawers: OpenDrawer[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  if (drawers.length === 0) {
    return (
      <p style={{ color: "var(--muted)", margin: 0 }}>
        No open cash drawers. Open a terminal drawer before transferring to the safe.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const result = await transferToSafeAction(new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Transferred to safe.");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      {error && <p className="form-error">{error}</p>}
      {message && <p style={{ color: "var(--success, #16a34a)" }}>{message}</p>}
      <label>
        From terminal
        <select name="cashSessionId" required defaultValue={drawers[0]?.sessionId}>
          {drawers.map((d) => (
            <option key={d.sessionId} value={d.sessionId}>
              {d.terminalName} — {formatMoney(d.cashInBoxCents)} in box
            </option>
          ))}
        </select>
      </label>
      <label>
        Amount (IQD)
        <input name="amount" type="number" min={1} step={1} required />
      </label>
      <label>
        Note
        <input name="note" placeholder="e.g. End of day collection" />
      </label>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Transfer to safe"}
      </button>
    </form>
  );
}

export function SafeBankDepositForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const result = await bankDepositFromSafeAction(new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Bank deposit recorded.");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      {error && <p className="form-error">{error}</p>}
      {message && <p style={{ color: "var(--success, #16a34a)" }}>{message}</p>}
      <label>
        Amount (IQD)
        <input name="amount" type="number" min={1} step={1} required />
      </label>
      <label>
        Bank reference
        <input name="reference" placeholder="e.g. Slip / transfer ref" />
      </label>
      <label>
        Note
        <input name="note" />
      </label>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Record bank deposit"}
      </button>
    </form>
  );
}

export function SafeAdjustForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const result = await adjustSafeAction(new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Safe adjustment recorded.");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      {error && <p className="form-error">{error}</p>}
      {message && <p style={{ color: "var(--success, #16a34a)" }}>{message}</p>}
      <label>
        Direction
        <select name="direction" defaultValue="in">
          <option value="in">Add to safe</option>
          <option value="out">Remove from safe</option>
        </select>
      </label>
      <label>
        Amount (IQD)
        <input name="amount" type="number" min={1} step={1} required />
      </label>
      <label>
        Reason
        <input name="note" placeholder="Required for audit — e.g. count correction" required />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Record adjustment"}
      </button>
    </form>
  );
}

export function TransferToSafeFromSessionForm({
  sessionId,
  maxCents,
}: {
  sessionId: string;
  maxCents: number;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const result = await transferToSafeAction(new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Transferred to safe.");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form className="admin-form card" onSubmit={onSubmit}>
      <h3 style={{ marginTop: 0 }}>Transfer to safe</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Collect cash from this drawer into the store safe. Available:{" "}
        <strong>{formatMoney(maxCents)}</strong>
      </p>
      {error && <p className="form-error">{error}</p>}
      {message && <p style={{ color: "var(--success, #16a34a)" }}>{message}</p>}
      <input type="hidden" name="cashSessionId" value={sessionId} />
      <label>
        Amount (IQD)
        <input name="amount" type="number" min={1} step={1} required />
      </label>
      <label>
        Note
        <input name="note" placeholder="e.g. Collected by accountant" />
      </label>
      <button className="btn" type="submit" disabled={loading || maxCents <= 0}>
        {loading ? "Saving…" : "Transfer to safe"}
      </button>
    </form>
  );
}
