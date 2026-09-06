import { Prisma } from "@prisma/client";
import { z } from "zod";
import { RequestError } from "@/lib/record-policy";
import { jsonValue } from "@/lib/record-store";
import {
  audit,
  editors,
  hash,
  managers,
  projectAccess,
  reviewers,
} from "./access";
import {
  calculateBudget,
  documentSchema,
  emptyDocument,
  GrantDocument,
  readiness,
  validateCitations,
} from "./document";
export const projectSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    funder: z.string().trim().min(1).max(300),
    program: z.string().max(300).default(""),
    dueAt: z.string().datetime().nullable(),
    currency: z.enum(["USD", "CAD", "EUR", "GBP", "AUD"]),
    document: documentSchema.default(emptyDocument),
  })
  .strict();
export const saveSchema = projectSchema
  .extend({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export const projectSources = (
  tx: Prisma.TransactionClient,
  projectId: string,
) =>
  tx.grantSource.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      fileName: true,
      mediaType: true,
      contentHash: true,
      chunks: true,
      actorId: true,
      approvedBy: true,
      approvedAt: true,
      createdAt: true,
      supersedesId: true,
    },
    orderBy: { createdAt: "asc" },
  });
export async function snapshot(tx: Prisma.TransactionClient, id: string) {
  const project = await tx.grantProject.findUniqueOrThrow({ where: { id } }),
    sources = await projectSources(tx, id);
  return {
    projectVersion: project.version,
    title: project.title,
    funder: project.funder,
    program: project.program,
    dueAt: project.dueAt?.toISOString() ?? null,
    currency: project.currency,
    document: documentSchema.parse(project.document),
    sources: sources.map(({ createdAt, approvedAt, ...s }) => ({
      ...s,
      createdAt: createdAt.toISOString(),
      approvedAt: approvedAt?.toISOString() ?? null,
    })),
    budget: calculateBudget(documentSchema.parse(project.document)),
  };
}
export async function revision(
  tx: Prisma.TransactionClient,
  id: string,
  actorId: string,
  reason: string,
) {
  const project = await tx.grantProject.findUniqueOrThrow({ where: { id } }),
    current = await snapshot(tx, id);
  await tx.grantRevision.create({
    data: {
      projectId: id,
      version: project.version,
      snapshot: jsonValue(current),
      contentHash: hash(current),
      actorId,
      reason,
    },
  });
  return current;
}
export async function createProject(
  tx: Prisma.TransactionClient,
  actorId: string,
  organizationId: string,
  input: z.infer<typeof projectSchema>,
) {
  if (
    input.document.sections.length ||
    input.document.requirements.length ||
    input.document.budget.length ||
    input.document.tasks.length
  )
    throw new RequestError("Create the project before adding linked content");
  const project = await tx.grantProject.create({
    data: {
      ...input,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      document: jsonValue(input.document),
      organizationId,
      authorId: actorId,
      access: { create: { userId: actorId } },
    },
  });
  await revision(tx, project.id, actorId, "Project created");
  await audit(tx, actorId, "GRANT_CREATED", project.id, { organizationId });
  return project;
}
export async function saveProject(
  tx: Prisma.TransactionClient,
  actorId: string,
  projectId: string,
  input: z.infer<typeof saveSchema>,
) {
  const { project } = await projectAccess(tx, actorId, projectId, editors);
  if (project.status !== "DRAFT")
    throw new RequestError(
      "Reopen this proposal as a draft before editing",
      409,
    );
  if (project.version !== input.expectedVersion)
    throw new RequestError(
      "The proposal changed; reload or compare versions before saving",
      409,
    );
  const before = documentSchema.parse(project.document),
    document: GrantDocument = structuredClone(input.document);
  // Review attribution is assigned by the server; edits invalidate prior requirement decisions.
  for (const row of document.requirements) {
    const old = before.requirements.find((r) => r.id === row.id),
      changed =
        !old ||
        hash({
          text: row.text,
          sectionIds: row.sectionIds,
          citations: row.citations,
        }) !==
          hash({
            text: old.text,
            sectionIds: old.sectionIds,
            citations: old.citations,
          });
    if (row.decision === "UNREVIEWED") {
      row.reviewedBy = null;
      continue;
    }
    if (
      changed ||
      old?.decision !== row.decision ||
      old?.rationale !== row.rationale
    ) {
      if (!row.rationale.trim())
        throw new RequestError("Requirement decisions need a rationale");
      row.reviewedBy = actorId;
    } else row.reviewedBy = old?.reviewedBy ?? actorId;
  }
  const sources = await projectSources(tx, projectId);
  validateCitations(document, sources);
  for (const task of document.tasks)
    if (task.assigneeId) {
      const member = await tx.grantMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: project.organizationId,
            userId: task.assigneeId,
          },
        },
      });
      if (!member?.active || member.role === "CLIENT")
        throw new RequestError(
          "Task assignees must be active staff or reviewers in this organization",
        );
      await projectAccess(tx, task.assigneeId, projectId);
    }
  calculateBudget(document);
  const { expectedVersion, reason, ...fields } = input;
  const updated = await tx.grantProject.updateMany({
    where: { id: projectId, version: expectedVersion, status: "DRAFT" },
    data: {
      ...fields,
      dueAt: fields.dueAt ? new Date(fields.dueAt) : null,
      document: jsonValue(document),
      version: { increment: 1 },
    },
  });
  if (!updated.count) throw new RequestError("Proposal changed; reload", 409);
  await revision(tx, projectId, actorId, reason);
  await audit(tx, actorId, "GRANT_EDITED", projectId, {
    fromVersion: expectedVersion,
    reason,
  });
  for (const task of document.tasks) {
    const old = before.tasks.find((t) => t.id === task.id);
    if (
      task.assigneeId &&
      task.assigneeId !== actorId &&
      hash(old) !== hash(task)
    )
      await tx.grantNotification.create({
        data: {
          userId: task.assigneeId,
          organizationId: project.organizationId,
          projectId,
          title: `Task updated: ${task.title}`,
        },
      });
  }
  return tx.grantProject.findUniqueOrThrow({ where: { id: projectId } });
}
export const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("REQUEST_REVIEW"),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("REOPEN"),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("REVIEW"),
    expectedVersion: z.number().int().positive(),
    contentHash: z.string().length(64),
    approved: z.boolean(),
    reason: z.string().trim().min(10).max(10000),
  }),
  z.object({
    action: z.literal("ROLLBACK"),
    expectedVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.object({
    action: z.literal("OUTCOME"),
    expectedVersion: z.number().int().positive(),
    status: z.enum(["AWARDED", "DECLINED", "WITHDRAWN"]),
    reason: z.string().trim().min(5).max(10000),
  }),
]);
export async function projectAction(
  tx: Prisma.TransactionClient,
  actorId: string,
  id: string,
  input: z.infer<typeof actionSchema>,
) {
  const roles =
    input.action === "REVIEW"
      ? reviewers
      : input.action === "REQUEST_REVIEW"
        ? editors
        : managers;
  const { project } = await projectAccess(tx, actorId, id, roles);
  if (project.version !== input.expectedVersion)
    throw new RequestError("Proposal changed; reload before acting", 409);
  const current = await snapshot(tx, id),
    contentHash = hash(current);
  if (input.action === "REQUEST_REVIEW") {
    if (project.status !== "DRAFT")
      throw new RequestError("Only drafts can enter review", 409);
    const issues = readiness(current.document);
    if (issues.length)
      throw new RequestError(issues.slice(0, 20).join("; "), 409);
    validateCitations(current.document, current.sources, true);
    await tx.grantProject.update({ where: { id }, data: { status: "REVIEW" } });
    const members = await tx.grantMembership.findMany({
      where: {
        organizationId: project.organizationId,
        active: true,
        role: { in: reviewers },
        userId: { not: actorId },
      },
    });
    for (const member of members) {
      if (
        managers.includes(member.role) ||
        (await tx.grantProjectAccess.findUnique({
          where: { projectId_userId: { projectId: id, userId: member.userId } },
        }))
      )
        await tx.grantNotification.create({
          data: {
            userId: member.userId,
            organizationId: project.organizationId,
            projectId: id,
            title: `Review requested: ${project.title}`,
          },
        });
    }
  } else if (input.action === "REVIEW") {
    if (project.status !== "REVIEW" || input.contentHash !== contentHash)
      throw new RequestError(
        "This exact proposal is no longer awaiting review",
        409,
      );
    const contribution = await tx.auditLog.findFirst({
      where: {
        entityId: id,
        actorId,
        action: { in: ["GRANT_EDITED", "GRANT_CREATED"] },
      },
    });
    if (contribution || project.authorId === actorId)
      throw new RequestError(
        "A proposal contributor cannot provide its independent approval",
        403,
      );
    await tx.grantReview.create({
      data: {
        projectId: id,
        reviewerId: actorId,
        contentHash,
        approved: input.approved,
        reason: input.reason,
      },
    });
    if (!input.approved)
      await tx.grantProject.update({
        where: { id },
        data: { status: "DRAFT", version: { increment: 1 } },
      });
    else {
      const organization = await tx.grantOrganization.findUniqueOrThrow({
        where: { id: project.organizationId },
      });
      const approvals = await tx.grantReview.findMany({
        where: { projectId: id, contentHash, approved: true },
      });
      let eligible = 0;
      for (const approval of approvals) {
        const member = await tx.grantMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: project.organizationId,
              userId: approval.reviewerId,
            },
          },
        });
        if (
          member?.active &&
          reviewers.includes(member.role) &&
          (await tx.user.findFirst({
            where: { id: approval.reviewerId, active: true },
          })) &&
          (managers.includes(member.role) ||
            (await tx.grantProjectAccess.findUnique({
              where: {
                projectId_userId: {
                  projectId: id,
                  userId: approval.reviewerId,
                },
              },
            })))
        )
          eligible++;
      }
      if (eligible >= organization.reviewCount)
        await tx.grantProject.update({
          where: { id },
          data: { status: "APPROVED" },
        });
    }
  } else if (input.action === "REOPEN") {
    if (!["REVIEW", "APPROVED", "FROZEN"].includes(project.status))
      throw new RequestError(
        "Only a review, approved or frozen proposal can be reopened",
        409,
      );
    await tx.grantProject.update({
      where: { id },
      data: { status: "DRAFT", version: { increment: 1 } },
    });
  } else if (input.action === "ROLLBACK") {
    if (project.status !== "DRAFT")
      throw new RequestError(
        "Only drafts can be restored from an earlier version",
        409,
      );
    const previous = await tx.grantRevision.findUnique({
      where: { projectId_version: { projectId: id, version: input.version } },
    });
    if (!previous) throw new RequestError("Version not found", 404);
    const saved = previous.snapshot as Record<string, unknown>;
    const old = projectSchema.parse(
      Object.fromEntries(
        ["title", "funder", "program", "dueAt", "currency", "document"].map(
          (key) => [key, saved[key]],
        ),
      ),
    );
    return saveProject(tx, actorId, id, {
      ...old,
      expectedVersion: project.version,
      reason: input.reason,
    });
  } else {
    if (
      input.status === "WITHDRAWN"
        ? !["DRAFT", "REVIEW", "APPROVED", "FROZEN", "SUBMITTED"].includes(
            project.status,
          )
        : project.status !== "SUBMITTED"
    )
      throw new RequestError(
        "Award/decline outcomes require a recorded submission",
        409,
      );
    await tx.grantProject.update({
      where: { id },
      data: { status: input.status },
    });
  }
  await audit(tx, actorId, `GRANT_${input.action}`, id, {
    ...input,
    contentHash,
  });
  return tx.grantProject.findUniqueOrThrow({ where: { id } });
}
