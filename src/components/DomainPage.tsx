"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { entities, pages, workflows } from "@/config/app";
import { recordMetadata, canWrite, canDelete, type Field } from "@/lib/record-policy";
import WorkflowExamples from "@/components/WorkflowExamples";
import RecordImport from "@/components/RecordImport";
import EvidenceUpload from "@/components/EvidenceUpload";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { pretty } from "@/lib/utils";

type Row = Record<string, unknown> & { id: string; updatedAt: string };
type Analysis = { claims?: {claim:string;sourceId:string;quote:string}[]; id: string; workflow?: string; summary: string; findings: string[]; recommendations: string[]; citations: string[]; limitations: string[]; model: string; contextRows: number };
function exportDraft(result: Analysis) {
  const text = [`# Proposal working draft`, `Saved analysis: ${result.id}`, `Model: ${result.model}`, result.summary,
    '## Findings', ...result.findings.map(x=>`- ${x}`), '## Recommendations', ...result.recommendations.map(x=>`- ${x}`),
    '## Source excerpts', ...(result.claims ?? []).map(x=>`${x.claim}\n\nSource: ${x.sourceId}\n\n> ${x.quote.replace(/\n/g,'\n> ')}`),
    '## Evidence references', ...result.citations, '## Limitations', ...result.limitations, 'Draft only. Requires human review before submission.'].join('\n\n');
  const url=URL.createObjectURL(new Blob([text], {type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a'); link.href=url; link.download=`proposal-draft-${result.id.replace(/[^a-zA-Z0-9_-]/g,'')}.md`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (response.status === 401 && typeof window !== "undefined") window.location.assign("/login");
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || "The service is unavailable. Please retry.");
  return data;
}
const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const message = (error: unknown) => error instanceof Error ? error.message : "Request failed";
function Notice({ text }: { text: string }) { return text ? <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">{text}</p> : null; }
function label(row: Row) { return String(row.name ?? row.title ?? row.reference ?? row.caseId ?? row.memberRef ?? row.candidate ?? row.id); }

function RecordPicker({ entity, value, onChange }: { entity: string; value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/api/records/${entity}?q=${encodeURIComponent(query)}&page=${page}`).then(data => { if (active) { setRows(data.rows); setTotal(data.total); setError(""); } }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [entity, query, page]);
  return <div className="space-y-1"><Input aria-label={`Search ${entity}`} placeholder={`Search ${pretty(entity)}`} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/><select aria-label={`Select ${entity}`} className="w-full rounded border p-2" value={value} onChange={e => onChange(e.target.value)}><option value="">Select a record</option>{value && !rows.some(r => r.id === value) ? <option value={value}>{value} (selected)</option> : null}{rows.map(row => <option key={row.id} value={row.id}>{label(row)} · {row.id}</option>)}</select><div className="flex items-center gap-2 text-xs"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} · {total} records</span><button type="button" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</button></div><Notice text={error}/></div>;
}
function RecordField({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
  if (field.relation) return <RecordPicker entity={field.relation} value={value} onChange={onChange}/>;
  if (field.kind === "boolean") return <input aria-label={pretty(field.name)} type="checkbox" checked={value === "true"} onChange={e => onChange(String(e.target.checked))}/>;
  return <Input aria-label={pretty(field.name)} type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"} step={field.integer ? "1" : "any"} min={field.min} max={field.max} value={value} onChange={e => onChange(e.target.value)} required={field.required || Boolean(field.relation)}/>;
}
function EntityBlock({ entity, role, autoOpen }: { entity: string; role: string; autoOpen: boolean }) {
  const fields = recordMetadata[entity].fields;
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(autoOpen && canWrite(role));
  const [selected, setSelected] = useState<Row | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("edit");
  const [form, setForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(async () => {
    const data = await api(`/api/records/${entity}?page=${page}&q=${encodeURIComponent(query)}`);
    setRows(data.rows); setTotal(data.total);
  }, [entity, page, query]);
  useEffect(() => {
    let active = true;
    api(`/api/records/${entity}?page=${page}&q=${encodeURIComponent(query)}`).then(data => { if (active) { setRows(data.rows); setTotal(data.total); setError(""); } }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [entity, page, query]);
  function toForm(row: Row | null) {
    return Object.fromEntries(fields.map(f => [f.name, row?.[f.name] == null ? (f.kind === "boolean" ? "false" : "") : f.kind === "date" ? String(row[f.name]).slice(0, 10) : String(row[f.name])]));
  }
  function openRow(row: Row) {
    setSelected(row); setReason(""); setNotice(""); setError(""); setDeleting(false); setForm(toForm(row)); setMode("view"); setOpen(true);
  }
  function createRow() {
    setSelected(null); setReason(""); setNotice(""); setError(""); setDeleting(false); setForm(toForm(null)); setMode("edit"); setOpen(true);
  }
  function closeDialog() { if (!busy) { setOpen(false); setDeleting(false); setError(""); } }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(`/api/records/${entity}`, jsonRequest(selected ? "PUT" : "POST", { ...form, ...(selected ? { id: selected.id, updatedAt: selected.updatedAt } : {}) }));
      setOpen(false); setForm({}); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function destroy() {
    if (!selected) return; setBusy(true); setError("");
    try { await api(`/api/records/${entity}`, jsonRequest("DELETE", { id: selected.id, updatedAt: selected.updatedAt })); setOpen(false); setDeleting(false); await load(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function review() {
    if (!selected) return; setBusy(true); setError("");
    try {
      const data = await api(`/api/reviews/${entity}`, jsonRequest("POST", { id: selected.id, updatedAt: selected.updatedAt, reason }));
      setNotice(`${data.status}${data.verificationToken ? ` · Verification: ${location.origin}/api/verify/${data.verificationToken}` : ""}`); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  const canEdit = canWrite(role);
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{entities[entity].label} · {total} records</h2>
        {canEdit ? <Button onClick={createRow}>New record</Button> : <span>Read only</span>}
      </div>
      <Notice text={!open ? error : ""} />
      {canEdit ? <RecordImport entity={entity} onImported={load} /> : null}
      <div className="flex gap-3 text-sm"><a className="underline" href={`/api/export/${entity}?format=csv`}>Export CSV</a><a className="underline" href={`/api/export/${entity}?format=json`}>Export JSON</a></div>
      <Input aria-label="Search records" placeholder="Search records" value={query} onChange={e => { setQuery(e.target.value); setPage(1); setError(""); }} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr>{fields.slice(0, 5).map(f => <th key={f.name} className="p-2">{pretty(f.name)}</th>)}<th>Details</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr className="cursor-pointer border-t hover:bg-slate-50" key={row.id} onClick={() => openRow(row)}>
                {fields.slice(0, 5).map(f => <td key={f.name} className="max-w-64 truncate p-2">{String(row[f.name] ?? "—")}</td>)}
                <td><button type="button" className="underline" onClick={event => { event.stopPropagation(); openRow(row); }}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span><Button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button></div>
      <Dialog open={open} onClose={closeDialog} title={`${selected ? entities[entity].label : "New"} · ${selected ? selected.id : "record"}`}>
        <div className="space-y-4">
          <Notice text={error} />
          <Notice text={notice} />
          {selected && mode === "view" ? (
            <div className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                {fields.map(f => (
                  <div key={f.name}>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">{pretty(f.name)}</dt>
                    <dd className="text-sm text-slate-900">{form[f.name] === "" ? "—" : form[f.name]}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {canEdit ? <Button type="button" onClick={() => setMode("edit")}>Edit</Button> : null}
                {canEdit && canDelete(role) ? <Button type="button" variant="outline" className="text-red-600" onClick={() => setDeleting(true)} disabled={busy}>Delete</Button> : null}
                <Button type="button" variant="outline" onClick={closeDialog} disabled={busy}>Cancel</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={save} className="space-y-3">
              <fieldset disabled={!canEdit || busy} className="space-y-3">
                {fields.map(f => <label key={f.name} className="block space-y-1 text-sm"><span>{pretty(f.name)}{f.required || f.relation ? " *" : ""}</span><RecordField field={f} value={form[f.name] ?? (f.kind === "boolean" ? "false" : "")} onChange={value => setForm(prev => ({ ...prev, [f.name]: value }))} /></label>)}
              </fieldset>
              <div className="flex flex-wrap gap-2">
                {canEdit ? <Button type="submit" disabled={busy}>{busy ? "Saving…" : selected ? "Save changes" : "Create record"}</Button> : null}
                <Button type="button" variant="outline" onClick={() => selected ? setMode("view") : closeDialog()} disabled={busy}>Cancel</Button>
              </div>
            </form>
          )}
          {selected && mode === "view" && canEdit ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm">Approval requires two independent reviewers of the saved record. The last editor cannot approve. Approval records a human decision; external verification and submission require their own services.</p>
              <textarea aria-label="Review rationale" className="w-full rounded border p-2" placeholder="Evidence reviewed and decision rationale" value={reason} onChange={e => setReason(e.target.value)} />
              <Button type="button" onClick={review} disabled={busy || reason.trim().length < 20}>Record independent review</Button>
            </div>
          ) : null}
          {selected && deleting && canDelete(role) ? (
            <div className="space-y-2 border-t pt-3">
              <p>Permanently delete this record?</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={destroy}>Confirm permanent deletion</Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDeleting(false)}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}

function WorkflowBlock({ slug, role }: { slug: string; role: string }) {
  const config = workflows.find(w => w.slug === slug)!;
  const [input, setInput] = useState<Record<string, string>>({});
  const [subjectEntity, setSubjectEntity] = useState(Object.keys(entities)[0]);
  const [subjectId, setSubjectId] = useState("");
  const [evidenceEntity, setEvidenceEntity] = useState(Object.keys(entities)[0]);
  const [evidenceId, setEvidenceId] = useState("");
  const [artifactIds, setArtifactIds] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<{ entity: string; id: string }[]>([]);
  const [result, setResult] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasInput = Object.values(input).some(value => value.trim());
  const disabledReason = busy ? "Preparing your draft…" : !canWrite(role) ? "An administrator or manager account is required to generate drafts." : !hasInput ? "Enter details below or use an example button to enable draft generation." : "";
  const load = useCallback(async () => {
    const data = await api(`/api/analyses?workflow=${encodeURIComponent(slug)}`);
    setHistory(data.items.map((item: { id: string; result: Analysis; model: string }) => ({ ...item.result, id: item.id, model: item.model })));
  }, [slug]);
  useEffect(() => {
    let active = true;
    api(`/api/analyses?workflow=${encodeURIComponent(slug)}`).then(data => { if (active) setHistory(data.items.map((item: { id: string; result: Analysis; model: string }) => ({ ...item.result, id: item.id, model: item.model }))); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [slug]);
  async function fill(style: string) {
    setBusy(true); setError("");
    try { const data = await api(`/api/ai-inputs/${slug}`, jsonRequest("POST", {style, input, scope:{entity:subjectEntity,id:subjectId}, evidence})); setInput(data.input); setResult(null); } catch(e) {setError(message(e));} finally {setBusy(false);}
  }
  async function run() {
    setBusy(true); setError(""); setResult(null);
    try { const data = await api(`/api/ai/${slug}`, jsonRequest("POST", { input, scope: { entity: subjectEntity, id: subjectId }, evidence, artifactIds })); setResult(data.result); await load(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{config.title}</h2><p className="text-sm">Evidence-based draft assistance. Results are saved with their sources for review. External operations and calibrated risk or authenticity scores are not performed by a language model.</p><Notice text={error}/><p className="text-sm text-slate-600">Generate from the fields below. Selecting saved records is optional.</p><details className="space-y-3 rounded border p-3"><summary>Attach saved records and documents (optional)</summary><label className="block">Subject type<select className="ml-2 rounded border p-2" value={subjectEntity} onChange={e => { setSubjectEntity(e.target.value); setSubjectId(""); setEvidence([]); setArtifactIds([]); }}>{Object.keys(entities).map(name => <option key={name}>{name}</option>)}</select></label><RecordPicker entity={subjectEntity} value={subjectId} onChange={id => { setSubjectId(id); setEvidence([]); setArtifactIds([]); }}/><EvidenceUpload key={`${subjectEntity}:${subjectId}`} entity={subjectEntity} id={subjectId} onSelect={setArtifactIds}/><details className="rounded border p-3"><summary>Add related evidence from any page</summary><select aria-label="Evidence type" className="my-2 rounded border p-2" value={evidenceEntity} onChange={e => { setEvidenceEntity(e.target.value); setEvidenceId(""); }}>{Object.keys(entities).map(name => <option key={name}>{name}</option>)}</select><RecordPicker entity={evidenceEntity} value={evidenceId} onChange={setEvidenceId}/><Button disabled={!subjectId || !evidenceId || evidence.length >= 100} onClick={() => { if (!evidence.some(e => e.entity === evidenceEntity && e.id === evidenceId)) setEvidence([...evidence, { entity: evidenceEntity, id: evidenceId }]); }}>Add evidence</Button><ul>{evidence.map((e, i) => <li key={`${e.entity}:${e.id}`}>{e.entity}: {e.id} <button className="underline" onClick={() => setEvidence(evidence.filter((_, index) => index !== i))}>Remove</button></li>)}</ul></details></details><div className="flex flex-wrap gap-2">{[["concise","AI: Fill concise inputs"],["detailed","AI: Fill detailed inputs"],["gaps","AI: Identify missing inputs"]].map(([style,title])=><Button key={style} disabled={busy || !canWrite(role)} onClick={()=>fill(style)}>{title}</Button>)}</div><p className="text-xs text-slate-500">AI field suggestions use this workflow, your entered text and any selected records, and can replace all form fields. Review them before generating the final draft.</p><WorkflowExamples key={slug} workflow={slug} fields={config.fields} busy={busy} onFill={values => { setInput(values); setResult(null); setError(""); }}/><div className="grid gap-3 md:grid-cols-2">{config.fields.map(field => <label key={field} className="text-sm">{pretty(field)}<textarea aria-label={pretty(field)} className="block min-h-24 w-full rounded border p-2" value={input[field] ?? ""} onChange={e => setInput({ ...input, [field]: e.target.value })}/></label>)}</div><Button onClick={run} aria-describedby="draft-readiness" disabled={Boolean(disabledReason)}>{busy ? "Preparing draft…" : "Generate and save draft"}</Button><p id="draft-readiness" role="status" className="text-sm text-slate-600">{disabledReason || (subjectId ? "Ready to generate using entered fields and the selected saved record." : "Ready to generate from entered fields. No saved record is required.")}</p>
    {result ? <article className="space-y-3 rounded border p-4"><p className="text-xs">Saved draft {result.id} · {result.model}{typeof result.contextRows === "number" ? ` · ${result.contextRows} complete records supplied` : ""}</p><h3 className="font-semibold">{result.summary}</h3><ul className="list-disc pl-5">{result.findings.map((item, i) => <li key={i}>{item}</li>)}</ul><h4>Suggested actions</h4><ol className="list-decimal pl-5">{result.recommendations.map((item, i) => <li key={i}>{item}</li>)}</ol><h4>Evidence references</h4><ul>{result.citations.map(id => <li key={id}>{id}</li>)}</ul><h4>Claim excerpts</h4>{result.claims?.map((claim,i) => <blockquote key={i} className="border-l-2 pl-3"><p>{claim.claim}</p><p>“{claim.quote}”</p><cite>{claim.sourceId}</cite></blockquote>)}<h4>Limitations</h4><ul>{result.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></article> : null}<details><summary>Saved analysis history ({history.length}, newest 100)</summary>{history.map(item => <button className="block p-2 text-left underline" key={item.id} onClick={() => setResult(item)}>{item.id} · {item.summary.slice(0, 90)}</button>)}</details></section>;
}

function Workspace({ href }: { href: string }) {
  const params = useSearchParams();
  const page = pages.find(p => p.href === href)!;
  const selectedEntity = page.entities.includes(params.get("entity") || "") ? params.get("entity")! : page.entities[0];
  const selectedWorkflow = page.workflows.includes(params.get("workflow") || "") ? params.get("workflow")! : page.workflows[0];
  const [entity, setEntity] = useState(selectedEntity);
  const [workflow, setWorkflow] = useState(selectedWorkflow);
  const [mode, setMode] = useState(params.get("mode") === "analysis" && selectedWorkflow ? "analysis" : "records");
  const [role, setRole] = useState("ANALYST");
  const [error, setError] = useState("");
  useEffect(() => { api("/api/session").then(data => setRole(data.user.role)).catch(e => setError(message(e))); }, []);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">{page.label}</h1><Notice text={error}/><div className="flex flex-wrap gap-3"><Button onClick={() => setMode("records")}>Records</Button>{page.workflows.length ? <Button onClick={() => setMode("analysis")}>AI drafts</Button> : null}<select aria-label="Select workspace" className="rounded border p-2" value={mode === "records" ? entity : workflow} onChange={e => mode === "records" ? setEntity(e.target.value) : setWorkflow(e.target.value)}>{(mode === "records" ? page.entities : page.workflows).map(name => <option key={name} value={name}>{mode === "records" ? entities[name].label : workflows.find(w => w.slug === name)?.title}</option>)}</select></div>{mode === "records" ? <EntityBlock key={`${entity}:${role}`} entity={entity} role={role} autoOpen={params.get("new") === "1"}/> : <WorkflowBlock key={workflow} slug={workflow} role={role}/>}</div>;
}
function Inner({ href }: { href: string }) { const params = useSearchParams(); return <Workspace key={`${href}:${params.toString()}`} href={href}/>; }
export default function DomainPage({ href }: { href: string }) { return <Suspense fallback={<p>Loading…</p>}><Inner href={href}/></Suspense>; }
