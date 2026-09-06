"use client";
import { useState } from "react";
import { z } from "zod";
import { citationSchema, SourceChunk } from "@/lib/grants/document";
type Citation = z.infer<typeof citationSchema>;
type Source = {
  id: string;
  title: string;
  chunks: unknown;
  approvedBy: string | null;
};
export default function GrantCitationEditor({
  value,
  sources,
  onChange,
}: {
  value: Citation[];
  sources: Source[];
  onChange: (value: Citation[]) => void;
}) {
  const [sourceId, setSourceId] = useState(""),
    [chunkId, setChunkId] = useState(""),
    [quote, setQuote] = useState("");
  const source = sources.find((s) => s.id === sourceId),
    chunks = (source?.chunks ?? []) as SourceChunk[],
    chunk = chunks.find((c) => c.id === chunkId);
  return (
    <div className="border rounded p-3 space-y-2">
      <strong className="text-sm">Evidence citations</strong>
      {value.map((c, i) => (
        <div key={i} className="text-sm border-b pb-2">
          <p>
            {sources.find((s) => s.id === c.sourceId)?.title ?? c.sourceId} ·{" "}
            {c.chunkId}
          </p>
          <blockquote>{c.quote}</blockquote>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, n) => n !== i))}
            className="underline"
          >
            Remove citation
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <label>
          Source
          <select
            className="block border rounded p-2 max-w-72"
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setChunkId("");
              setQuote("");
            }}
          >
            <option value="">Select source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {s.approvedBy ? "approved" : "unreviewed"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select
            className="block border rounded p-2 max-w-60"
            value={chunkId}
            onChange={(e) => {
              setChunkId(e.target.value);
              setQuote("");
            }}
          >
            <option value="">Select page / paragraph</option>
            {chunks.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {chunk && (
        <details>
          <summary>Inspect source passage</summary>
          <pre className="whitespace-pre-wrap max-h-64 overflow-y-auto text-sm">
            {chunk.text}
          </pre>
        </details>
      )}
      <label className="block">
        Exact supporting quote
        <textarea
          maxLength={2000}
          className="block border rounded p-2 w-full"
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="border rounded p-2"
        disabled={!chunk || !quote.trim() || !chunk.text.includes(quote.trim())}
        onClick={() => {
          onChange([...value, { sourceId, chunkId, quote: quote.trim() }]);
          setQuote("");
        }}
      >
        Add citation
      </button>
    </div>
  );
}
