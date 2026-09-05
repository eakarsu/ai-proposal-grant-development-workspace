"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import catalog from "@/config/workflow-examples.json";
type Example = { id: string; label: string; values: Record<string, string> };
export default function WorkflowExamples({ workflow, fields, busy, onFill }: {
  workflow: string; fields: string[]; busy: boolean; onFill: (values: Record<string, string>) => void;
}) {
  const [selected, setSelected] = useState("");
  const examples = (catalog as Record<string, Example[]>)[workflow] || [];
  function fill(example: Example) {
    onFill(Object.fromEntries(fields.map(field => [field, example.values[field] ?? ""])));
    setSelected(example.label);
  }
  return <section aria-label="AI workflow examples" className="space-y-2 rounded-lg border bg-slate-50 p-3">
    <h3 className="text-sm font-semibold">Fill AI fields with an example</h3>
    <p className="text-sm text-slate-600">Each scenario replaces every workflow input, including optional fields. You can edit the values before generating a draft.</p>
    <div className="flex flex-wrap gap-2">{examples.map(example => <Button key={example.id} type="button" disabled={busy} onClick={() => fill(example)} aria-label={`Fill example: ${example.label}`}>{example.label}</Button>)}<Button type="button" disabled={busy} onClick={() => { onFill({}); setSelected(""); }}>Clear fields</Button></div>
    {selected ? <p role="status" className="text-sm text-amber-800">Example loaded: {selected}. These are fictional sample inputs; review your edits and select the appropriate subject and evidence separately.</p> : null}
  </section>;
}
