"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStaff, updateStaff } from "@/lib/actions/admin";

interface StaffUser {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  pinHash: string | null;
}

export function StaffForm({ staff }: { staff?: StaffUser }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = staff
      ? await updateStaff(staff.id, formData)
      : await createStaff(formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/staff");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Name *
        <input name="name" required defaultValue={staff?.name ?? ""} placeholder="e.g. Alice" />
      </label>
      <label>
        Email <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
        <input
          name="email"
          type="email"
          defaultValue={staff?.email ?? ""}
          placeholder="Only if they need admin web access"
        />
      </label>
      <label>
        POS PIN (6 digits) {staff ? "" : "*"}
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required={!staff}
          placeholder={staff ? "Leave blank to keep current PIN" : "e.g. 111111"}
        />
        {staff && (
          <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
            Enter a new PIN only to reset it.
          </span>
        )}
      </label>
      {staff && (
        <label className="checkbox-label">
          <input type="checkbox" name="isActive" defaultChecked={staff.isActive} />
          Active (can log in to POS)
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : staff ? "Save changes" : "Add staff member"}
      </button>
    </form>
  );
}
