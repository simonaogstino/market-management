"use client";

import { FormEvent, useState } from "react";

export function PosSetup({ onSaved }: { onSaved: () => void }) {
  const [apiKey, setApiKey] = useState("pos-terminal-1-key");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/terminals/me", {
        headers: { "x-terminal-key": apiKey },
      });
      if (!response.ok) throw new Error("Invalid API key — check Admin → POS Terminals");

      const data = await response.json();
      const { saveTerminalConfig } = await import("@/lib/pos-db");
      await saveTerminalConfig({
        apiKey,
        terminalId: data.terminalId,
        terminalName: data.terminalName,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pos-setup">
      <div className="card">
        <h1>POS setup</h1>
        <p>Enter this terminal&apos;s API key from the admin dashboard.</p>
        <form onSubmit={onSubmit}>
          <label>
            Terminal API key
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
          </label>
          {error && <p className="pos-error">{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Connecting…" : "Start POS"}
          </button>
        </form>
      </div>
    </main>
  );
}
