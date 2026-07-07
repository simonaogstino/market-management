import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Page not found</h1>
      <p style={{ color: "var(--muted)" }}>The page you requested does not exist.</p>
      <Link href="/" className="btn" style={{ display: "inline-flex", marginTop: "1rem" }}>
        Go home
      </Link>
    </div>
  );
}
