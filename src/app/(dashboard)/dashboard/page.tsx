"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pages } from "@/config/app";

interface Metric {
  label: string;
  count: number;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((d) => setMetrics(d.metrics ?? []))
      .catch(() => setMetrics([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Live operational overview across all domains.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {m.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{m.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pages.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="rounded-lg border border-slate-200 p-4 hover:border-slate-400 hover:bg-slate-50"
              >
                <p className="font-semibold text-slate-900">{p.label}</p>
                {p.description ? (
                  <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
