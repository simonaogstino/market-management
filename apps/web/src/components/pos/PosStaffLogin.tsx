"use client";

import { FormEvent, useState } from "react";
import { saveStaffSession } from "@/lib/pos-db";
import { loginStaff } from "@/lib/pos-sync";

export function PosStaffLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitPin(nextPin: string) {
    if (nextPin.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const data = await loginStaff(nextPin);
      await saveStaffSession({ staffId: data.staffId, staffName: data.staffName });
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function appendDigit(digit: string) {
    if (loading || pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 6) submitPin(next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submitPin(pin);
  }

  return (
    <main className="pos-setup">
      <div className="card">
        <h1>Staff login</h1>
        <p>Enter your 6-digit PIN to start selling.</p>
        <form onSubmit={onSubmit}>
          <div className="pin-display" aria-label="PIN entry">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={i < pin.length ? "pin-dot filled" : "pin-dot"} />
            ))}
          </div>
          <input
            className="pin-hidden-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setPin(digits);
              if (digits.length === 6) submitPin(digits);
            }}
            autoFocus
            aria-label="6-digit PIN"
          />
          <div className="pin-pad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((key) => (
              <button
                key={key}
                type="button"
                className="pin-key"
                disabled={loading}
                onClick={() => {
                  if (key === "clear") setPin("");
                  else if (key === "back") setPin((p) => p.slice(0, -1));
                  else appendDigit(key);
                }}
              >
                {key === "clear" ? "C" : key === "back" ? "←" : key}
              </button>
            ))}
          </div>
          {error && <p className="pos-error">{error}</p>}
          <button className="btn" type="submit" disabled={loading || pin.length !== 6}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
