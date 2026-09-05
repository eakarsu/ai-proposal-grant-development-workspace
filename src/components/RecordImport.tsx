"use client";
import { useState } from "react";
import { recordMetadata } from "@/lib/record-policy";
import { Button } from "@/components/ui/button";
export default function RecordImport({ entity, onImported }: { entity: string; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function upload() {
    if (!file) return; setBusy(true); setMessage("");
    try { const rows = JSON.parse(await file.text()); if (!Array.isArray(rows)) throw new Error("Upload an array of records"); const r = await fetch(`/api/import/${entity}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setMessage(`Imported ${d.ids.length} records. Dataset ${d.fingerprint}`); await onImported(); } catch (e) { setMessage(e instanceof Error ? e.message : "Import failed"); } finally { setBusy(false); }
  }
  function template() { const row = Object.fromEntries(recordMetadata[entity].fields.map(f => [f.name, f.relation ? `REQUIRED: existing ${f.relation} id` : f.kind === "number" ? 0 : f.kind === "boolean" ? false : f.kind === "date" ? null : f.name === "status" ? "Draft" : ""])); const url = URL.createObjectURL(new Blob([JSON.stringify([row], null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `${entity}-import-template.json`; a.click(); URL.revokeObjectURL(url); }
  return <details className="rounded border p-3"><summary>Import source records</summary><p className="py-2 text-sm">Upload a JSON dataset using the template. Up to 500 rows / 1 MB. All rows are validated before import; a failed import changes no records.</p><div className="flex flex-wrap gap-2"><Button onClick={template}>Download template</Button><input type="file" aria-label="Record import file" accept=".json" onChange={e => setFile(e.target.files?.[0] ?? null)}/><Button disabled={busy || !file || file.size > 1000000} onClick={upload}>{busy ? "Importing…" : "Import validated rows"}</Button></div>{message ? <p role="status" className="break-words">{message}</p> : null}</details>;
}
