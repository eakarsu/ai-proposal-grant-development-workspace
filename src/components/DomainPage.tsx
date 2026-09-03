"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Plus, Sparkles } from "lucide-react";
import { entities, pages, workflows, type PageConfig } from "@/config/app";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, pretty } from "@/lib/utils";

type Row = Record<string, unknown> & { id: string };

function FieldInput({
  name,
  kind,
  value,
  onChange,
}: {
  name: string;
  kind: string;
  value: string;
  onChange: (value: string) => void;
}) {
  if (kind === "boolean") {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300"
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
      />
    );
  }
  const type =
    kind === "number" ? "number" : kind === "date" ? "date" : "text";
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return formatDateTime(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  const s = String(value);
  return s.length > 64 ? s.slice(0, 61) + "..." : s;
}

function EntityBlock({ entityName }: { entityName: string }) {
  const config = entities[entityName];
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/records/${entityName}`);
    const data = await response.json().catch(() => ({ rows: [] }));
    setRows(data.rows ?? []);
  }, [entityName]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setSaving(true);
    await fetch(`/api/records/${entityName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setOpen(false);
    setForm({});
    await load();
  }

  const fields = config.fields;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{config.label}</CardTitle>
          <CardDescription>{rows.length} records</CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {fields.slice(0, 5).map((f) => (
                <TableHead key={f.name}>{pretty(f.name)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 10).map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => setSelected(row)}
              >
                {fields.slice(0, 5).map((f) => (
                  <TableCell key={f.name}>
                    {typeof row[f.name] === "string" &&
                    /T\d{2}:\d{2}/.test(row[f.name] as string)
                      ? formatDateTime(row[f.name] as string)
                      : renderCell(row[f.name])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`New ${config.label}`}
      >
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.name} className="space-y-1">
              <Label>{pretty(f.name)}</Label>
              <FieldInput
                name={f.name}
                kind={f.kind}
                value={form[f.name] ?? ""}
                onChange={(v) => setForm((prev) => ({ ...prev, [f.name]: v }))}
              />
            </div>
          ))}
          <Button onClick={create} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Create record"}
          </Button>
        </div>
      </Dialog>
      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={config.label}
      >
        {selected ? (
          <dl className="space-y-3">
            {Object.entries(selected)
              .filter(([, v]) => v !== null && typeof v !== "object")
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">
                    {pretty(key)}
                  </dt>
                  <dd className="text-sm text-slate-900">
                    {renderCell(value)}
                  </dd>
                </div>
              ))}
          </dl>
        ) : null}
      </Sheet>
    </Card>
  );
}

interface AiResult {
  summary: string;
  findings: string[];
  recommendations: string[];
  riskLevel: "low" | "medium" | "high";
  model: string;
}

function WorkflowBlock({ slug }: { slug: string }) {
  const config = workflows.find((w) => w.slug === slug);
  const [input, setInput] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  if (!config) return null;

  async function run() {
    setRunning(true);
    const response = await fetch(`/api/ai/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const data = await response.json().catch(() => null);
    setRunning(false);
    if (data?.result) setResult(data.result);
  }

  const riskBadge =
    result?.riskLevel === "high"
      ? "bg-red-50 text-red-700"
      : result?.riskLevel === "medium"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> {config.title}
        </CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {config.fields.map((field) => (
            <div key={field} className="space-y-1">
              <Label>{pretty(field)}</Label>
              <Input
                value={input[field] ?? ""}
                onChange={(e) =>
                  setInput((prev) => ({ ...prev, [field]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <Button onClick={run} disabled={running}>
          {running ? "Analyzing..." : "Run analysis"}
        </Button>
        {result ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{result.model}</span>
              <Badge className={riskBadge}>{result.riskLevel} risk</Badge>
            </div>
            <p className="text-sm text-slate-800">{result.summary}</p>
            {result.findings.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Findings
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {result.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.recommendations.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Recommendations
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {result.recommendations.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DomainWorkspace({ page }: { page: PageConfig }) {
  const defaultMode = page.workflows.length > 0 ? "analysis" : "records";
  const [mode, setMode] = useState<"analysis" | "records">(defaultMode);
  const [workflow, setWorkflow] = useState(page.workflows[0] ?? "");
  const [entity, setEntity] = useState(page.entities[0] ?? "");
  const selectedWorkflow = workflows.find((item) => item.slug === workflow);
  const selectedEntity = entities[entity];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">{page.label}</h1>
        {page.description ? (
          <p className="text-sm text-slate-500">{page.description}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-full rounded-lg bg-slate-100 p-1 sm:w-auto" role="tablist" aria-label="Workspace mode">
            {page.workflows.length > 0 ? (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "analysis"}
                onClick={() => setMode("analysis")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${mode === "analysis" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                <Sparkles className="h-4 w-4" /> AI analysis
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={mode === "records"}
              onClick={() => setMode("records")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${mode === "records" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              <Database className="h-4 w-4" /> Records
            </button>
          </div>

          {mode === "analysis" && page.workflows.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-slate-500">
              Workflow
              <select
                value={workflow}
                onChange={(event) => setWorkflow(event.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {page.workflows.map((slug) => (
                  <option key={slug} value={slug}>{workflows.find((item) => item.slug === slug)?.title ?? pretty(slug)}</option>
                ))}
              </select>
            </label>
          ) : null}

          {mode === "records" ? (
            <label className="flex items-center gap-2 text-sm text-slate-500">
              Show
              <select
                value={entity}
                onChange={(event) => setEntity(event.target.value)}
                className="h-9 min-w-44 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {page.entities.map((name) => (
                  <option key={name} value={name}>{entities[name]?.label ?? pretty(name)}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <p className="mt-3 px-1 text-xs text-slate-500">
          {mode === "analysis"
            ? selectedWorkflow?.description
            : selectedEntity
              ? `View and manage ${selectedEntity.label.toLowerCase()} records.`
              : "Choose a record type."}
        </p>
      </div>

      {mode === "analysis" && workflow ? <WorkflowBlock slug={workflow} /> : null}
      {mode === "records" && entity ? <EntityBlock entityName={entity} /> : null}
    </div>
  );
}

export default function DomainPage({ href }: { href: string }) {
  const page = pages.find((item) => item.href === href);
  if (!page) return <p className="text-slate-500">Unknown page.</p>;
  return <DomainWorkspace key={page.href} page={page} />;
}
