"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Login failed");
      }
      router.replace(from.startsWith("/") ? from : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell control-shell">
      <form className="control-gate login-gate" onSubmit={onSubmit}>
        <h1>SystemPulse</h1>
        <p>Enter the site password to continue.</p>
        <input
          className="control-input"
          type="password"
          placeholder="Password"
          value={password}
          autoComplete="current-password"
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="alert">{error}</div>}
        <button className="btn btn-accent" type="submit" disabled={loading || !password}>
          {loading ? "Signing in…" : "Enter"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="shell control-shell">
          <div className="control-gate login-gate">
            <h1>SystemPulse</h1>
            <p>Loading…</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
