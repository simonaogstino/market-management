import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Market Management</h1>
      <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
        All-in-one web app — admin dashboard and browser-based POS with offline support.
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link className="btn" href="/pos">
          Open POS
        </Link>
        <Link className="btn btn-secondary" href="/admin">
          Admin dashboard
        </Link>
        <Link className="btn btn-secondary" href="/login">
          Sign in
        </Link>
      </div>
    </main>
  );
}
