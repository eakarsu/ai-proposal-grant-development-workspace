export interface PageConfig {
  label: string;
  href: string;
  description: string;
  entities: string[];
  workflows: string[];
}

export interface EntityConfig {
  name: string;
  label: string;
  fields: Array<{ name: string; kind: "string" | "number" | "boolean" | "date" }>;
}

export interface WorkflowConfig {
  slug: string;
  title: string;
  description: string;
  prompt: string;
  fields: string[];
}

export const appConfig = {
  slug: "ai-proposal-grant-development-workspace",
  title: "Proposal & Grant Development Workspace",
  tagline: "From source documents to validated submission packages",
  accent: "zinc",
};

export const pages: PageConfig[] = [
  {
    label: "Pipeline",
    href: "/pipeline",
    description: "Opportunities, proposals, deadlines.",
    entities: ["Opportunity", "Proposal", "DeadlineItem"],
    workflows: ["go-no-go"],
  },
  {
    label: "Authoring",
    href: "/authoring",
    description: "Requirements, drafts, meeting extracts.",
    entities: ["RequirementItem", "DraftSection", "MeetingExtract"],
    workflows: ["section-draft"],
  },
  {
    label: "Evidence & Budget",
    href: "/evidence",
    description: "Source docs, claim validation, budget, compliance.",
    entities: ["SourceDocument", "ClaimValidation", "BudgetLine", "ComplianceCheck"],
    workflows: ["claim-audit"],
  },
  {
    label: "Review & Submit",
    href: "/submit",
    description: "Reviewer assignments and submission packages.",
    entities: ["ReviewerAssignment", "SubmissionPackage"],
    workflows: [],
  },
];

export const entities: Record<string, EntityConfig> = {
  Opportunity: {
    name: "Opportunity",
    label: "Opportunity",
    fields: [{ name: "name", kind: "string" }, { name: "funder", kind: "string" }, { name: "program", kind: "string" }, { name: "awardCeiling", kind: "number" }, { name: "status", kind: "string" }, { name: "deadline", kind: "date" }],
  },
  Proposal: {
    name: "Proposal",
    label: "Proposal",
    fields: [{ name: "title", kind: "string" }, { name: "opportunityRef", kind: "string" }, { name: "lead", kind: "string" }, { name: "requestedAmount", kind: "number" }, { name: "status", kind: "string" }, { name: "dueDate", kind: "date" }],
  },
  RequirementItem: {
    name: "RequirementItem",
    label: "Requirement",
    fields: [{ name: "section", kind: "string" }, { name: "requirement", kind: "string" }, { name: "responseRef", kind: "string" }, { name: "status", kind: "string" }, { name: "owner", kind: "string" }, { name: "pageLimit", kind: "string" }],
  },
  SourceDocument: {
    name: "SourceDocument",
    label: "Source Document",
    fields: [{ name: "title", kind: "string" }, { name: "kind", kind: "string" }, { name: "storageRef", kind: "string" }, { name: "approvedBy", kind: "string" }, { name: "status", kind: "string" }, { name: "ingestedAt", kind: "date" }],
  },
  ClaimValidation: {
    name: "ClaimValidation",
    label: "Claim Validation",
    fields: [{ name: "claim", kind: "string" }, { name: "sourceRef", kind: "string" }, { name: "verdict", kind: "string" }, { name: "reviewer", kind: "string" }, { name: "status", kind: "string" }, { name: "checkedAt", kind: "date" }],
  },
  BudgetLine: {
    name: "BudgetLine",
    label: "Budget Line",
    fields: [{ name: "category", kind: "string" }, { name: "description", kind: "string" }, { name: "amount", kind: "number" }, { name: "justification", kind: "string" }, { name: "status", kind: "string" }, { name: "allowability", kind: "string" }],
  },
  ReviewerAssignment: {
    name: "ReviewerAssignment",
    label: "Reviewer",
    fields: [{ name: "reviewer", kind: "string" }, { name: "section", kind: "string" }, { name: "expertise", kind: "string" }, { name: "status", kind: "string" }, { name: "dueDate", kind: "date" }, { name: "feedbackRef", kind: "string" }],
  },
  DeadlineItem: {
    name: "DeadlineItem",
    label: "Deadline",
    fields: [{ name: "kind", kind: "string" }, { name: "title", kind: "string" }, { name: "dueAt", kind: "date" }, { name: "owner", kind: "string" }, { name: "status", kind: "string" }, { name: "consequence", kind: "string" }],
  },
  DraftSection: {
    name: "DraftSection",
    label: "Draft Section",
    fields: [{ name: "section", kind: "string" }, { name: "content", kind: "string" }, { name: "version", kind: "string" }, { name: "author", kind: "string" }, { name: "status", kind: "string" }, { name: "lastEditedAt", kind: "date" }],
  },
  MeetingExtract: {
    name: "MeetingExtract",
    label: "Meeting Extract",
    fields: [{ name: "meeting", kind: "string" }, { name: "keyPoints", kind: "string" }, { name: "decisions", kind: "string" }, { name: "actions", kind: "string" }, { name: "status", kind: "string" }, { name: "heldAt", kind: "date" }],
  },
  SubmissionPackage: {
    name: "SubmissionPackage",
    label: "Submission",
    fields: [{ name: "portal", kind: "string" }, { name: "packageRef", kind: "string" }, { name: "status", kind: "string" }, { name: "submittedAt", kind: "date" }, { name: "confirmation", kind: "string" }, { name: "pageCount", kind: "number" }],
  },
  ComplianceCheck: {
    name: "ComplianceCheck",
    label: "Compliance Check",
    fields: [{ name: "rule", kind: "string" }, { name: "result", kind: "string" }, { name: "evidence", kind: "string" }, { name: "reviewer", kind: "string" }, { name: "status", kind: "string" }, { name: "checkedAt", kind: "date" }],
  },
};

export const workflows: WorkflowConfig[] = [
  {
    slug: "go-no-go",
    title: "Draft: Go / No-Go Analyst",
    description: "Assess whether to pursue the opportunity.",
    prompt: "You are a capture manager. Recommend go/no-go: mission fit, eligibility, competitiveness, cost of pursuit, and readiness against the deadline.",
    fields: ["funder", "program", "awardCeiling", "currentCapabilities"],
  },
  {
    slug: "section-draft",
    title: "Draft: Section Drafter",
    description: "Draft a proposal section from sources.",
    prompt: "You are a grant writer. Draft the proposal section using ONLY approved source documents; add bracketed citations for each claim.",
    fields: ["section", "requirements", "sourceSummaries", "pageLimit"],
  },
  {
    slug: "claim-audit",
    title: "Draft: Claim Auditor",
    description: "Validate claims against approved sources.",
    prompt: "You are a compliance auditor. Check each claim in the draft against the approved sources; flag unsupported or overstated claims.",
    fields: ["draftText", "approvedSources", "strictness"],
  },
];

export function findPage(href: string): PageConfig | undefined {
  return pages.find((p) => p.href === href);
}
