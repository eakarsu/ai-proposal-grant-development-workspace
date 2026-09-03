"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Database, Plus, Sparkles, Table2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { entities, pages, workflows } from "@/config/app";

interface Metric {
  label: string;
  count: number;
}

function workflowPage(slug: string): string {
  return pages.find((p) => p.workflows.includes(slug))?.href ?? pages[0]?.href ?? "/dashboard";
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

      <Card className="border-violet-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" /> AI actions
          </CardTitle>
          <CardDescription>
            Run an AI workflow — each button opens the right workspace with that AI pre-selected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workflows.map((w) => (
              <Link
                key={w.slug}
                href={`${workflowPage(w.slug)}?mode=analysis&workflow=${encodeURIComponent(w.slug)}`}
                className="rounded-lg border border-violet-200 bg-violet-50 p-4 hover:border-violet-400 hover:bg-violet-100"
              >
                <p className="flex items-center gap-2 font-semibold text-violet-900">
                  <Sparkles className="h-4 w-4" /> {w.title}
                </p>
                <p className="mt-1 text-sm text-violet-700">{w.description}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Records — view & quick add
          </CardTitle>
          <CardDescription>
            Non-AI actions: open any table or create a record in one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {pages.map((p) => (
            <div key={p.href}>
              <p className="text-sm font-semibold text-slate-900">{p.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.entities.map((name) => (
                  <span key={name} className="inline-flex gap-1">
                    <Link
                      href={`${p.href}?entity=${encodeURIComponent(name)}&mode=records`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    >
                      <Table2 className="h-3.5 w-3.5" />
                      {entities[name]?.label ?? name}
                    </Link>
                    <Link
                      href={`${p.href}?entity=${encodeURIComponent(name)}&mode=records&new=1`}
                      title={`New ${entities[name]?.label ?? name}`}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> New
                    </Link>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
