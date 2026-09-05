"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
export default function EvidenceUpload({ entity, id, onSelect }: { entity: string; id: string; onSelect: (ids: string[]) => void }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [error, setError] = useState("");
  const [items, setItems] = useState<{ id: string; title: string; approvedBy: string | null }[]>([]); const [selected, setSelected] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{id:string;title:string;content:string;contentHash:string} | null>(null);
  async function readSource(sourceId:string) {
    setBusy(true); setError(""); setPreview(null);
    try { const response=await fetch(`/api/artifacts?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}&sourceId=${encodeURIComponent(sourceId)}`); const data=await response.json(); if(!response.ok) throw new Error(data.error); setPreview(data.item); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not read source"); } finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/artifacts?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`).then(async r => { if (!r.ok) throw new Error("Could not load source artifacts"); return r.json(); }).then(d => { if (active) setItems(d.items); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [entity, id]);
  async function action(method: "POST" | "PUT", body: unknown) {
    setBusy(true); setError("");
    try { const r = await fetch("/api/artifacts", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error);
      const list = await fetch(`/api/artifacts?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`); if (!list.ok) throw new Error("Saved, but could not refresh sources"); setItems((await list.json()).items);
    } catch (e) { setError(e instanceof Error ? e.message : "Source operation failed"); } finally { setBusy(false); }
  }
  return <details className="space-y-3 rounded border p-3"><summary>Source documents and transcripts</summary><p className="text-sm">Upload text, CSV, JSON, or Markdown extracted from the source. Content is retained in full with its hash. Binary documents require extraction before upload.</p><input aria-label="Source file" type="file" accept=".txt,.csv,.json,.md" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 100000) { setError("Maximum source size is 100 KB"); return; } setTitle(file.name); setContent(await file.text()); }}/><input aria-label="Source title" className="block w-full rounded border p-2" placeholder="Source title" value={title} onChange={e => setTitle(e.target.value)}/><textarea aria-label="Source content" className="block min-h-32 w-full rounded border p-2" value={content} onChange={e => setContent(e.target.value)}/><Button disabled={!id || busy || !title.trim() || !content.trim()} onClick={() => action("POST", { entity, id, title, content })}>Store source text</Button><p className="text-sm">Select stored sources to supply to the model. Approved-source drafting requires a reviewer other than the uploader.</p>{items.map(item => <div key={item.id} className="flex gap-3"><label><input type="checkbox" checked={selected.includes(item.id)} onChange={e => { const next = e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id); setSelected(next); onSelect(next); }}/> {item.title} · {item.approvedBy ? "Reviewed source" : "Unreviewed source"}</label><button disabled={busy} className="underline" onClick={() => readSource(item.id)}>Read stored source</button>{!item.approvedBy ? <button disabled={busy || preview?.id !== item.id} className="underline" onClick={() => action("PUT", { id: item.id, expectedHash: preview?.contentHash })}>Approve source</button> : null}</div>)}{preview ? <section className="rounded border p-3"><h3>{preview.title}</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words">{preview.content}</pre><p className="break-all text-xs">Source SHA-256: {preview.contentHash}</p></section> : null}{error ? <p role="alert">{error}</p> : null}</details>;
}
