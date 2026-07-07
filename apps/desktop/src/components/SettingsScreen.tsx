import { FormEvent, useState } from "react";

export function SettingsScreen({
  onSaved,
}: {
  onSaved: (values: { apiBaseUrl: string; apiKey: string }) => Promise<void>;
}) {
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:3000");
  const [apiKey, setApiKey] = useState("pos-terminal-1-key");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSaved({ apiBaseUrl: apiBaseUrl.replace(/\/$/, ""), apiKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="panel settings-form">
      <h1 style={{ marginTop: 0 }}>POS setup</h1>
      <p style={{ color: "var(--muted)" }}>
        Enter the cloud API URL and this terminal&apos;s API key from the admin dashboard.
      </p>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
        <label>
          API base URL
          <input
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="http://localhost:3000"
            required
          />
        </label>
        <label>
          Terminal API key
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="pos-terminal-1-key"
            required
          />
        </label>
        {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Saving…" : "Save & continue"}
        </button>
      </form>
    </main>
  );
}
