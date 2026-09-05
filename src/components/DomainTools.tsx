"use client";
import { useState } from "react";
import catalog from "@/config/domain-tools.json";
import { pretty } from "@/lib/utils";
import { Button } from "@/components/ui/button";
type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
function empty(schema: Value): Value {
  if (Array.isArray(schema)) return [];
  if (schema && typeof schema === "object") return Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, empty(v)]));
  return typeof schema === "boolean" ? false : "";
}
function Editor({ name, schema, value, onChange }: { name: string; schema: Value; value: Value; onChange: (value: Value) => void }) {
  if (Array.isArray(schema)) {
    const values = Array.isArray(value) ? value : [];
    return <fieldset className="space-y-3 rounded border p-3"><legend>{pretty(name)}</legend>{values.map((item, index) => <div key={index} className="space-y-2 border-b pb-2"><Editor name={`${name} ${index + 1}`} schema={schema[0]} value={item} onChange={next => onChange(values.map((v, i) => i === index ? next : v))}/><button type="button" className="text-sm underline" onClick={() => onChange(values.filter((_, i) => i !== index))}>Remove row</button></div>)}<Button type="button" onClick={() => onChange([...values, empty(schema[0])])}>Add row</Button></fieldset>;
  }
  if (schema && typeof schema === "object") {
    const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return <div className="grid gap-3 md:grid-cols-2">{Object.entries(schema).map(([key, s]) => <Editor key={key} name={key} schema={s} value={object[key] ?? empty(s)} onChange={next => onChange({ ...object, [key]: next })}/>)}</div>;
  }
  return <label className="block text-sm">{pretty(name)}{typeof schema === "boolean" ? <input type="checkbox" className="ml-2" checked={value === true} onChange={e => onChange(e.target.checked)}/> : <input required className="mt-1 block w-full rounded border p-2" type={typeof schema === "number" ? "number" : "text"} step="any" value={String(value ?? "")} onChange={e => onChange(e.target.value)}/>}</label>;
}
function Calculator({ tool }: { tool: { id: string; title: string; description: string; example: Value } }) {
  const [input, setInput] = useState<Value>(empty(tool.example));
  const [sample, setSample] = useState(false);
  const [result, setResult] = useState<Value | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function calculate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: tool.id, input, isExample: sample }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Calculation failed"); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{tool.title}</h2><p>{tool.description}</p><div className="flex gap-3"><Button onClick={() => { setInput(tool.example); setSample(true); setResult(null); }}>Load example</Button><Button onClick={() => { setInput(empty(tool.example)); setSample(false); setResult(null); }}>Clear</Button></div>{sample ? <p className="rounded bg-amber-50 p-2">Example dataset loaded. Results describe these demonstration inputs.</p> : null}<form onSubmit={calculate} className="space-y-4"><Editor name="Inputs" schema={tool.example} value={input} onChange={setInput}/><Button disabled={busy} type="submit">{busy ? "Calculating…" : "Calculate and save"}</Button></form>{error ? <p role="alert">{error}</p> : null}{result ? <div className="space-y-3"><h3 className="font-semibold">Saved calculation</h3><Result value={result}/><Button onClick={() => { const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${tool.id}-result.json`; a.click(); URL.revokeObjectURL(url); }}>Download result and provenance</Button></div> : null}</section>;
}
function Result({ value }: { value: Value }) {
  if (Array.isArray(value)) return <ol className="space-y-2">{value.map((item, i) => <li key={i} className="border-l-2 pl-3"><Result value={item}/></li>)}</ol>;
  if (value && typeof value === "object") {
    if ("cells" in value && Array.isArray(value.cells)) return <div className="grid gap-2 md:grid-cols-3">{value.cells.map((item, i) => { const cell = item as {student: string; metric: string; mean: number}; return <div key={i} className="rounded border p-4" style={{ backgroundColor: `hsl(${Number(cell.mean) * 1.2} 65% 90%)` }}><strong>{cell.student}</strong><p>{cell.metric}: {cell.mean}</p></div>; })}</div>;
    return <dl className="space-y-2">{Object.entries(value).map(([k, v]) => <div key={k}><dt className="text-sm font-semibold">{pretty(k)}</dt><dd className="break-words pl-2"><Result value={v}/></dd></div>)}</dl>;
  }
  return <span>{value === null ? "Not assessed / not applicable" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</span>;
}
export default function DomainTools() {
  const [id, setId] = useState(catalog[0]?.id || "");
  const tool = catalog.find(t => t.id === id);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Domain tools</h1><p>Reproducible calculations from supplied records. Units, assumptions, and limits are included with the saved result.</p><select className="rounded border p-2" aria-label="Domain tool" value={id} onChange={e => setId(e.target.value)}>{catalog.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>{tool ? <Calculator key={tool.id} tool={tool as unknown as { id: string; title: string; description: string; example: Value }}/> : null}</div>;
}
