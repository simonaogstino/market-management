"use client";

import { useEffect, useState } from "react";
import { fetchServerSyncStatus, getLocalSyncSummary, runSyncCycle } from "@/lib/pos-sync";

export function PosSyncPanel({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{
    lastSyncAt: string | null;
    pendingCount: number;
    conflictCount: number;
    conflicts: Array<{ localId: string; soldAt: string; totalCents: number; messages: string[] }>;
  } | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const local = await getLocalSyncSummary();
    const server = await fetchServerSyncStatus();
    const conflicts = [
      ...local.localConflicts.map((c) => ({
        localId: c.localId,
        soldAt: c.soldAt,
        totalCents: c.totalCents,
        messages: (c.messages as Array<{ message?: string }>).map((m) => m.message ?? String(m)),
      })),
      ...(server?.conflicts ?? []).filter(
        (s) => !local.localConflicts.some((l) => l.localId === s.localId),
      ),
    ];
    setSummary({
      lastSyncAt: server?.lastSyncAt ?? local.lastSyncAt,
      pendingCount: Math.max(local.pendingCount, server?.pendingCount ?? 0),
      conflictCount: conflicts.length,
      conflicts,
    });
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function syncNow() {
    setLoading(true);
    setMessage("");
    try {
      await runSyncCycle();
      await load();
      onChanged();
      setMessage("Sync complete.");
    } catch {
      setMessage("Sync failed — check connection.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-sync-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pos-sync-panel-header">
          <h2>Sync status</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pos-sync-stats">
          <div>
            <span className="pos-muted">Last sync</span>
            <div>{summary?.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleString() : "Never"}</div>
          </div>
          <div>
            <span className="pos-muted">Pending</span>
            <div>{summary?.pendingCount ?? 0}</div>
          </div>
          <div>
            <span className="pos-muted">Conflicts</span>
            <div className={summary && summary.conflictCount > 0 ? "pos-conflict-count" : ""}>
              {summary?.conflictCount ?? 0}
            </div>
          </div>
        </div>
        {summary && summary.conflictCount > 0 && (
          <div className="pos-conflict-box">
            <strong>Sync conflicts — contact manager</strong>
            {summary.conflicts.map((c) => (
              <div key={c.localId} className="pos-conflict-item">
                <div>
                  #{c.localId.slice(0, 8)} · ${(c.totalCents / 100).toFixed(2)} ·{" "}
                  {new Date(c.soldAt).toLocaleString()}
                </div>
                {c.messages.map((m, i) => (
                  <div key={i} className="pos-muted">
                    {m}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {message && <p className="pos-success-text">{message}</p>}
        <button className="btn" type="button" onClick={syncNow} disabled={loading}>
          {loading ? "Syncing…" : "Sync now"}
        </button>
      </div>
    </div>
  );
}
