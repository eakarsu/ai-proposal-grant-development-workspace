"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function JoinPage() {
  const [token, setToken] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setTimeout(() => setToken(window.location.hash.slice(1)), 0);
  }, []);
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/grants/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            ...(name ? { name } : {}),
            ...(password ? { password } : {}),
          }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDone(true);
      window.history.replaceState(null, "", "/join");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-lg mx-auto p-8 space-y-5">
      <h1 className="text-2xl font-bold">Accept your project invitation</h1>
      <p>
        Existing users must sign in as the invited recipient first. New users
        can create their account below.
      </p>
      <Link className="underline" href="/login" target="_blank">
        Sign in in another tab
      </Link>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {done ? (
        <p>
          Invitation accepted.{" "}
          <Link href="/projects" className="underline">
            Open grant projects
          </Link>{" "}
          or{" "}
          <Link href="/login" className="underline">
            sign in to your new account
          </Link>
          .
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void accept();
          }}
        >
          <label className="block">
            Name (new accounts)
            <input
              className="border rounded block p-2 w-full"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            Password (new accounts; at least 16 characters)
            <input
              type="password"
              minLength={16}
              className="border rounded block p-2 w-full"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            disabled={!token || busy}
            className="bg-slate-900 text-white rounded p-3"
          >
            Accept invitation
          </button>
        </form>
      )}
    </main>
  );
}
