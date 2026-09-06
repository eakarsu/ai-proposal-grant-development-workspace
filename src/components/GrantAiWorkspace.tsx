"use client";
import { useState, useEffect, useCallback } from "react";
import { useMutationFetch } from "@/hooks/use-mutation-fetch";
type Source = { id: string; title: string; approvedBy: string | null };
type Draft = {
  id: string;
  task: string;
  status: string;
  baseVersion: number;
  error: string | null;
  providerRef: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: string | null;
  reviewNotes: string | null;
  output: {
    title: string;
    content: string;
    issues: string[];
    limitations: string[];
    citations: { sourceId: string; chunkId: string; quote: string }[];
  } | null;
  sourceSnapshot: unknown;
};
type View = {
  drafts: Draft[];
  canGenerate: boolean;
  configured: boolean;
  usage: {
    requests: number;
    reportedCostUsd: string | null;
    unreportedCost: number;
  };
};
const button = "border rounded px-3 py-2 disabled:opacity-50",
  input = "border rounded p-2 w-full";
export default function GrantAiWorkspace({
  projectId,
  version,
  sections,
  sources,
  dirty,
  onApplied,
}: {
  projectId: string;
  version: number;
  sections: { id: string; title: string }[];
  sources: Source[];
  dirty: boolean;
  onApplied: () => Promise<unknown>;
}) {
  const [data, setData] = useState<View | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [task, setTask] = useState("DRAFT_SECTION"),
    [sectionId, setSection] = useState(""),
    [sourceIds, setSources] = useState<string[]>([]),
    [instructions, setInstructions] = useState(""),
    [sharing, setSharing] = useState(false),
    [notes, setNotes] = useState("");
  const mutate = useMutationFetch(),
    url = `/api/grants/projects/${projectId}/ai`;
  const load = useCallback(async () => {
    try {
      const r = await fetch(url),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setData(j);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drafts unavailable");
    }
  }, [url]);
  useEffect(() => {
    let cancelled=false;
    void fetch(url).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error);if(!cancelled){setData(result);setError("");}}).catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:"Drafts unavailable");});
    return ()=>{cancelled=true;};
  }, [url]);
  async function send(body: unknown, method = "POST") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await mutate(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      await load();
      if (j.status === "APPLIED") await onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border rounded bg-white p-5 space-y-4">
      <h2 className="text-xl font-semibold">AI drafting and review</h2>
      <p>
        Choose independently approved evidence. Generated text stays separate
        until you review and apply it. Proposal approval remains a separate
        independent review.
      </p>
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      {dirty && (
        <p>Save or discard your edits before generating or applying drafts.</p>
      )}
      {data && (
        <p>
          Organization today: {data.usage.requests} requests · reported cost $
          {data.usage.reportedCostUsd || "0"} · {data.usage.unreportedCost}{" "}
          without reported cost. Reported usage limits do not guarantee the
          provider&apos;s final bill.
        </p>
      )}
      <button className={button} onClick={load}>
        Refresh drafts
      </button>
      {data?.canGenerate && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send({
              task,
              sectionId: sectionId || undefined,
              sourceIds,
              instructions,
              expectedVersion: version,
              sharingConfirmed: sharing,
            });
          }}
        >
          <label className="block">
            Task
            <select
              className={input}
              value={task}
              onChange={(e) => setTask(e.target.value)}
            >
              {[
                ["DRAFT_SECTION", "Draft a section"],
                ["REWRITE_SECTION", "Rewrite a section"],
                ["REQUIREMENT_REVIEW", "Review requirements"],
                ["BUDGET_REVIEW", "Review budget"],
                ["PROPOSAL_REVIEW", "Review proposal"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Section
            <select
              className={input}
              value={sectionId}
              required={task.endsWith("SECTION")}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="">Choose a section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="border rounded p-3">
            <legend>Approved sources</legend>
            {sources
              .filter((s) => s.approvedBy)
              .map((s) => (
                <label className="block" key={s.id}>
                  <input
                    type="checkbox"
                    checked={sourceIds.includes(s.id)}
                    onChange={(e) =>
                      setSources((ids) =>
                        e.target.checked
                          ? [...ids, s.id]
                          : ids.filter((id) => id !== s.id),
                      )
                    }
                  />{" "}
                  {s.title}
                </label>
              ))}
            {!sources.some((s) => s.approvedBy) && (
              <p>
                Upload evidence and have a different reviewer approve it first.
              </p>
            )}
          </fieldset>
          <label className="block">
            Instructions
            <textarea
              className={input}
              required
              minLength={5}
              maxLength={5000}
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          <label className="block">
            <input
              type="checkbox"
              required
              checked={sharing}
              onChange={(e) => setSharing(e.target.checked)}
            />{" "}
            I am authorized to share this project text and selected source
            evidence with the configured AI provider.
          </label>
          {!data.configured && (
            <p>Configure the AI provider and model to generate drafts.</p>
          )}
          <button
            className={button}
            disabled={busy || dirty || !data.configured || !sourceIds.length}
          >
            Generate saved draft
          </button>
        </form>
      )}
      <label className="block">
        Review notes
        <textarea
          className={input}
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Explain your review before applying, rejecting or cancelling."
        />
      </label>
      {data?.drafts.map((d) => (
        <article key={d.id} className="border-t pt-4 space-y-3">
          <h3 className="font-semibold">
            {d.output?.title || d.task} · {d.status}
          </h3>
          <p>
            Based on proposal version {d.baseVersion}.{" "}
            {d.model || "Model not reported"} · tokens{" "}
            {d.inputTokens ?? "unknown"} / {d.outputTokens ?? "unknown"} ·
            reported cost {d.costUsd ?? "unknown"}
          </p>
          {d.error && <p className="text-red-800">{d.error}</p>}
          {d.output && (
            <>
              <pre className="font-sans whitespace-pre-wrap">
                {d.output.content}
              </pre>
              <ul className="list-disc pl-5">
                {[...d.output.issues, ...d.output.limitations].map(
                  (issue, i) => (
                    <li key={i}>{issue}</li>
                  ),
                )}
              </ul>
              <details>
                <summary>Exact quoted citations</summary>
                {d.output.citations.map((c, i) => (
                  <blockquote className="border-l pl-3 my-2" key={i}>
                    {c.quote}
                    <footer>
                      {c.sourceId} · {c.chunkId}
                    </footer>
                  </blockquote>
                ))}
              </details>
            </>
          )}
          <details>
            <summary>Source snapshot and provider receipt</summary>
            <p>{d.providerRef || "No confirmed provider receipt"}</p>
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(d.sourceSnapshot, null, 2)}
            </pre>
          </details>
          {d.reviewNotes && <p>Review: {d.reviewNotes}</p>}
          {data.canGenerate && (
            <div className="flex gap-2 flex-wrap">
              {d.status === "DRAFT" && (
                <>
                  {d.task.endsWith("SECTION") && (
                    <button
                      className={button}
                      disabled={
                        busy ||
                        dirty ||
                        notes.trim().length < 5 ||
                        d.baseVersion !== version
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            "Replace the saved section with this reviewed draft and its citations?",
                          )
                        )
                          void send(
                            {
                              id: d.id,
                              action: "APPLY",
                              expectedVersion: version,
                              notes,
                              reviewConfirmed: true,
                            },
                            "PATCH",
                          );
                      }}
                    >
                      Apply reviewed section
                    </button>
                  )}
                  <button
                    className={button}
                    disabled={busy || notes.trim().length < 5}
                    onClick={() =>
                      send(
                        {
                          id: d.id,
                          action: "REJECT",
                          expectedVersion: version,
                          notes,
                          reviewConfirmed: true,
                        },
                        "PATCH",
                      )
                    }
                  >
                    Reject draft
                  </button>
                </>
              )}
              {["PENDING", "RUNNING", "UNKNOWN"].includes(d.status) && (
                <button
                  className={button}
                  disabled={busy || notes.trim().length < 5}
                  onClick={() =>
                    send(
                      {
                        id: d.id,
                        action: "CANCEL",
                        expectedVersion: version,
                        notes,
                        reviewConfirmed: true,
                      },
                      "PATCH",
                    )
                  }
                >
                  Cancel request
                </button>
              )}
            </div>
          )}
        </article>
      ))}
      <p>
        Cancelling an in-flight request cannot guarantee that the provider stops
        processing or billing it. Unknown requests are never automatically
        regenerated.
      </p>
    </section>
  );
}
