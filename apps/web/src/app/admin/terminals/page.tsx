import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";

export default async function TerminalsPage() {
  await requirePageAccess("terminals:view");

  const terminals = await prisma.terminal.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>POS Terminals</h1>
      <p style={{ color: "var(--muted)" }}>
        Each Windows POS PC uses its terminal API key to sync sales. Configure the key in the
        desktop app settings.
      </p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">API key</th>
              <th align="left">Last sync</th>
              <th align="left">Status</th>
            </tr>
          </thead>
          <tbody>
            {terminals.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  <code>{t.apiKey}</code>
                </td>
                <td>{t.lastSyncAt ? t.lastSyncAt.toLocaleString() : "Never"}</td>
                <td>
                  {t.isActive ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="badge">Inactive</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
