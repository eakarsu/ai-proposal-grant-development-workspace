"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type WorkflowAnalysis = {
  id?: string;
  summary: string;
  findings: string[];
  recommendations: string[];
  citations?: string[];
  limitations?: string[];
  claims?: { claim: string; sourceId: string; quote: string }[];
  explanations?: { issue: string; reason: string; citations: string[] }[];
  model: string;
  contextRows?: number;
};

function reportText(result: WorkflowAnalysis, title: string) {
  return [
    title,
    result.summary,
    "Findings", ...result.findings.map(item => `• ${item}`),
    "Suggested actions", ...result.recommendations.map((item, index) => `${index + 1}. ${item}`),
    ...((result.citations?.length) ? ["Evidence references", ...result.citations] : []),
    ...(result.claims?.flatMap(claim => [claim.claim, `“${claim.quote}”`, `Source: ${claim.sourceId}`]) ?? []),
    ...(result.explanations?.flatMap(item => [item.issue, item.reason, `Sources: ${item.citations.join(", ")}`]) ?? []),
    ...((result.limitations?.length) ? ["Limitations", ...result.limitations] : []),
    `Model: ${result.model}`, ...(result.id ? [`Saved draft: ${result.id}`] : []),
  ].join("\n\n");
}

export default function WorkflowReport({ result, title, actions }: {
  result: WorkflowAnalysis; title: string; actions?: ReactNode;
}) {
  const [notice, setNotice] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(reportText(result, title)); setNotice("Report copied."); }
    catch { setNotice("Copy was unavailable. Use Download report to save the text."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([reportText(result, title)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article aria-label={`${title} report`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">OpenRouter report</p>
      <h3 className="mt-1 text-xl font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{result.summary}</p>
    </header>
    <div className="space-y-6 p-5">
      <section><h4 className="mb-3 font-semibold text-slate-900">Findings</h4>{result.findings.length ? <ul className="space-y-2">{result.findings.map((item, index) => <li key={index} className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{item}</li>)}</ul> : <p className="text-sm text-slate-500">No findings were returned.</p>}</section>
      <section><h4 className="mb-3 font-semibold text-slate-900">Suggested actions</h4>{result.recommendations.length ? <ol className="space-y-3">{result.recommendations.map((item, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-slate-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">{index + 1}</span><span>{item}</span></li>)}</ol> : <p className="text-sm text-slate-500">No actions were suggested.</p>}</section>
      {result.citations?.length ? <section><h4 className="mb-2 font-semibold text-slate-900">Evidence references</h4><ul className="flex flex-wrap gap-2">{result.citations.map((id, index) => <li key={`${id}:${index}`} className="break-all rounded border bg-slate-50 px-2 py-1 text-xs text-slate-600">{id}</li>)}</ul></section> : null}
      {result.claims?.length ? <section><h4 className="mb-3 font-semibold text-slate-900">Claim excerpts</h4><div className="space-y-3">{result.claims.map((claim, index) => <blockquote key={index} className="border-l-4 border-slate-200 pl-4 text-sm leading-6"><p className="font-medium text-slate-800">{claim.claim}</p><p className="mt-1 whitespace-pre-wrap text-slate-600">“{claim.quote}”</p><cite className="mt-1 block break-all text-xs text-slate-500">{claim.sourceId}</cite></blockquote>)}</div></section> : null}
      {result.explanations?.length ? <section><h4 className="mb-3 font-semibold text-slate-900">Source-linked exception explanations</h4><div className="space-y-3">{result.explanations.map((item, index) => <div key={index} className="rounded-lg border p-3 text-sm leading-6"><h5 className="font-semibold">{item.issue}</h5><p>{item.reason}</p><p className="mt-1 break-all text-xs text-slate-500">Sources: {item.citations.join(", ")}</p></div>)}</div></section> : null}
      {result.limitations?.length ? <section className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h4 className="mb-2 font-semibold text-amber-900">Limitations and review notes</h4><ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">{result.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section> : null}
    </div>
    <footer className="space-y-3 border-t border-slate-200 p-4">
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={copy}>Copy report</Button><Button type="button" variant="outline" size="sm" onClick={download}>Download report</Button>{actions}</div>
      {notice ? <p role="status" className="text-sm text-slate-600">{notice}</p> : null}
      <p className="break-all text-xs text-slate-500">{result.model}{result.id ? ` · Saved draft ${result.id}` : ""}{typeof result.contextRows === "number" ? ` · ${result.contextRows} complete records supplied` : ""}</p>
    </footer>
  </article>;
}
