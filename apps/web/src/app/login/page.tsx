"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }

    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();
    const role = session?.user?.role ?? "ADMIN";
    const permissions = session?.user?.permissions ?? [];
    const { getDefaultAdminPath } = await import("@/lib/permissions");
    router.push(getDefaultAdminPath(role, permissions));
  }

  return (
    <main style={{ maxWidth: 400, margin: "4rem auto", padding: "0 1.5rem" }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Sign in</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Email</span>
            <input name="email" type="email" required defaultValue="admin@store.local" />
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span>Password</span>
            <input name="password" type="password" required defaultValue="admin123" />
          </label>
          {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
