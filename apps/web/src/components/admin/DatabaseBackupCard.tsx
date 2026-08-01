"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function DatabaseBackupCard({ available }: { available: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function downloadBackup() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/backup/database", { method: "GET" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Download failed (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/i.exec(disposition);
      const filename = match?.[1] ?? "market-backup.db";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download backup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560, marginBottom: "1.5rem" }}>
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Database backup</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.875rem" }}>
        Download a full copy of the store database (products, sales, staff, stock, settings).
        Keep it somewhere safe — it can restore the system if the server is lost.
      </p>

      {!available ? (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted)" }}>
          File download is available for SQLite. This server uses another database — use your
          host&apos;s backup tools (for example <code>pg_dump</code> for PostgreSQL).
        </p>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-secondary btn-with-icon"
            disabled={busy}
            onClick={() => void downloadBackup()}
          >
            <Download size={16} aria-hidden />
            {busy ? "Preparing backup…" : "Download database"}
          </button>
          {error && <p className="form-error">{error}</p>}
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "var(--muted)" }}>
            Prefer downloading when the store is quiet. The file is a consistent snapshot (SQLite
            VACUUM INTO).
          </p>
        </>
      )}
    </div>
  );
}
