export function OfflineBanner({ pendingCount }: { pendingCount: number }) {
  return (
    <div className="offline-banner">
      Working offline — sales are saved locally
      {pendingCount > 0 ? ` (${pendingCount} waiting to sync)` : ""}. They will upload when
      internet returns.
    </div>
  );
}
