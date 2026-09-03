"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

function EntityBlock({ entityName, autoOpen }: { entityName: string; autoOpen?: boolean }) {
  const config = entities[entityName];
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen, entityName]);

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

  function toFormValue(kind: string, value: unknown): string {
    if (value === null || value === undefined) return "";
    if (kind === "date" && typeof value === "string" && value.includes("T")) {
      return value.slice(0, 10);
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  }

  function openRecord(row: Row) {
    setSelected(row);
    setEditing(false);
    setConfirmingDelete(false);
    const next: Record<string, string> = {};
    for (const f of config.fields) {
      next[f.name] = toFormValue(f.kind, row[f.name]);
    }
    setEditForm(next);
  }

  function closeRecord() {
    setSelected(null);
    setEditing(false);
    setConfirmingDelete(false);
  }

  async function saveEdit() {
    if (!selected) return;
    setBusy(true);
    await fetch(`/api/records/${entityName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, ...editForm }),
    });
    setBusy(false);
    closeRecord();
    await load();
  }

  async function destroyRecord() {
    if (!selected) return;
    setBusy(true);
    await fetch(`/api/records/${entityName}?id=${encodeURIComponent(selected.id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    closeRecord();
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
                onClick={() => openRecord(row)}
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
      <Dialog
        open={selected !== null}
        onClose={closeRecord}
        title={editing ? `Edit ${config.label}` : confirmingDelete ? `Delete ${config.label}?` : config.label}
      >
        {selected ? (
          confirmingDelete ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Permanently delete this {config.label.toLowerCase()} record? This cannot be undone.
              </p>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {config.fields.slice(0, 3).map((f) => (
                  <p key={f.name}>
                    <span className="font-semibold">{pretty(f.name)}: </span>
                    {renderCell(selected[f.name])}
                  </p>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button
                  onClick={destroyRecord}
                  disabled={busy}
                  className="bg-red-600 text-white hover:bg-red-500"
                >
                  {busy ? "Deleting..." : "Confirm delete"}
                </Button>
              </div>
            </div>
          ) : editing ? (
            <div className="space-y-3">
              {config.fields.map((f) => (
                <div key={f.name} className="space-y-1">
                  <Label>{pretty(f.name)}</Label>
                  <FieldInput
                    name={f.name}
                    kind={f.kind}
                    value={editForm[f.name] ?? ""}
                    onChange={(v) => setEditForm((prev) => ({ ...prev, [f.name]: v }))}
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  onClick={() => setEditing(false)}
                  disabled={busy}
                  className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button onClick={saveEdit} disabled={busy}>
                  {busy ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button
                  onClick={() => setEditing(true)}
                  className="bg-slate-900 text-white hover:bg-slate-700"
                >
                  Edit
                </Button>
                <Button
                  onClick={() => setConfirmingDelete(true)}
                  className="bg-red-600 text-white hover:bg-red-500"
                >
                  Delete
                </Button>
                <Button
                  onClick={closeRecord}
                  className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )
        ) : null}
      </Dialog>
    </Card>
  );
}

interface AiResult {
  summary: string;
  findings: string[];
  recommendations: string[];
  riskLevel: "low" | "medium" | "high";
  model: string;
  contextRows?: number;
}

// One-click presets that fill AI input fields. Generic across all 19 apps:
// field-name heuristics produce realistic sample vs high-risk edge values.
function sampleValue(field: string, variant: "sample" | "edge"): string {
  const f = field.toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => f.includes(k));
  if (variant === "edge") {
    if (has("date", "closing", "period", "year", "horizon", "deadline")) return "2021-01-05 (overdue / backdated)";
    if (has("email")) return "not-an-email";
    if (has("amount", "cost", "spend", "exposure", "limit", "pm", "rate", "price", "budget", "award", "credit", "balance", "payout", "loss")) return "999999999 (extreme outlier)";
    if (has("rate", "pct", "percent", "ratio", "score", "attendance")) return "999% (out of range)";
    if (has("count", "number", "headcount", "members", "size", "rows", "hours", "minutes", "days")) return "-5 (invalid negative)";
    if (has("phone")) return "123";
    if (has("url", "fileurl", "link")) return "htp:/broken-link";
    if (has("icd", "code", "hcc", "cpt", "bin", "reasoncode", "network")) return "XXX-000 (unknown code)";
    if (has("evidence", "notes", "summary", "text", "description", "findings")) return "";
    return "UNKNOWN-EDGE-VALUE -- missing / conflicting data";
  }
  if (has("servicedate", "date", "heldat", "sentat", "closing", "deadline", "startat")) return "2026-08-15";
  if (has("paymentyear", "year")) return "2025";
  if (has("period", "horizon", "window", "timeframe")) return "Q3 2026";
  if (has("email")) return "analyst@example.com";
  if (has("phone")) return "+1-555-010-2030";
  if (has("url", "fileurl", "link")) return "https://example.com/files/sample-1.csv";
  if (has("icd10", "icd")) return "E11.65";
  if (has("hcc")) return "HCC-19 Diabetes with complications";
  if (has("amount", "cost", "spend", "payout", "award", "budget", "limit", "attachment")) return "125000";
  if (has("pm")) return "1850";
  if (has("rate", "pct", "percent", "ratio")) return "4.2%";
  if (has("count", "headcount", "members", "size", "rows", "vacancies")) return "240";
  if (has("hours")) return "10";
  if (has("minutes", "duration")) return "45";
  if (has("owner", "manager", "analyst", "attendees", "employee", "student", "member", "executive", "reviewer")) return "Jordan Lee";
  if (has("role", "title")) return "Senior Analyst";
  if (has("status")) return "open";
  if (has("risk", "severity")) return "medium";
  if (has("network")) return "Visa";
  if (has("reasoncode", "reason")) return "10.4 (fraud suspected)";
  if (has("payer")) return "Acme Health Plan";
  if (has("repo")) return "acme/api";
  if (has("treaty", "treatyid")) return "TR-2026-014";
  if (has("county")) return "Cook County";
  if (has("specialty")) return "Cardiology";
  if (has("tone")) return "supportive and factual";
  return `Sample ${pretty(field)} — replace with real input`;
}

function WorkflowBlock({ slug }: { slug: string }) {
  const config = workflows.find((w) => w.slug === slug);
  const [input, setInput] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  if (!config) return null;

  const [ranAt, setRanAt] = useState<string>("");

  async function run() {
    setRunning(true);
    const response = await fetch(`/api/ai/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const data = await response.json().catch(() => null);
    setRunning(false);
    if (data?.result) {
      setResult(data.result);
      setRanAt(new Date().toLocaleString());
    }
  }

  function fillFields(variant: "sample" | "edge" | "minimal" | "complete") {
    const fields = config?.fields ?? [];
    const next: Record<string, string> = {};
    if (variant === "minimal") {
      // Prove optional fields work: fill only the first field.
      if (fields[0]) next[fields[0]] = sampleValue(fields[0], "sample");
    } else if (variant === "complete") {
      for (const field of fields) {
        next[field] = `${sampleValue(field, "sample")} — detailed context provided for thorough review`;
      }
    } else {
      for (const field of fields) {
        next[field] = sampleValue(field, variant);
      }
    }
    setInput(next);
    setResult(null);
  }

  function fillOne(field: string, variant: "sample" | "edge") {
    setInput((prev) => ({ ...prev, [field]: sampleValue(field, variant) }));
    setResult(null);
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Fill inputs
          </span>
          <button
            type="button"
            onClick={() => fillFields("sample")}
            className="rounded-full border border-emerald-600 bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
          >
            Fill sample
          </button>
          <button
            type="button"
            onClick={() => fillFields("edge")}
            title="Fill with boundary / high-risk values to test validation"
            className="rounded-full border border-amber-600 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            Fill edge case
          </button>
          <button
            type="button"
            onClick={() => fillFields("minimal")}
            title="Fill only the first field — remaining optional fields stay empty"
            className="rounded-full border border-sky-600 bg-white px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
          >
            Fill minimal
          </button>
          <button
            type="button"
            onClick={() => fillFields("complete")}
            title="Fill every field with detailed context"
            className="rounded-full border border-violet-600 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
          >
            Fill complete
          </button>
          <button
            type="button"
            onClick={() => { setInput({}); setResult(null); }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400"
          >
            Clear
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {config.fields.map((field) => (
            <div key={field} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{pretty(field)}</Label>
                <button
                  type="button"
                  onClick={() => fillOne(field, "sample")}
                  title={`Fill ${pretty(field)} with a sample value (optional field)`}
                  className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
                >
                  Fill
                </button>
              </div>
              <Input
                value={input[field] ?? ""}
                placeholder={`Optional — e.g. ${sampleValue(field, "sample").slice(0, 48)}`}
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
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">Analysis report — {config.title}</p>
                <p className="text-xs text-slate-300">
                  {[ranAt, result.model, typeof result.contextRows === "number" ? `${result.contextRows.toLocaleString()} rows analyzed` : ""].filter(Boolean).join("  •  ")}
                </p>
              </div>
              <Badge className={riskBadge}>{result.riskLevel.toUpperCase()} RISK</Badge>
            </div>
            <div className="space-y-4 p-4">
              <section>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Executive summary
                </p>
                <p className="mt-1 border-l-4 border-slate-900 bg-slate-50 p-3 text-sm leading-relaxed text-slate-900">
                  {result.summary}
                </p>
              </section>
              {result.findings.length > 0 ? (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Key findings ({result.findings.length})
                  </p>
                  <ol className="mt-2 space-y-2">
                    {result.findings.map((f, i) => (
                      <li key={i} className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-800">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
              {result.recommendations.length > 0 ? (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Recommended actions ({result.recommendations.length})
                  </p>
                  <ol className="mt-2 space-y-2">
                    {result.recommendations.map((f, i) => (
                      <li key={i} className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-slate-800">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                          ✓
                        </span>
                        <span>
                          <span className="font-semibold">Action {i + 1}: </span>
                          {f}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
              <section>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Inputs reviewed
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(input)
                    .filter(([, v]) => v.trim().length > 0)
                    .map(([k]) => (
                      <span key={k} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        {pretty(k)}
                      </span>
                    ))}
                  {Object.values(input).every((v) => !v.trim()) ? (
                    <span className="text-xs italic text-slate-400">No inputs provided — result is directional only.</span>
                  ) : null}
                </div>
              </section>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    const md = [
                      `# ${config.title} — Analysis Report`,
                      ranAt ? `_${ranAt} • ${result.model} • ${result.riskLevel} risk_` : `_${result.model} • ${result.riskLevel} risk_`,
                      "",
                      "## Executive summary",
                      result.summary,
                      "",
                      "## Key findings",
                      ...result.findings.map((f, i) => `${i + 1}. ${f}`),
                      "",
                      "## Recommended actions",
                      ...result.recommendations.map((f, i) => `${i + 1}. ${f}`),
                    ].join("\n");
                    navigator.clipboard?.writeText(md).catch(() => {});
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Copy report (Markdown)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const md = [
                      `# ${config.title} — Analysis Report`,
                      ranAt ? `_${ranAt} • ${result.model} • ${result.riskLevel} risk_` : `_${result.model} • ${result.riskLevel} risk_`,
                      "",
                      "## Executive summary",
                      result.summary,
                      "",
                      "## Key findings",
                      ...result.findings.map((f, i) => `${i + 1}. ${f}`),
                      "",
                      "## Recommended actions",
                      ...result.recommendations.map((f, i) => `${i + 1}. ${f}`),
                    ].join("\n");
                    const blob = new Blob([md], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${slug}-report.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  Download .md
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DomainWorkspace({ page }: { page: PageConfig }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultMode = page.workflows.length > 0 ? "analysis" : "records";
  const entityParam = searchParams.get("entity");
  const modeParam = searchParams.get("mode");
  const workflowParam = searchParams.get("workflow");
  const newParam = searchParams.get("new");
  const initialEntity =
    entityParam && page.entities.includes(entityParam)
      ? entityParam
      : (page.entities[0] ?? "");
  const initialMode =
    modeParam === "analysis" || modeParam === "records"
      ? modeParam
      : defaultMode;
  const initialWorkflow =
    workflowParam && page.workflows.includes(workflowParam)
      ? workflowParam
      : (page.workflows[0] ?? "");
  const [mode, setMode] = useState<"analysis" | "records">(initialMode);
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [entity, setEntity] = useState(initialEntity);

  // Keep dropdown <-> sidebar <-> URL in sync (sidebar links, back/forward).
  useEffect(() => {
    if (entityParam && page.entities.includes(entityParam) && entityParam !== entity) {
      setEntity(entityParam);
      if (page.workflows.length === 0) setMode("records");
      else if (modeParam === "records") setMode("records");
    }
    if (modeParam && modeParam !== mode && (modeParam === "analysis" || modeParam === "records")) {
      setMode(modeParam);
    }
    if (workflowParam && page.workflows.includes(workflowParam) && workflowParam !== workflow) {
      setWorkflow(workflowParam);
      setMode("analysis");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityParam, modeParam, workflowParam]);

  function updateUrl(nextEntity: string, nextMode: "analysis" | "records", nextWorkflow?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("entity", nextEntity);
    params.set("mode", nextMode);
    if (nextWorkflow) params.set("workflow", nextWorkflow);
    params.delete("new");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function pickMode(next: "analysis" | "records") {
    setMode(next);
    updateUrl(entity, next, workflow);
  }

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
                onClick={() => pickMode("analysis")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${mode === "analysis" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                <Sparkles className="h-4 w-4" /> AI analysis
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={mode === "records"}
              onClick={() => pickMode("records")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${mode === "records" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              <Database className="h-4 w-4" /> Records
            </button>
          </div>
        </div>

        <p className="mt-3 px-1 text-xs text-slate-500">
          {mode === "analysis"
            ? selectedWorkflow?.description
            : selectedEntity
              ? `View and manage ${selectedEntity.label.toLowerCase()} records.`
              : "Choose a record type."}
        </p>
      </div>

      {mode === "analysis" && workflow ? <WorkflowBlock key={workflow} slug={workflow} /> : null}
      {mode === "records" && entity ? <EntityBlock key={entity} entityName={entity} autoOpen={newParam === "1"} /> : null}
    </div>
  );
}

export default function DomainPage({ href }: { href: string }) {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <DomainPageInner href={href} />
    </Suspense>
  );
}

function DomainPageInner({ href }: { href: string }) {
  const page = pages.find((item) => item.href === href);
  if (!page) return <p className="text-slate-500">Unknown page.</p>;
  return <DomainWorkspace key={page.href} page={page} />;
}
