"use client";

import { appConfig } from "@/config/app";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [canFill, setCanFill] = useState(false);
  const [filling, setFilling] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/local-login', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => { if (active) setCanFill(data?.enabled === true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  async function fillCredentials() {
    setFilling(true); setError('');
    try {
      const response = await fetch('/api/local-login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Login': 'fill' }, body: '{}', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || typeof data.email !== 'string' || typeof data.password !== 'string') throw new Error(data.error || 'Unable to fill credentials.');
      setEmail(data.email); setPassword(data.password);
      const result = await signIn('credentials', { redirect: false, email: data.email, password: data.password });
      if (!result || result.error) { setError('Credentials filled. Press Sign in securely to continue.'); return; }
      router.push('/dashboard'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to fill credentials.'); }
    finally { setFilling(false); }
  }


  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await signIn("credentials", {redirect: false, email, password});
      if (!result || result.error) { setError("Invalid email or password."); return; }
      router.push("/dashboard"); router.refresh();
    } catch { setError("Sign-in service unavailable. Retry shortly."); }
    finally { setPending(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {appConfig.title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{appConfig.tagline}</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with an account provisioned by your administrator.
          </p>
          {canFill ? <Button type="button" variant="outline" className="mt-4 w-full" disabled={pending || filling} onClick={fillCredentials}>{filling ? 'Filling credentials…' : 'Fill credentials'}</Button> : null}
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error ? (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending || filling}>
              {pending ? "Signing in..." : "Sign in securely"}
            </Button>

          </div>
        </form>
      </div>
    </div>
  );
}
