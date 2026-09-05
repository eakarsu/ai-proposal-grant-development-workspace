// Seed script — creates demo users and realistic domain records.
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const phones = ["(415) 555-0132", "(212) 555-0187", "(312) 555-0149", "(617) 555-0110"];
const cities = ["Chicago, IL", "Austin, TX", "Boston, MA", "Denver, CO", "Seattle, WA"];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }
function amount(i: number, base = 1000): number { return Math.round((base + ((i * 7919) % 900) * base) * 100) / 100; }
function daysAgo(i: number, spread = 180): Date { return new Date(Date.now() - ((i * 37) % spread) * 86400000); }

async function main() {
  const database = new URL(process.env.DATABASE_URL || "").pathname.slice(1);
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "true" || !/^(demo_|inspection_test_)/.test(database)) throw new Error("Demo seeding requires ALLOW_DEMO_SEED=true and a dedicated demo_ or inspection_test_ database");
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 16) throw new Error("Set DEMO_PASSWORD to at least 16 characters");
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD!, 12);
  const demoUsers: Array<[string, string, Role]> = [
    ["admin@ai-proposal-grant-development-workspace.local", "Demo Admin", "ADMIN"],
    ["manager@ai-proposal-grant-development-workspace.local", "Demo Manager", "MANAGER"],
    ["analyst@ai-proposal-grant-development-workspace.local", "Demo Analyst", "ANALYST"],
  ];
  for (const [email, name, role] of demoUsers) {
    await prisma.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash } });
  }

  const STATUSES_Opportunity = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.opportunity.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.opportunity.create({
      data: {
      name: `Name ${String(i + 1).padStart(3, "0")}`,
      funder: `Funder ${String(i + 1).padStart(3, "0")}`,
      program: `Program ${String(i + 1).padStart(3, "0")}`,
      awardCeiling: amount(i, 250),
      status: pick(STATUSES_Opportunity, i),
      deadline: daysAgo(i)
      },
    });
  }

  const opportunityRefs = await prisma.opportunity.findMany({ select: { id: true } });

  const STATUSES_Proposal = ["INTAKE", "DRAFTING", "REVIEW", "SUBMITTED", "AWARDED"];
  await prisma.proposal.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.proposal.create({
      data: {
      title: `Title ${String(i + 1).padStart(3, "0")}`,
      opportunityRef: `OpportunityRef ${String(i + 1).padStart(3, "0")}`,
      lead: `Lead ${String(i + 1).padStart(3, "0")}`,
      requestedAmount: amount(i, 250),
      status: pick(STATUSES_Proposal, i),
      dueDate: daysAgo(i),
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_RequirementItem = ["OPEN", "ADDRESSED", "VERIFIED"];
  await prisma.requirementItem.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.requirementItem.create({
      data: {
      section: `Section ${String(i + 1).padStart(3, "0")}`,
      requirement: `Requirement ${String(i + 1).padStart(3, "0")}`,
      responseRef: `ResponseRef ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_RequirementItem, i),
      owner: `Owner ${String(i + 1).padStart(3, "0")}`,
      pageLimit: `PageLimit ${String(i + 1).padStart(3, "0")}`,
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_SourceDocument = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.sourceDocument.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.sourceDocument.create({
      data: {
      title: `Title ${String(i + 1).padStart(3, "0")}`,
      kind: `Kind ${String(i + 1).padStart(3, "0")}`,
      storageRef: `StorageRef ${String(i + 1).padStart(3, "0")}`,
      approvedBy: `ApprovedBy ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_SourceDocument, i),
      ingestedAt: daysAgo(i),
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_ClaimValidation = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.claimValidation.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.claimValidation.create({
      data: {
      claim: `Claim ${String(i + 1).padStart(3, "0")}`,
      sourceRef: `SourceRef ${String(i + 1).padStart(3, "0")}`,
      verdict: `Verdict ${String(i + 1).padStart(3, "0")}`,
      reviewer: `Reviewer ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_ClaimValidation, i),
      checkedAt: daysAgo(i),
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_BudgetLine = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.budgetLine.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.budgetLine.create({
      data: {
      category: `Category ${String(i + 1).padStart(3, "0")}`,
      description: `Description ${String(i + 1).padStart(3, "0")}`,
      amount: amount(i, 250),
      justification: `Justification ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_BudgetLine, i),
      allowability: `Allowability ${String(i + 1).padStart(3, "0")}`,
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_ReviewerAssignment = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.reviewerAssignment.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.reviewerAssignment.create({
      data: {
      reviewer: `Reviewer ${String(i + 1).padStart(3, "0")}`,
      section: `Section ${String(i + 1).padStart(3, "0")}`,
      expertise: `Expertise ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_ReviewerAssignment, i),
      dueDate: daysAgo(i),
      feedbackRef: `FeedbackRef ${String(i + 1).padStart(3, "0")}`,
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_DeadlineItem = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.deadlineItem.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.deadlineItem.create({
      data: {
      kind: `Kind ${String(i + 1).padStart(3, "0")}`,
      title: `Title ${String(i + 1).padStart(3, "0")}`,
      dueAt: daysAgo(i),
      owner: `Owner ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_DeadlineItem, i),
      consequence: `Consequence ${String(i + 1).padStart(3, "0")}`,
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_DraftSection = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.draftSection.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.draftSection.create({
      data: {
      section: `Section ${String(i + 1).padStart(3, "0")}`,
      content: `Content ${String(i + 1).padStart(3, "0")}`,
      version: `Version ${String(i + 1).padStart(3, "0")}`,
      author: `Author ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_DraftSection, i),
      lastEditedAt: daysAgo(i),
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_MeetingExtract = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.meetingExtract.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.meetingExtract.create({
      data: {
      meeting: `Meeting ${String(i + 1).padStart(3, "0")}`,
      keyPoints: `KeyPoints ${String(i + 1).padStart(3, "0")}`,
      decisions: `Decisions ${String(i + 1).padStart(3, "0")}`,
      actions: `Actions ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_MeetingExtract, i),
      heldAt: daysAgo(i),
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_SubmissionPackage = ["ASSEMBLING", "READY", "SUBMITTED", "RETURNED"];
  await prisma.submissionPackage.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.submissionPackage.create({
      data: {
      portal: `Portal ${String(i + 1).padStart(3, "0")}`,
      packageRef: `PackageRef ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_SubmissionPackage, i),
      submittedAt: daysAgo(i),
      confirmation: `Confirmation ${String(i + 1).padStart(3, "0")}`,
      pageCount: 5 + ((i * 13) % 95),
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  const STATUSES_ComplianceCheck = ["OPEN", "IN_REVIEW", "APPROVED", "CLOSED"];
  await prisma.complianceCheck.deleteMany();
  for (let i = 0; i < 25; i++) {
    await prisma.complianceCheck.create({
      data: {
      rule: `Rule ${String(i + 1).padStart(3, "0")}`,
      result: `Result ${String(i + 1).padStart(3, "0")}`,
      evidence: `Evidence ${String(i + 1).padStart(3, "0")}`,
      reviewer: `Reviewer ${String(i + 1).padStart(3, "0")}`,
      status: pick(STATUSES_ComplianceCheck, i),
      checkedAt: daysAgo(i),
      opportunity: { connect: { id: opportunityRefs[i % opportunityRefs.length].id } }
      },
    });
  }

  await prisma.auditLog.create({ data: { actorName: "Seeder", action: "SEED", entity: "system", detail: "Demo dataset created" } });

  console.log("Seeded demo users and domain records.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
