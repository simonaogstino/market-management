"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOfficeUser, updateOfficeUser } from "@/lib/actions/admin";
import { PERMISSION_GROUPS } from "@/lib/permissions";

interface OfficeUser {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  permissions: string | null;
}

function splitDisplayName(full: string) {
  const match = full.match(/^(.+?)\s+\((.+)\)$/);
  if (match) return { name: match[1].trim(), jobTitle: match[2].trim() };
  return { name: full, jobTitle: "" };
}

export function OfficeUserForm({ user }: { user?: OfficeUser }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const parsed = user ? splitDisplayName(user.name) : { name: "", jobTitle: "" };
  const existingPerms = user?.permissions ? (JSON.parse(user.permissions) as string[]) : [];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = user
      ? await updateOfficeUser(user.id, formData)
      : await createOfficeUser(formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Full name *
        <input name="name" required defaultValue={parsed.name} placeholder="e.g. Sarah Chen" />
      </label>
      <label>
        Role / job title
        <input
          name="jobTitle"
          defaultValue={parsed.jobTitle}
          placeholder="e.g. Accountant, HR Manager"
        />
      </label>
      <label>
        Email *
        <input
          name="email"
          type="email"
          required
          defaultValue={user?.email ?? ""}
          placeholder="e.g. accountant@store.local"
        />
      </label>
      <label>
        Password {user ? "" : "*"}
        <input
          name="password"
          type="password"
          required={!user}
          placeholder={user ? "Leave blank to keep current password" : "Min. 6 characters"}
        />
      </label>

      <fieldset className="permissions-fieldset">
        <legend>Privileges *</legend>
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
          Select what this user can access in the admin panel.
        </p>
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.label} className="permission-group">
            <strong>{group.label}</strong>
            <div className="permission-checks">
              {group.items.map((item) => (
                <label key={item.key} className="checkbox-label">
                  <input
                    type="checkbox"
                    name={`perm_${item.key}`}
                    defaultChecked={existingPerms.includes(item.key)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      {user && (
        <label className="checkbox-label">
          <input type="checkbox" name="isActive" defaultChecked={user.isActive} />
          Active (can sign in)
        </label>
      )}

      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : user ? "Save changes" : "Create user"}
      </button>
    </form>
  );
}
