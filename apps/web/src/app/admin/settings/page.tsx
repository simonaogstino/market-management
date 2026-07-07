import { StoreSettingsForm } from "@/components/admin/StoreSettingsForm";
import { getAdminSession, requirePageAccess } from "@/lib/admin-session";
import { hasPermission } from "@/lib/permissions";
import { formatStoreMoney, getStoreSettings } from "@/lib/store-settings";

export default async function SettingsPage() {
  const session = await requirePageAccess("settings:view");
  const settings = await getStoreSettings(session.user.storeId);
  const canEdit = hasPermission(session.user.role, session.user.permissions, "settings:manage");

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Store settings</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Store profile, currency, low-stock alerts, and receipt text for POS.
      </p>

      <div className="card" style={{ maxWidth: 560, marginBottom: "1.5rem" }}>
        <StoreSettingsForm settings={settings} canEdit={canEdit} />
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Preview</h2>
        <div className="receipt-preview">
          <strong>{settings.receiptHeader?.trim() || settings.name}</strong>
          {settings.address && <div>{settings.address}</div>}
          {settings.phone && <div>{settings.phone}</div>}
          <hr style={{ margin: "0.75rem 0" }} />
          <div>Sample item 2× {formatStoreMoney(999, settings)}</div>
          <div style={{ marginTop: "0.5rem" }}>
            <strong>Total {formatStoreMoney(1998, settings)}</strong>
          </div>
          {settings.receiptFooter && (
            <p style={{ marginTop: "0.75rem", marginBottom: 0, fontSize: "0.875rem" }}>
              {settings.receiptFooter}
            </p>
          )}
        </div>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "var(--muted)" }}>
          Times in admin and reports use timezone: {settings.timezone}
        </p>
      </div>
    </div>
  );
}
