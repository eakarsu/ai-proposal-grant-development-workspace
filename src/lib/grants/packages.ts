import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { projectAccess, managers, reviewers, hash, audit } from "./access";
import { snapshot } from "./projects";
import { packageProposal, bytesHash } from "./export";
import { readiness, validateCitations } from "./document";
import { RequestError } from "@/lib/record-policy";
import { jsonValue } from "@/lib/record-store";
export const freezeSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    contentHash: z.string().length(64),
    attachmentIds: z.array(z.string().max(100)).max(20).default([]),
  })
  .strict();
export const receiptSchema = z
  .object({
    packageId: z.string().max(100),
    expectedVersion: z.number().int().positive(),
    submittedAt: z.string().datetime(),
    receiptReference: z.string().trim().min(5).max(2000),
  })
  .strict();
export async function freezePackage(
  tx: Prisma.TransactionClient,
  actorId: string,
  id: string,
  input: z.infer<typeof freezeSchema>,
) {
  const { project: current } = await projectAccess(tx, actorId, id, managers);
  if (
    current.version !== input.expectedVersion ||
    current.status !== "APPROVED"
  )
    throw new RequestError(
      "Only the current approved proposal can be frozen",
      409,
    );
  const content = await snapshot(tx, id);
  if (hash(content) !== input.contentHash)
    throw new RequestError(
      "Proposal evidence changed; review the current snapshot",
      409,
    );
  validateCitations(content.document, content.sources, true);
  const issues = readiness(content.document);
  if (issues.length) throw new RequestError(issues.join("; "), 409);
  const organization = await tx.grantOrganization.findUniqueOrThrow({
      where: { id: current.organizationId },
    }),
    reviews = await tx.grantReview.findMany({
      where: { projectId: id, contentHash: input.contentHash, approved: true },
    });
  const valid = [];
  for (const review of reviews) {
    const member = await tx.grantMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: current.organizationId,
          userId: review.reviewerId,
        },
      },
    });
    if (
      member?.active &&
      reviewers.includes(member.role) &&
      (await tx.user.findFirst({
        where: { id: review.reviewerId, active: true },
      })) &&
      (managers.includes(member.role) ||
        (await tx.grantProjectAccess.findUnique({
          where: {
            projectId_userId: { projectId: id, userId: review.reviewerId },
          },
        })))
    )
      valid.push(review);
  }
  if (valid.length < organization.reviewCount)
    throw new RequestError(
      "Required independent reviewers are no longer active",
      409,
    );
  const attachments = await tx.grantSource.findMany({
    where: {
      projectId: id,
      id: { in: input.attachmentIds },
      approvedBy: { not: null },
    },
  });
  if (
    attachments.length !== new Set(input.attachmentIds).size ||
    attachments.some((a) => !a.bytes)
  )
    throw new RequestError(
      "Attachments must be approved original sources in this proposal",
      409,
    );
  const files = await packageProposal(
    content,
    attachments.map((a) => ({ ...a, bytes: a.bytes! })),
    valid.map((r) => r.id),
  );
  const bundle = await tx.grantPackage.create({
    data: {
      projectId: id,
      projectVersion: current.version,
      contentHash: files.contentHash,
      manifest: jsonValue(files.manifest),
      docx: files.docx,
      pdf: files.pdf,
      archive: files.archive,
      frozenBy: actorId,
    },
    select: { id: true, contentHash: true, manifest: true, createdAt: true },
  });
  await tx.grantProject.update({ where: { id }, data: { status: "FROZEN" } });
  await audit(tx, actorId, "GRANT_PACKAGE_FROZEN", id, {
    packageId: bundle.id,
    contentHash: bundle.contentHash,
    archiveHash: bytesHash(files.archive),
  });
  return bundle;
}
export async function recordSubmission(
  tx: Prisma.TransactionClient,
  actorId: string,
  id: string,
  input: z.infer<typeof receiptSchema>,
) {
  const { project: current } = await projectAccess(tx, actorId, id, managers);
  if (current.status !== "FROZEN" || current.version !== input.expectedVersion)
    throw new RequestError(
      "Record a receipt for the current frozen package",
      409,
    );
  const submittedAt = new Date(input.submittedAt);
  if (submittedAt > new Date())
    throw new RequestError("Submission time cannot be in the future");
  const changed = await tx.grantPackage.updateMany({
    where: {
      id: input.packageId,
      projectId: id,
      projectVersion: current.version,
      submittedAt: null,
    },
    data: { submittedAt, receiptReference: input.receiptReference },
  });
  if (!changed.count)
    throw new RequestError("Current unsubmitted package not found", 409);
  await tx.grantProject.update({
    where: { id },
    data: { status: "SUBMITTED" },
  });
  await audit(tx, actorId, "GRANT_SUBMISSION_RECORDED", id, {
    ...input,
    evidence: "MANUAL_RECEIPT_REFERENCE_NOT_AUTOMATIC_PORTAL_VERIFICATION",
  });
  return { recorded: true };
}
