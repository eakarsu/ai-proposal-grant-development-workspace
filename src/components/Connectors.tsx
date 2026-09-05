"use client";
import { useEffect, useState } from "react";
import { entities } from "@/config/app";
import { Button } from "@/components/ui/button";
export default function Connectors() {
  const [items, setItems] = useState<{ id: string; label: string; actions: string[] }[]>([]); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [entity, setEntity] = useState(Object.keys(entities)[0]); const [id, setId] = useState("");
  useEffect(() => { fetch("/api/connectors").then(async r => { if (!r.ok) throw new Error("Could not load connector configuration"); return r.json(); }).then(data => setItems(data.connectors)).catch(e => setMessage(e.message)); }, []);
  async function run(connectorId: string, action: string) {
    setBusy(true); setMessage("");
    try { const r = await fetch("/api/connectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectorId, action, entity, id }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || d.message); setMessage(JSON.stringify(d)); } catch (e) { setMessage(e instanceof Error ? e.message : "Connector request failed"); } finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">External operations</h2><p>Actions require a configured service and two independent reviews of the saved record. A completion receipt is retained for each execution.</p>{!items.length ? <p>No services are configured. Submissions, external verification, and telemetry imports are unavailable.</p> : <><select aria-label="External operation record type" value={entity} onChange={e => setEntity(e.target.value)}>{Object.keys(entities).map(e => <option key={e}>{e}</option>)}</select><input aria-label="Approved record id" className="rounded border p-2" placeholder="Approved record id" value={id} onChange={e => setId(e.target.value)}/>{items.map(c => <div key={c.id} className="flex flex-wrap gap-2"><strong>{c.label}</strong><Button disabled={busy} onClick={() => run(c.id, "test")}>Test connection</Button>{c.actions.map(a => <Button key={a} disabled={busy || !id} onClick={() => run(c.id, a)}>{a}</Button>)}</div>)}</>}{message ? <p role="status" className="break-words">{message}</p> : null}</section>;
}
