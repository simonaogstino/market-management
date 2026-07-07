import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>Access denied</h1>
      <p style={{ color: "var(--muted)" }}>
        You don&apos;t have permission to view this page. Contact your administrator if you
        need access.
      </p>
      <Link className="btn" href="/admin">
        Back to dashboard
      </Link>
    </div>
  );
}
