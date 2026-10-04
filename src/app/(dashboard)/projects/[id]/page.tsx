"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useMutationFetch } from "@/hooks/use-mutation-fetch";
import {
  GrantDocument,
  emptyDocument,
  wordCount,
  calculateBudget,
} from "@/lib/grants/document";
import type { ProposalSnapshot } from "@/lib/grants/export";
import GrantAiWorkspace from "@/components/GrantAiWorkspace";
import ReceiptFiles from "@/components/GrantReceiptFiles";
import CitationEditor from "@/components/GrantCitationEditor";
import GrantBillingWorkspace from "@/components/GrantBillingWorkspace";
type Project = {
  id: string;
  organizationId: string;
  title: string;
  funder: string;
  program: string;
  dueAt: string | null;
  currency: string;
  status: string;
  version: number;
  document: GrantDocument;
};
type View = {
  project: Project;
  role: string;
  content: ProposalSnapshot;
  contentHash: string;
  readiness: string[];
  members: { id: string; name: string; email: string; role: string }[];
  reviews: {
    id: string;
    reviewerId: string;
    approved: boolean;
    reason: string;
    contentHash: string;
  }[];
  revisions: {
    id: string;
    version: number;
    reason: string;
    actorId: string;
    createdAt: string;
  }[];
  packages: {
    id: string;
    projectVersion: number;
    createdAt: string;
    submittedAt: string | null;
    receiptReference: string | null;
  }[];
  comments: { id: string; actorId: string; body: string; createdAt: string }[];
};
const button = "border rounded px-3 py-2 disabled:opacity-50",
  inputClass = "border rounded p-2 w-full";
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (s: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className={inputClass}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Text({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      {label}
      <textarea
        className={inputClass}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    mutate = useMutationFetch();
  const [view, setView] = useState<View | null>(null),
    [form, setForm] = useState<Project | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState("Overview"),
    [reason, setReason] = useState(""),
    [comment, setComment] = useState(""),
    [mentionIds, setMentionIds] = useState<string[]>([]),
    [attachmentIds, setAttachmentIds] = useState<string[]>([]),
    [selectedVersion, setSelectedVersion] = useState<ProposalSnapshot | null>(
      null,
    ),
    [uploadTitle, setUploadTitle] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [reviewReason, setReviewReason] = useState("");
  const base = "/api/grants/projects/" + encodeURIComponent(id);
  async function load() {
    const r = await fetch(base),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    setView(d);
    setForm(d.project);
    setDirty(false);
    return d as View;
  }
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const r = await fetch("/api/grants/projects/" + encodeURIComponent(id)),
          d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!ignore) {
          setView(d);
          setForm(d.project);
        }
      } catch (e) {
        if (!ignore) setError(String(e));
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id]);
  const editable =
      !!view &&
      ["OWNER", "MANAGER", "EDITOR"].includes(view.role) &&
      view.project.status === "DRAFT",
    manager = !!view && ["OWNER", "MANAGER"].includes(view.role),
    reviewer = !!view && ["OWNER", "MANAGER", "REVIEWER"].includes(view.role);
  const document = form?.document ?? emptyDocument,
    person = (userId: string) =>
      view?.members?.find((m) => m.id === userId)?.name ?? userId;
  function changeDocument(next: GrantDocument) {
    if (!form) return;
    setForm({ ...form, document: next });
    setDirty(true);
  }
  async function act(
    path: string,
    method: string,
    payload: object,
    success = "Saved",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await mutate(base + path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMessage(success);
      await load();
      return d;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!form) return;
    await act(
      "",
      "PUT",
      {
        title: form.title,
        funder: form.funder,
        program: form.program,
        dueAt: form.dueAt,
        currency: form.currency,
        document: form.document,
        expectedVersion: view!.project.version,
        reason,
      },
      "Proposal revision saved",
    );
  }
  const [supersedesId,setSupersedesId]=useState("");
  async function upload() {
    if (!file || !view) return;
    if(supersedesId&&!window.confirm("Replace this source with a new retained version? The prior approval will be revoked; update citations and obtain a new independent review."))return;
    setBusy(true);
    setError("");
    try {
      const type = file.name.toLowerCase().endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : file.name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "text/plain";
      const r = await mutate(base + "/sources", {
          method: "POST",
          headers: {
            "Content-Type": type,
            "X-File-Name": encodeURIComponent(file.name),
            "X-Source-Title": encodeURIComponent(uploadTitle || file.name),
            ...(supersedesId?{"X-Supersedes-Source":supersedesId}:{}),
            "X-Project-Version": String(view.project.version),
          },
          body: await file.arrayBuffer(),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMessage(
        "Source extracted. Inspect the text and obtain independent approval.",
      );
      setFile(null);
      setUploadTitle("");
      setSupersedesId("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function previewVersion(version: number) {
    try {
      const r = await fetch(base + "/versions?version=" + version),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSelectedVersion(d.snapshot);
    } catch (e) {
      setError(String(e));
    }
  }
  if (!view || !form)
    return (
      <div>
        {error ? <p role="alert">{error}</p> : <p>Loading proposal…</p>}
        <Link href="/projects">Back to projects</Link>
      </div>
    );
  if (view.role === "CLIENT")
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">{view.project.title}</h1>
        <p>{view.project.status}</p>
        <p>Your approved proposal packages:</p>
        {view.packages.map((p) => (
          <div key={p.id} className="border rounded p-4">
            Version {p.projectVersion} ·{" "}
            {new Date(p.createdAt).toLocaleString()}{" "}
            {(["pdf", "docx", "zip"] as const).map((format) => (
              <a
                key={format}
                className="underline ml-4"
                href={`${base}/packages?packageId=${p.id}&format=${format}`}
              >
                {format.toUpperCase()}
              </a>
            ))}
          </div>
        ))}
        <Link href="/projects" className="underline">
          Back to projects
        </Link>
      </div>
    );
  let budget: ReturnType<typeof calculateBudget> | null = null;
  try {
    budget = calculateBudget(document);
  } catch {}
  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Link href="/projects" className="underline text-sm">
            Grant projects
          </Link>
          <h1 className="text-3xl font-bold">{view.project.title}</h1>
          <p>
            {view.project.funder} · {view.project.status} · Version{" "}
            {view.project.version} · {view.role}
          </p>
        </div>
        <button
          className={button}
          disabled={busy || dirty}
          onClick={() => load().catch((e) => setError(String(e)))}
        >
          Reload
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="border border-red-300 rounded p-3 text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="border rounded p-3">
          {message}
        </p>
      )}
      {dirty && (
        <p className="text-amber-800">
          Unsaved edits. Save this revision before reviewing, uploading sources
          or freezing the package.
        </p>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Proposal sections">
        {[
          "Overview",
          "Sections",
          "Requirements",
          "Budget",
          "Sources",
          "AI drafts",
          ...(["OWNER", "MANAGER", "EDITOR"].includes(view.role)
            ? ["Client & billing"]
            : []),
          "Tasks",
          "Reviews & export",
          "Versions",
        ].map((name) => (
          <button
            key={name}
            className={
              button +
              " " +
              (tab === name ? "bg-slate-900 text-white" : "bg-white")
            }
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === "AI drafts" && <GrantAiWorkspace projectId={id} version={view.project.version} sections={view.content.document.sections} sources={view.content.sources} dirty={dirty} onApplied={load}/>}
      {tab === "Client & billing" && <GrantBillingWorkspace projectId={id} />}
      <fieldset disabled={busy || !editable} className="space-y-4">
        {tab === "Overview" && (
          <div className="bg-white border rounded p-5 space-y-4">
            <h2 className="text-xl font-semibold">Proposal details</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {(["title", "funder", "program", "currency"] as const).map(
                (k) => (
                  <Field
                    key={k}
                    label={k}
                    value={form[k]}
                    onChange={(v) => {
                      setForm({ ...form, [k]: v });
                      setDirty(true);
                    }}
                  />
                ),
              )}
            </div>
            <Field
              label="Deadline (ISO timestamp with timezone)"
              value={form.dueAt ?? ""}
              onChange={(v) => {
                setForm({ ...form, dueAt: v || null });
                setDirty(true);
              }}
            />
            <Text
              label="Organization narrative"
              value={document.organizationNarrative}
              onChange={(v) =>
                changeDocument({ ...document, organizationNarrative: v })
              }
            />
            <Text
              label="Requested outcomes and commitments"
              value={document.requestedOutcome}
              onChange={(v) =>
                changeDocument({ ...document, requestedOutcome: v })
              }
            />
          </div>
        )}
        {tab === "Sections" && (
          <div className="space-y-4">
            {document.sections.map((section, index) => (
              <section
                key={section.id}
                className="border rounded p-5 space-y-3 bg-white"
              >
                <div className="flex justify-between">
                  <h2 className="font-semibold">
                    Section {index + 1} · {wordCount(section.content)} words
                  </h2>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      changeDocument({
                        ...document,
                        sections: document.sections.filter(
                          (s) => s.id !== section.id,
                        ),
                        requirements: document.requirements.map((r) => ({
                          ...r,
                          sectionIds: r.sectionIds.filter(
                            (id) => id !== section.id,
                          ),
                        })),
                      })
                    }
                  >
                    Remove section
                  </button>
                </div>
                <Field
                  label="Heading"
                  value={section.title}
                  onChange={(v) =>
                    changeDocument({
                      ...document,
                      sections: document.sections.map((s) =>
                        s.id === section.id ? { ...s, title: v } : s,
                      ),
                    })
                  }
                />
                <Field
                  label="Word limit (0 means no limit)"
                  value={section.wordLimit}
                  type="number"
                  onChange={(v) =>
                    changeDocument({
                      ...document,
                      sections: document.sections.map((s) =>
                        s.id === section.id
                          ? { ...s, wordLimit: Number(v) }
                          : s,
                      ),
                    })
                  }
                />
                <Text
                  label="Proposal text"
                  rows={12}
                  value={section.content}
                  onChange={(v) =>
                    changeDocument({
                      ...document,
                      sections: document.sections.map((s) =>
                        s.id === section.id ? { ...s, content: v } : s,
                      ),
                    })
                  }
                />
                <CitationEditor
                  sources={view.content.sources}
                  value={section.citations}
                  onChange={(citations) =>
                    changeDocument({
                      ...document,
                      sections: document.sections.map((s) =>
                        s.id === section.id ? { ...s, citations } : s,
                      ),
                    })
                  }
                />
              </section>
            ))}
            <button
              type="button"
              className={button}
              onClick={() =>
                changeDocument({
                  ...document,
                  sections: [
                    ...document.sections,
                    {
                      id: crypto.randomUUID(),
                      title: "New section",
                      content: "",
                      wordLimit: 0,
                      citations: [],
                    },
                  ],
                })
              }
            >
              Add section
            </button>
          </div>
        )}
        {tab === "Requirements" && (
          <div className="space-y-4">
            {document.requirements.map((row) => (
              <section
                key={row.id}
                className="border rounded p-5 space-y-3 bg-white"
              >
                <Text
                  label="Solicitation requirement or eligibility rule"
                  value={row.text}
                  onChange={(text) =>
                    changeDocument({
                      ...document,
                      requirements: document.requirements.map((r) =>
                        r.id === row.id
                          ? {
                              ...r,
                              text,
                              decision: "UNREVIEWED",
                              reviewedBy: null,
                            }
                          : r,
                      ),
                    })
                  }
                />
                <fieldset>
                  <legend>Response sections</legend>
                  {document.sections.map((s) => (
                    <label key={s.id} className="block">
                      <input
                        type="checkbox"
                        checked={row.sectionIds.includes(s.id)}
                        onChange={(e) =>
                          changeDocument({
                            ...document,
                            requirements: document.requirements.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    sectionIds: e.target.checked
                                      ? [...r.sectionIds, s.id]
                                      : r.sectionIds.filter(
                                          (id) => id !== s.id,
                                        ),
                                  }
                                : r,
                            ),
                          })
                        }
                      />{" "}
                      {s.title}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Human decision
                  <select
                    className={inputClass}
                    value={row.decision}
                    onChange={(e) =>
                      changeDocument({
                        ...document,
                        requirements: document.requirements.map((r) =>
                          r.id === row.id
                            ? {
                                ...r,
                                decision: e.target.value as typeof r.decision,
                              }
                            : r,
                        ),
                      })
                    }
                  >
                    {[
                      "UNREVIEWED",
                      "SATISFIED",
                      "NOT_APPLICABLE",
                      "BLOCKED",
                    ].map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <Text
                  label="Decision rationale"
                  value={row.rationale}
                  onChange={(rationale) =>
                    changeDocument({
                      ...document,
                      requirements: document.requirements.map((r) =>
                        r.id === row.id ? { ...r, rationale } : r,
                      ),
                    })
                  }
                />
                <p>
                  Last recorded decision by{" "}
                  {row.reviewedBy ? person(row.reviewedBy) : "No reviewer yet"}
                </p>
                <CitationEditor
                  sources={view.content.sources}
                  value={row.citations}
                  onChange={(citations) =>
                    changeDocument({
                      ...document,
                      requirements: document.requirements.map((r) =>
                        r.id === row.id ? { ...r, citations } : r,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    changeDocument({
                      ...document,
                      requirements: document.requirements.filter(
                        (r) => r.id !== row.id,
                      ),
                    })
                  }
                >
                  Remove requirement
                </button>
              </section>
            ))}
            <button
              type="button"
              className={button}
              onClick={() =>
                changeDocument({
                  ...document,
                  requirements: [
                    ...document.requirements,
                    {
                      id: crypto.randomUUID(),
                      text: "New requirement",
                      sectionIds: [],
                      citations: [],
                      decision: "UNREVIEWED",
                      rationale: "",
                      reviewedBy: null,
                    },
                  ],
                })
              }
            >
              Add requirement
            </button>
          </div>
        )}
        {tab === "Budget" && (
          <div className="space-y-4">
            <div className="border rounded p-5 bg-white">
              <Field
                label="Indirect cost rate (%) applied to eligible base plus fringe"
                type="number"
                value={document.indirectBps / 100}
                onChange={(v) =>
                  changeDocument({
                    ...document,
                    indirectBps: Math.round(Number(v) * 100),
                  })
                }
              />
              {budget && (
                <p className="mt-3 font-semibold">
                  {form.currency} · Total {(budget.totalCents / 100).toFixed(2)}{" "}
                  · Cost share {(budget.costShareCents / 100).toFixed(2)} ·
                  Requested {(budget.requestedCents / 100).toFixed(2)}
                </p>
              )}
            </div>
            {document.budget.map((row) => {
              const update = (patch: Partial<typeof row>) =>
                  changeDocument({
                    ...document,
                    budget: document.budget.map((r) =>
                      r.id === row.id ? { ...r, ...patch } : r,
                    ),
                  }),
                totals = budget?.rows.find((r) => r.id === row.id);
              return (
                <section
                  key={row.id}
                  className="border rounded p-5 bg-white space-y-3"
                >
                  <div className="grid md:grid-cols-3 gap-3">
                    <Field
                      label="Description"
                      value={row.description}
                      onChange={(description) => update({ description })}
                    />
                    <Field
                      label="Year"
                      value={row.year}
                      type="number"
                      onChange={(v) => update({ year: Number(v) })}
                    />
                    <label>
                      Category
                      <select
                        className={inputClass}
                        value={row.category}
                        onChange={(e) =>
                          update({
                            category: e.target.value as typeof row.category,
                          })
                        }
                      >
                        {[
                          "PERSONNEL",
                          "FRINGE",
                          "TRAVEL",
                          "EQUIPMENT",
                          "SUPPLIES",
                          "CONTRACTUAL",
                          "OTHER",
                        ].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="Quantity (up to 4 decimal places)"
                      value={row.quantity}
                      onChange={(quantity) => update({ quantity })}
                    />
                    <Field
                      label="Unit rate (up to 2 decimal places)"
                      value={row.unitRate}
                      onChange={(unitRate) => update({ unitRate })}
                    />
                    {(["effortBps", "fringeBps", "costShareBps"] as const).map(
                      (k) => (
                        <Field
                          key={k}
                          label={
                            k === "effortBps"
                              ? "Effort (%)"
                              : k === "fringeBps"
                                ? "Personnel fringe (%)"
                                : "Cost share (%)"
                          }
                          value={row[k] / 100}
                          type="number"
                          onChange={(v) =>
                            update({ [k]: Math.round(Number(v) * 100) })
                          }
                        />
                      ),
                    )}
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={row.indirectEligible}
                      onChange={(e) =>
                        update({ indirectEligible: e.target.checked })
                      }
                    />{" "}
                    Include in indirect-cost base
                  </label>
                  <Text
                    label="Budget justification"
                    value={row.justification}
                    onChange={(justification) => update({ justification })}
                  />
                  <label>
                    Human allowability review
                    <select
                      className={inputClass}
                      value={row.allowability}
                      onChange={(e) =>
                        update({
                          allowability: e.target
                            .value as typeof row.allowability,
                        })
                      }
                    >
                      {["UNREVIEWED", "ALLOWED", "DISALLOWED"].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                  <CitationEditor
                    sources={view.content.sources}
                    value={row.policyCitation ? [row.policyCitation] : []}
                    onChange={(citations) =>
                      update({ policyCitation: citations.at(-1) ?? null })
                    }
                  />
                  {totals && (
                    <p>
                      Base {(totals.baseCents / 100).toFixed(2)} · Fringe{" "}
                      {(totals.fringeCents / 100).toFixed(2)} · Indirect{" "}
                      {(totals.indirectCents / 100).toFixed(2)} · Requested{" "}
                      {(totals.requestedCents / 100).toFixed(2)}
                    </p>
                  )}
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      changeDocument({
                        ...document,
                        budget: document.budget.filter((r) => r.id !== row.id),
                      })
                    }
                  >
                    Remove budget line
                  </button>
                </section>
              );
            })}
            <button
              type="button"
              className={button}
              onClick={() =>
                changeDocument({
                  ...document,
                  budget: [
                    ...document.budget,
                    {
                      id: crypto.randomUUID(),
                      year: 1,
                      category: "OTHER",
                      description: "New budget line",
                      quantity: "1",
                      unitRate: "0.00",
                      effortBps: 10000,
                      fringeBps: 0,
                      indirectEligible: false,
                      costShareBps: 0,
                      justification: "",
                      allowability: "UNREVIEWED",
                      policyCitation: null,
                    },
                  ],
                })
              }
            >
              Add budget line
            </button>
          </div>
        )}
        {tab === "Tasks" && (
          <div className="space-y-4">
            {document.tasks.map((row) => {
              const update = (patch: Partial<typeof row>) =>
                changeDocument({
                  ...document,
                  tasks: document.tasks.map((t) =>
                    t.id === row.id ? { ...t, ...patch } : t,
                  ),
                });
              return (
                <section
                  key={row.id}
                  className="border rounded p-5 bg-white grid md:grid-cols-2 gap-3"
                >
                  <Field
                    label="Task"
                    value={row.title}
                    onChange={(title) => update({ title })}
                  />
                  <label>
                    Assignee
                    <select
                      className={inputClass}
                      value={row.assigneeId ?? ""}
                      onChange={(e) =>
                        update({ assigneeId: e.target.value || null })
                      }
                    >
                      <option value="">Unassigned</option>
                      {view.members
                        .filter((m) => m.role !== "CLIENT")
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Field
                    label="Due at (ISO timestamp with timezone)"
                    value={row.dueAt ?? ""}
                    onChange={(v) => update({ dueAt: v || null })}
                  />
                  <label>
                    Status
                    <select
                      className={inputClass}
                      value={row.status}
                      onChange={(e) =>
                        update({ status: e.target.value as typeof row.status })
                      }
                    >
                      {["OPEN", "IN_PROGRESS", "DONE"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <Text
                    label="Task notes"
                    value={row.notes}
                    onChange={(notes) => update({ notes })}
                  />
                </section>
              );
            })}
            <button
              type="button"
              className={button}
              onClick={() =>
                changeDocument({
                  ...document,
                  tasks: [
                    ...document.tasks,
                    {
                      id: crypto.randomUUID(),
                      title: "New task",
                      assigneeId: null,
                      dueAt: null,
                      status: "OPEN",
                      notes: "",
                    },
                  ],
                })
              }
            >
              Add task
            </button>
          </div>
        )}
        {editable &&
          ["Overview", "Sections", "Requirements", "Budget", "Tasks"].includes(
            tab,
          ) && (
            <div className="border rounded bg-white p-4 space-y-3">
              <Text
                label="Revision reason"
                value={reason}
                onChange={setReason}
                rows={2}
              />
              <button
                type="button"
                disabled={!dirty || busy || reason.trim().length < 5}
                className="rounded bg-slate-900 text-white px-4 py-2 disabled:opacity-50"
                onClick={save}
              >
                Save proposal revision
              </button>
            </div>
          )}
      </fieldset>
      {tab === "Sources" && (
        <div className="space-y-4">
          {editable && (
            <form
              className="border rounded p-5 bg-white space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void upload();
              }}
            >
              <h2 className="text-xl font-semibold">Add a source document</h2>
              <label className="block">Source version<select aria-label="Source version" className={inputClass} value={supersedesId} onChange={e=>setSupersedesId(e.target.value)}><option value="">Add an independent source</option>{view.content.sources.filter(s=>!view.content.sources.some(n=>n.supersedesId===s.id)).map(s=><option value={s.id} key={s.id}>Replace: {s.title}</option>)}</select></label>
              {supersedesId&&<p>The original remains downloadable. Replacement revokes its current approval; citations must be reviewed against the new version.</p>}
              <Field
                label="Source title"
                value={uploadTitle}
                onChange={setUploadTitle}
              />
              <label className="block">
                PDF, DOCX or UTF-8 text (up to 5 MB)
                <input
                  required
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="text-sm">
                PDF text is indexed by page; Word and text files by paragraph.
                Scanned pages use local English OCR and must be checked against
                the original.
              </p>
              <button className={button} disabled={busy || dirty || !file}>
                Extract source
              </button>
            </form>
          )}
          {view.content.sources.map((source) => (
            <section
              key={source.id}
              className="border rounded p-5 bg-white space-y-3"
            >
              <h2 className="font-semibold">
                {source.title} ·{" "}
                {view.content.sources.some(n=>n.supersedesId===source.id)?"Superseded — retained history":source.approvedBy
                  ? "Approved by " + person(source.approvedBy)
                  : "Awaiting independent review"}
              </h2>
              {source.supersedesId&&<p>Replaces source: {view.content.sources.find(s=>s.id===source.supersedesId)?.title||source.supersedesId}</p>}
              <p className="text-xs break-all">
                File hash: {source.contentHash}
              </p>
              <a
                className="underline"
                href={base + "/sources?sourceId=" + source.id}
              >
                Download original
              </a>
              <details>
                <summary>Inspect extracted pages / paragraphs</summary>
                {(
                  source.chunks as { id: string; label: string; text: string }[]
                ).map((c) => (
                  <div key={c.id} className="border-t py-3">
                    <h3 className="font-semibold">{c.label}</h3>
                    <pre className="whitespace-pre-wrap max-h-96 overflow-y-auto text-sm">
                      {c.text}
                    </pre>
                  </div>
                ))}
              </details>
              {reviewer &&
                view.project.status === "DRAFT" &&
                !source.approvedBy && !view.content.sources.some(n=>n.supersedesId===source.id) && (
                  <button
                    disabled={busy || dirty}
                    className={button}
                    onClick={() => {
                      const reason = window.prompt(
                        "Explain how you checked the extraction and source authenticity",
                      );
                      if (reason)
                        void act("/sources", "PATCH", {
                          sourceId: source.id,
                          expectedHash: source.contentHash,
                          expectedVersion: view.project.version,
                          reason,
                        });
                    }}
                  >
                    Approve this source
                  </button>
                )}
            </section>
          ))}
        </div>
      )}
      {tab === "Reviews & export" && (
        <div className="space-y-4">
          <section className="border rounded p-5 bg-white space-y-3">
            <h2 className="text-xl font-semibold">
              Readiness and independent review
            </h2>
            <ul className="list-disc ml-5">
              {view.readiness.length ? (
                view.readiness.map((issue, i) => <li key={i}>{issue}</li>)
              ) : (
                <li>
                  Structured readiness checks passed; human assessment is still
                  required.
                </li>
              )}
            </ul>
            <p className="text-xs break-all">
              Current content hash: {view.contentHash}
            </p>
            {editable && (
              <button
                disabled={busy || dirty}
                className={button}
                onClick={() =>
                  act("", "POST", {
                    action: "REQUEST_REVIEW",
                    expectedVersion: view.project.version,
                  })
                }
              >
                Request independent review
              </button>
            )}
            {reviewer && view.project.status === "REVIEW" && (
              <div className="space-y-3">
                <Text
                  label="Independent review findings"
                  value={reviewReason}
                  onChange={setReviewReason}
                />
                {[true, false].map((approved) => (
                  <button
                    key={String(approved)}
                    disabled={busy || dirty || reviewReason.trim().length < 10}
                    className={button + " mr-3"}
                    onClick={() =>
                      act("", "POST", {
                        action: "REVIEW",
                        expectedVersion: view.project.version,
                        contentHash: view.contentHash,
                        approved,
                        reason: reviewReason,
                      })
                    }
                  >
                    {approved ? "Approve this revision" : "Request changes"}
                  </button>
                ))}
              </div>
            )}
            {manager &&
              ["REVIEW", "APPROVED", "FROZEN"].includes(
                view.project.status,
              ) && (
                <button
                  disabled={busy || dirty}
                  className={button}
                  onClick={() => {
                    const reason = window.prompt(
                      "Reason to reopen the proposal",
                    );
                    if (reason)
                      void act("", "POST", {
                        action: "REOPEN",
                        expectedVersion: view.project.version,
                        reason,
                      });
                  }}
                >
                  Reopen as draft
                </button>
              )}
            {view.reviews.map((r) => (
              <p key={r.id}>
                {person(r.reviewerId)} ·{" "}
                {r.approved ? "Approved" : "Requested changes"} · {r.reason}{" "}
                {r.contentHash !== view.contentHash ? "(earlier revision)" : ""}
              </p>
            ))}
          </section>
          <section className="border rounded p-5 bg-white space-y-3">
            <h2 className="text-xl font-semibold">
              Documents and frozen packages
            </h2>
            <p>
              Draft exports are marked as drafts. A frozen package records its
              actual files and hashes. Recording a submission reference does not
              contact or verify a funder portal.
            </p>
            {["pdf", "docx"].map((format) => (
              <a
                key={format}
                className="underline mr-4"
                href={base + "/packages?format=" + format}
              >
                Download draft {format.toUpperCase()}
              </a>
            ))}
            {manager && view.project.status === "APPROVED" && (
              <div className="space-y-3">
                <fieldset>
                  <legend>
                    Approved source attachments to share with the client
                  </legend>
                  {view.content.sources
                    .filter((s) => s.approvedBy)
                    .map((s) => (
                      <label className="block" key={s.id}>
                        <input
                          type="checkbox"
                          checked={attachmentIds.includes(s.id)}
                          onChange={(e) =>
                            setAttachmentIds(
                              e.target.checked
                                ? [...attachmentIds, s.id]
                                : attachmentIds.filter((id) => id !== s.id),
                            )
                          }
                        />{" "}
                        {s.title}
                      </label>
                    ))}
                </fieldset>
                <button
                  disabled={busy || dirty}
                  className={button}
                  onClick={() =>
                    act(
                      "/packages",
                      "POST",
                      {
                        expectedVersion: view.project.version,
                        contentHash: view.contentHash,
                        attachmentIds,
                      },
                      "Approved package frozen",
                    )
                  }
                >
                  Freeze approved package
                </button>
              </div>
            )}
            {view.packages.map((p) => (
              <div key={p.id} className="border rounded p-3 space-y-2">
                <p>
                  Version {p.projectVersion} · Frozen{" "}
                  {new Date(p.createdAt).toLocaleString()} ·{" "}
                  {p.submittedAt
                    ? "Receipt recorded " +
                      new Date(p.submittedAt).toLocaleString()
                    : "No submission receipt recorded"}
                </p>
                {["pdf", "docx", "zip"].map((format) => (
                  <a
                    key={format}
                    className="underline mr-4"
                    href={`${base}/packages?packageId=${p.id}&format=${format}`}
                  >
                    {format.toUpperCase()}
                  </a>
                ))}
                {manager &&
                  view.project.status === "FROZEN" &&
                  p.projectVersion === view.project.version && (
                    <button
                      disabled={busy}
                      className={button}
                      onClick={() => {
                        const reference = window.prompt(
                          "Actual funder receipt / confirmation reference",
                        );
                        if (!reference) return;
                        const timestamp = window.prompt(
                          "Actual submission time (ISO timestamp with timezone)",
                          new Date().toISOString(),
                        );
                        if (timestamp)
                          void act("/packages", "PATCH", {
                            packageId: p.id,
                            expectedVersion: view.project.version,
                            submittedAt: timestamp,
                            receiptReference: reference,
                          });
                      }}
                    >
                      Record submission receipt
                    </button>
                  )}
              </div>
            ))}
          </section>
          <ReceiptFiles projectId={id} packages={view.packages} canUpload={manager&&["SUBMITTED","AWARDED","DECLINED","WITHDRAWN"].includes(view.project.status)}/>
          {manager && view.project.status === "SUBMITTED" && (
            <section className="border rounded p-5 bg-white">
              <h2 className="text-xl font-semibold">Record outcome</h2>
              {["AWARDED", "DECLINED", "WITHDRAWN"].map((status) => (
                <button
                  key={status}
                  disabled={busy}
                  className={button + " mr-3"}
                  onClick={() => {
                    const reason = window.prompt("Decision evidence and notes");
                    if (reason)
                      void act("", "POST", {
                        action: "OUTCOME",
                        expectedVersion: view.project.version,
                        status,
                        reason,
                      });
                  }}
                >
                  {status}
                </button>
              ))}
            </section>
          )}
        </div>
      )}
      {tab === "Versions" && (
        <div className="space-y-3">
          {view.revisions.map((r) => (
            <div key={r.id} className="border rounded p-3 bg-white">
              Version {r.version} · {person(r.actorId)} · {r.reason}{" "}
              <button
                className="underline ml-3"
                onClick={() => previewVersion(r.version)}
              >
                Compare content
              </button>
              {manager && editable && r.version !== view.project.version && (
                <button
                  disabled={busy || dirty}
                  className="underline ml-3"
                  onClick={() => {
                    const reason = window.prompt(
                      "Reason to restore this version",
                    );
                    if (reason)
                      void act("", "POST", {
                        action: "ROLLBACK",
                        expectedVersion: view.project.version,
                        version: r.version,
                        reason,
                      });
                  }}
                >
                  Restore as new revision
                </button>
              )}
            </div>
          ))}
          {selectedVersion && (
            <div className="grid md:grid-cols-2 gap-4">
              <section className="border rounded p-4">
                <h2 className="font-semibold">Selected earlier version</h2>
                {selectedVersion.document.sections.map((s) => (
                  <div key={s.id}>
                    <h3>{s.title}</h3>
                    <pre className="whitespace-pre-wrap">{s.content}</pre>
                  </div>
                ))}
              </section>
              <section className="border rounded p-4">
                <h2 className="font-semibold">Current version</h2>
                {view.content.document.sections.map((s) => (
                  <div key={s.id}>
                    <h3>{s.title}</h3>
                    <pre className="whitespace-pre-wrap">{s.content}</pre>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      )}
      {tab === "Tasks" && (
        <section className="border rounded bg-white p-5 space-y-3">
          <h2 className="text-xl font-semibold">Project discussion</h2>
          <Text label="Comment" value={comment} onChange={setComment} />
          <fieldset>
            <legend>Notify project members</legend>
            {view.members
              .filter((m) => m.role !== "CLIENT")
              .map((m) => (
                <label key={m.id} className="mr-3">
                  <input
                    type="checkbox"
                    checked={mentionIds.includes(m.id)}
                    onChange={(e) =>
                      setMentionIds(
                        e.target.checked
                          ? [...mentionIds, m.id]
                          : mentionIds.filter((id) => id !== m.id),
                      )
                    }
                  />{" "}
                  {m.name}
                </label>
              ))}
          </fieldset>
          <button
            disabled={busy || dirty || !comment.trim()}
            className={button}
            onClick={() =>
              act("/comments", "POST", {
                body: comment,
                taskId: null,
                mentionIds,
              }).then((d) => {
                if (d) {
                  setComment("");
                  setMentionIds([]);
                }
              })
            }
          >
            Add comment
          </button>
          {view.comments.map((c) => (
            <article key={c.id} className="border-t py-3">
              <p className="font-semibold">
                {person(c.actorId)} · {new Date(c.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
