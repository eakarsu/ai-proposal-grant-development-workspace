"use client";

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
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/demo-credentials?status=1', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : { enabled: false })
      .then(result => setDemoEnabled(result.enabled === true)).catch(() => {});
    return () => controller.abort();
  }, []);

  async function fillDemoCredentials() {
    setDemoLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/demo-credentials', { cache: 'no-store' });
      const credentials = await response.json();
      if (!response.ok || !credentials.enabled || !credentials.email || !credentials.password) throw new Error('Local autofill is unavailable.');
      setEmail(credentials.email); setPassword(credentials.password);
    } catch { setError('Could not load local credentials. Please try again.'); }
    finally { setDemoLoading(false); }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await signIn("credentials", {redirect: false, email, password});
      if (!result || result.error) { setError("Invalid email or password."); return; }
      router.push("/projects"); router.refresh();
    } catch { setError("Sign-in service unavailable. Retry shortly."); }
    finally { setPending(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Proposal & Grant Development Workspace
          </h1>
          <p className="mt-2 text-sm text-slate-600">From source documents to validated submission packages</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with an account provisioned by your administrator.
          </p>
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
            {demoEnabled && <Button type="button" variant="outline" className="w-full" onClick={fillDemoCredentials} disabled={pending || demoLoading} aria-label="Auto Fill Demo Credentials">
              {demoLoading ? 'Filling credentials…' : 'Auto Fill Demo Credentials'}
            </Button>}
            <Button type="submit" className="w-full" disabled={pending || demoLoading}>
              {pending ? "Signing in..." : "Sign in securely"}
            </Button>

          </div>
        </form>
      </div>
    </div>
  );
}
