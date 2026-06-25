"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import Logo from "@/components/Logo";

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Login failed.");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-7 shadow-card"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Lock className="h-4 w-4 text-brand-700" /> Leads Admin
          </div>
        </div>

        <label className="field-label" htmlFor="password">
          Admin password
        </label>
        <input
          id="password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
          autoComplete="current-password"
        />

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-5 w-full" disabled={loading || !password}>
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </div>
  );
}
