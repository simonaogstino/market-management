"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStoreSettings } from "@/lib/actions/admin";
import type { StoreSettings } from "@/lib/store-settings";
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/store-settings";

export function StoreSettingsForm({
  settings,
  canEdit,
}: {
  settings: StoreSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    const result = await updateStoreSettings(new FormData(e.currentTarget));
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <fieldset className="permissions-fieldset" disabled={!canEdit}>
        <legend>Store profile</legend>
        <label>
          Store name
          <input name="name" required defaultValue={settings.name} />
        </label>
        <label>
          Address
          <input name="address" defaultValue={settings.address ?? ""} placeholder="Street, city" />
        </label>
        <label>
          Phone
          <input name="phone" defaultValue={settings.phone ?? ""} placeholder="+1 555-0100" />
        </label>
        <label>
          Currency
          <select name="currency" defaultValue={settings.currency}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timezone
          <select name="timezone" defaultValue={settings.timezone}>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="permissions-fieldset" disabled={!canEdit}>
        <legend>Inventory</legend>
        <label>
          Low stock threshold
          <input
            name="lowStockThreshold"
            type="number"
            min={0}
            required
            defaultValue={settings.lowStockThreshold}
          />
        </label>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted)" }}>
          Products at or below this quantity appear on the dashboard and low-stock report.
        </p>
      </fieldset>

      <fieldset className="permissions-fieldset" disabled={!canEdit}>
        <legend>POS receipts</legend>
        <label>
          Receipt header
          <input
            name="receiptHeader"
            defaultValue={settings.receiptHeader ?? ""}
            placeholder={settings.name}
          />
        </label>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--muted)" }}>
          Shown at the top of printed receipts. Defaults to store name if empty.
        </p>
        <label>
          Receipt footer
          <textarea
            name="receiptFooter"
            rows={2}
            defaultValue={settings.receiptFooter ?? ""}
            placeholder="Thank you for your purchase!"
          />
        </label>
      </fieldset>

      {error && <p className="form-error">{error}</p>}

      {canEdit ? (
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      ) : (
        <p style={{ color: "var(--muted)", margin: 0 }}>You have view-only access to settings.</p>
      )}
    </form>
  );
}
