"use client";

import { useState } from "react";

// Never persists the entered secret anywhere client-side beyond this
// form's own submission — no localStorage/sessionStorage, no query
// string, no URL. On success the server sets an HttpOnly session cookie
// (invisible to this or any client-side JS) and we simply reload so the
// page's Server Component re-renders as authenticated.
export default function AdminLoginForm() {
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.message ?? "Incorrect access code.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      setSecret("");
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-[#E7DECE] bg-white p-6 shadow-[0_1px_3px_-1px_rgba(59,47,39,0.08)]">
      <h2 className="font-heading text-lg text-[#3B2F27]">BeLa internal access</h2>
      <p className="mt-1 text-sm text-[#6B5B4C]">Enter the internal access code to continue.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Access code"
          className="w-full rounded-lg border border-[#D8CBB4] bg-white px-3 py-2 text-sm text-[#3B2F27]"
        />
        {error && <p className="text-sm text-[#B14A2E]">{error}</p>}
        <button
          type="submit"
          disabled={!secret || submitting}
          className="w-full rounded-full bg-[#3B2F27] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#2A2019] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
