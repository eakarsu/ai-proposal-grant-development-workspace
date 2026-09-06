import { z } from "zod";
import { RequestError } from "@/lib/record-policy";
const id = z.string().min(1).max(100),
  text = z.string().max(100000),
  bps = z.number().int().min(0).max(10000);
export const citationSchema = z
  .object({
    sourceId: id,
    chunkId: id,
    quote: z.string().trim().min(1).max(2000),
  })
  .strict();
export const sectionSchema = z
  .object({
    id,
    title: z.string().trim().min(1).max(200),
    content: text,
    wordLimit: z.number().int().min(0).max(100000),
    citations: z.array(citationSchema).max(200),
  })
  .strict();
export const requirementSchema = z
  .object({
    id,
    text: z.string().trim().min(1).max(10000),
    sectionIds: z.array(id).max(50),
    citations: z.array(citationSchema).max(30),
    decision: z.enum(["UNREVIEWED", "SATISFIED", "NOT_APPLICABLE", "BLOCKED"]),
    rationale: z.string().max(5000),
    reviewedBy: id.nullable(),
  })
  .strict();
export const budgetSchema = z
  .object({
    id,
    year: z.number().int().min(1).max(20),
    category: z.enum([
      "PERSONNEL",
      "FRINGE",
      "TRAVEL",
      "EQUIPMENT",
      "SUPPLIES",
      "CONTRACTUAL",
      "OTHER",
    ]),
    description: z.string().trim().min(1).max(1000),
    quantity: z.string().regex(/^\d{1,8}(\.\d{1,4})?$/),
    unitRate: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
    effortBps: bps,
    fringeBps: bps,
    indirectEligible: z.boolean(),
    costShareBps: bps,
    justification: z.string().max(10000),
    allowability: z.enum(["UNREVIEWED", "ALLOWED", "DISALLOWED"]),
    policyCitation: citationSchema.nullable(),
  })
  .strict();
export const taskSchema = z
  .object({
    id,
    title: z.string().trim().min(1).max(500),
    assigneeId: id.nullable(),
    dueAt: z.string().datetime().nullable(),
    status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]),
    notes: z.string().max(10000),
  })
  .strict();
export const documentSchema = z
  .object({
    organizationNarrative: text,
    sections: z.array(sectionSchema).max(100),
    requirements: z.array(requirementSchema).max(300),
    budget: z.array(budgetSchema).max(500),
    tasks: z.array(taskSchema).max(500),
    indirectBps: bps,
    requestedOutcome: z.string().max(10000),
  })
  .strict()
  .superRefine((d, ctx) => {
    for (const key of ["sections", "requirements", "budget", "tasks"] as const)
      if (new Set(d[key].map((row) => row.id)).size !== d[key].length)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Duplicate IDs are not allowed",
        });
    for (const row of d.requirements)
      if (row.sectionIds.some((id) => !d.sections.some((s) => s.id === id)))
        ctx.addIssue({
          code: "custom",
          path: ["requirements"],
          message: "Requirements must reference existing sections",
        });
    if (JSON.stringify(d).length > 800000)
      ctx.addIssue({
        code: "custom",
        message: "Project content exceeds 800,000 characters",
      });
  });
export type GrantDocument = z.infer<typeof documentSchema>;
export const emptyDocument: GrantDocument = {
  organizationNarrative: "",
  sections: [],
  requirements: [],
  budget: [],
  tasks: [],
  indirectBps: 0,
  requestedOutcome: "",
};
export function fixed(value: string, places: number) {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"))
  );
}
const rounded = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator / 2n) / denominator;
export function calculateBudget(document: GrantDocument) {
  const rows = document.budget.map((line) => {
    const base = rounded(
      fixed(line.quantity, 4) *
        fixed(line.unitRate, 2) *
        BigInt(line.effortBps),
      100000000n,
    );
    const fringe =
      line.category === "PERSONNEL"
        ? rounded(base * BigInt(line.fringeBps), 10000n)
        : 0n;
    const indirect = line.indirectEligible
      ? rounded((base + fringe) * BigInt(document.indirectBps), 10000n)
      : 0n;
    const total = base + fringe + indirect,
      costShare = rounded(total * BigInt(line.costShareBps), 10000n);
    const safe = (n: bigint) => {
      if (n > 9000000000000n)
        throw new RequestError("Budget exceeds supported precision");
      return Number(n);
    };
    return {
      id: line.id,
      year: line.year,
      baseCents: safe(base),
      fringeCents: safe(fringe),
      indirectCents: safe(indirect),
      totalCents: safe(total),
      costShareCents: safe(costShare),
      requestedCents: safe(total - costShare),
    };
  });
  const total = rows.reduce((s, r) => s + BigInt(r.totalCents), 0n);
  if (total > 9000000000000n)
    throw new RequestError("Budget total exceeds supported limit");
  return {
    rows,
    totalCents: Number(total),
    costShareCents: rows.reduce((s, r) => s + r.costShareCents, 0),
    requestedCents: rows.reduce((s, r) => s + r.requestedCents, 0),
    years: [...new Set(rows.map((r) => r.year))]
      .sort((a, b) => a - b)
      .map((year) => ({
        year,
        totalCents: rows
          .filter((r) => r.year === year)
          .reduce((s, r) => s + r.totalCents, 0),
        requestedCents: rows
          .filter((r) => r.year === year)
          .reduce((s, r) => s + r.requestedCents, 0),
      })),
  };
}
export const wordCount = (text: string) =>
  text.trim() ? text.trim().split(/\s+/u).length : 0;
export type SourceChunk = { id: string; label: string; text: string };
export function validateCitations(
  document: GrantDocument,
  sources: { id: string; approvedBy: string | null; chunks: unknown }[],
  requireApproved = false,
) {
  const citations = [
    ...document.sections.flatMap((s) => s.citations),
    ...document.requirements.flatMap((r) => r.citations),
    ...document.budget.flatMap((b) =>
      b.policyCitation ? [b.policyCitation] : [],
    ),
  ];
  for (const cite of citations) {
    const source = sources.find((s) => s.id === cite.sourceId),
      chunk = (source?.chunks as SourceChunk[] | undefined)?.find(
        (c) => c.id === cite.chunkId,
      );
    if (!chunk || !chunk.text.includes(cite.quote))
      throw new RequestError(
        "A citation is missing or its quoted passage is not present in the source",
        409,
      );
    if (requireApproved && !source?.approvedBy)
      throw new RequestError(
        "Every cited source needs independent approval",
        409,
      );
  }
}
export function readiness(document: GrantDocument) {
  const issues: string[] = [];
  if (!document.sections.length) issues.push("Add proposal sections");
  for (const s of document.sections) {
    if (!s.content.trim()) issues.push(`${s.title}: add content`);
    if (s.wordLimit && wordCount(s.content) > s.wordLimit)
      issues.push(`${s.title}: exceeds its word limit`);
    if (!s.citations.length) issues.push(`${s.title}: cite supporting sources`);
  }
  if (!document.requirements.length)
    issues.push("Add and review solicitation requirements");
  for (const r of document.requirements)
    if (
      !["SATISFIED", "NOT_APPLICABLE"].includes(r.decision) ||
      !r.reviewedBy ||
      !r.rationale.trim() ||
      (r.decision === "SATISFIED" && !r.sectionIds.length)
    )
      issues.push(`Requirement ${r.id}: review and evidence mapping required`);
  if (!document.budget.length) issues.push("Add the budget");
  for (const b of document.budget)
    if (
      b.allowability !== "ALLOWED" ||
      !b.justification.trim() ||
      !b.policyCitation
    )
      issues.push(
        `${b.description}: confirm allowability, policy evidence and justification`,
      );
  return issues;
}
