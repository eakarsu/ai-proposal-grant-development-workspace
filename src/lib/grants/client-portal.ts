import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { RequestError } from "@/lib/record-policy";
import { audit, hash, managers, projectAccess } from "./access";
import { quoteFingerprint } from "./billing";
import { documentSchema } from "./document";
import { snapshot } from "./projects";

export const portalTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const issuePortalSchema = z.object({ quoteId: z.string().min(1).max(100) }).strict();
export const revokePortalSchema = z.object({ invitationId: z.string().min(1).max(100),
  reason: z.string().trim().min(10).max(1000) }).strict();
export const acceptPortalSchema = z.object({ token: portalTokenSchema,
  fullName: z.string().trim().min(2).max(150), email: z.email().max(250),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/), accepted: z.literal(true) }).strict();

export const newPortalToken = () => randomBytes(32).toString("base64url");
export const portalTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const INVITE_MS = 7 * 86400000;
const ACCESS_MS = 30 * 86400000;

type EventInput = { organizationId: string; invitationId: string; eventType: "INVITED" | "ACCEPTED" | "REVOKED";
  actorId?: string; clientName?: string; clientEmail?: string; statement: string; quoteHash: string };
async function appendEvent(tx: Prisma.TransactionClient, input: EventInput) {
  const { quoteHash, ...fields } = input;
  return tx.grantClientPortalEvent.create({ data: { ...fields,
    actorId: fields.actorId ?? null, clientName: fields.clientName ?? null, clientEmail: fields.clientEmail ?? null,
    evidenceHash: hash({ ...fields, quoteHash }) } });
}

async function currentQuote(tx: Prisma.TransactionClient, quoteId: string, organizationId: string,
  projectId: string, clientId?: string) {
  const quote = await tx.grantEngagementQuote.findFirst({ where: { id: quoteId, organizationId, projectId,
    ...(clientId ? { clientId } : {}) }, include: { client: true } });
  if (!quote || quote.status !== "APPROVED" || quote.quoteHash !== quoteFingerprint(quote) ||
      (quote.validUntil && quote.validUntil <= new Date()))
    throw new RequestError("A current approved engagement quote is required", 409);
  return quote;
}

export async function issuePortalInvitation(tx: Prisma.TransactionClient, actorId: string, projectId: string,
  quoteId: string, tokenHash: string) {
  const { project } = await projectAccess(tx, actorId, projectId, managers);
  const quote = await currentQuote(tx, quoteId, project.organizationId, projectId);
  const now = new Date();
  const active = await tx.grantClientPortalInvitation.findFirst({ where: {
    organizationId: project.organizationId, projectId, clientId: quote.clientId, revokedAt: null,
    OR: [{ acceptedAt: null, expiresAt: { gt: now } }, { acceptedAt: { not: null }, accessExpiresAt: { gt: now } }],
  } });
  if (active) throw new RequestError("An active client portal invitation or access link already exists; revoke it first", 409);
  const invitation = await tx.grantClientPortalInvitation.create({ data: {
    organizationId: project.organizationId, projectId, clientId: quote.clientId, quoteId: quote.id,
    recipientEmail: quote.client.billingEmail.toLowerCase(), quoteHash: quote.quoteHash,
    tokenHash, expiresAt: new Date(now.getTime() + INVITE_MS), createdById: actorId,
  } });
  await appendEvent(tx, { organizationId: project.organizationId, invitationId: invitation.id,
    eventType: "INVITED", actorId, clientEmail: invitation.recipientEmail, quoteHash: quote.quoteHash,
    statement: `A private, seven-day, one-use portal invitation was created for quote v${quote.version}. Manual handoff only; delivery is not verified.` });
  await audit(tx, actorId, "GRANT_CLIENT_PORTAL_INVITED", projectId, { invitationId: invitation.id,
    clientId: quote.clientId, quoteId: quote.id, quoteHash: quote.quoteHash,
    scope: "Invitation created; delivery and recipient identity are not verified" });
  return { id: invitation.id, quoteId: quote.id, clientId: quote.clientId,
    recipientEmail: invitation.recipientEmail, expiresAt: invitation.expiresAt };
}

export async function revokePortalInvitation(tx: Prisma.TransactionClient, actorId: string, projectId: string,
  invitationId: string, reason: string) {
  const { project } = await projectAccess(tx, actorId, projectId, managers);
  const invitation = await tx.grantClientPortalInvitation.findFirst({ where: {
    id: invitationId, organizationId: project.organizationId, projectId } });
  if (!invitation) throw new RequestError("Client portal invitation not found in this engagement", 404);
  const revokedAt = new Date();
  const changed = await tx.grantClientPortalInvitation.updateMany({ where: { id: invitation.id,
    organizationId: project.organizationId, revokedAt: null }, data: { revokedAt } });
  if (!changed.count) throw new RequestError("Client portal access was already revoked", 409);
  await appendEvent(tx, { organizationId: project.organizationId, invitationId: invitation.id,
    eventType: "REVOKED", actorId, quoteHash: invitation.quoteHash, statement: reason });
  await audit(tx, actorId, "GRANT_CLIENT_PORTAL_REVOKED", projectId, { invitationId: invitation.id, reason });
  return { revoked: true, revokedAt };
}

async function invitationForPreview(tx: Prisma.TransactionClient, token: string) {
  const invitation = await tx.grantClientPortalInvitation.findUnique({ where: { tokenHash: portalTokenHash(token) } });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date())
    throw new RequestError("Invitation is invalid, expired or already used", 409);
  const quote = await currentQuote(tx, invitation.quoteId, invitation.organizationId,
    invitation.projectId, invitation.clientId);
  if (quote.quoteHash !== invitation.quoteHash || quote.client.billingEmail.toLowerCase() !== invitation.recipientEmail)
    throw new RequestError("Invitation no longer matches the current client quote", 409);
  const project = await tx.grantProject.findFirst({ where: { id: invitation.projectId,
    organizationId: invitation.organizationId } });
  if (!project) throw new RequestError("Invitation project is unavailable", 409);
  return { invitation, quote, project };
}

export async function previewPortalInvitation(token: string) {
  const { invitation, quote, project } = await invitationForPreview(prisma, portalTokenSchema.parse(token));
  return { clientName: quote.client.legalName, recipientEmail: invitation.recipientEmail,
    projectTitle: project.title, quote: { version: quote.version, scope: quote.scope, feeCents: quote.feeCents,
      currency: quote.currency, quoteHash: quote.quoteHash, validUntil: quote.validUntil },
    invitationExpiresAt: invitation.expiresAt,
    notice: "The invited person must enter their own name and email to accept. Email ownership is not verified." };
}

export async function acceptPortalInvitation(input: z.infer<typeof acceptPortalSchema>, accessToken: string) {
  return prisma.$transaction(async tx => {
    const { invitation, quote } = await invitationForPreview(tx, input.token);
    if (input.quoteHash !== quote.quoteHash) throw new RequestError("Quote changed; review the current invitation", 409);
    const email = input.email.trim().toLowerCase();
    if (email !== invitation.recipientEmail) throw new RequestError("Enter the invited billing email", 403);
    const acceptedAt = new Date();
    const changed = await tx.grantClientPortalInvitation.updateMany({ where: { id: invitation.id,
      organizationId: invitation.organizationId, acceptedAt: null, revokedAt: null,
      expiresAt: { gt: acceptedAt }, quoteHash: quote.quoteHash }, data: {
        acceptedAt, accessTokenHash: portalTokenHash(accessToken),
        accessExpiresAt: new Date(acceptedAt.getTime() + ACCESS_MS),
      } });
    if (!changed.count) throw new RequestError("Invitation was already used, revoked or expired", 409);
    const statement = `I, ${input.fullName.trim()}, accept quote v${quote.version} (${quote.quoteHash}) for ${quote.currency} ${(quote.feeCents / 100).toFixed(2)} and the quoted scope shown to me.`;
    const event = await appendEvent(tx, { organizationId: invitation.organizationId, invitationId: invitation.id,
      eventType: "ACCEPTED", clientName: input.fullName.trim(), clientEmail: email,
      quoteHash: quote.quoteHash, statement });
    return { invitationId: invitation.id, acceptedAt, accessExpiresAt: new Date(acceptedAt.getTime() + ACCESS_MS),
      acceptanceEvidenceHash: event.evidenceHash };
  }, { isolationLevel: "Serializable" });
}

export async function portalSummary(token: string) {
  portalTokenSchema.parse(token);
  return prisma.$transaction(async tx => {
  const invitation = await tx.grantClientPortalInvitation.findUnique({ where: { accessTokenHash: portalTokenHash(token) },
    include: { client: true, project: true, quote: true,
      events: { where: { eventType: "ACCEPTED" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!invitation || !invitation.acceptedAt || invitation.revokedAt ||
      !invitation.accessExpiresAt || invitation.accessExpiresAt <= new Date())
    throw new RequestError("Portal access is invalid, expired or revoked", 403);
  const quote = await currentQuote(tx, invitation.quoteId, invitation.organizationId,
    invitation.projectId, invitation.clientId);
  if (quote.quoteHash !== invitation.quoteHash || invitation.recipientEmail !== quote.client.billingEmail.toLowerCase())
    throw new RequestError("The accepted quote is no longer current", 409);
  const invoice = await tx.grantInvoiceCandidate.findFirst({ where: { organizationId: invitation.organizationId,
    projectId: invitation.projectId, clientId: invitation.clientId, quoteId: invitation.quoteId, status: "CANDIDATE" },
    select: { id: true, amountCents: true, currency: true, status: true } });
  let approvedProposal: null | { version: number; contentHash: string; title: string; funder: string;
    program: string; sectionTitles: string[]; requestedOutcome: string; requestedAmountCents: number } = null;
  const project = invitation.project;
  if (["APPROVED", "FROZEN", "SUBMITTED"].includes(project.status)) {
    const content = await snapshot(tx, project.id);
    const contentHash = hash(content);
    let currentApproval = false;
    if (project.status === "APPROVED") {
      const organization = await tx.grantOrganization.findUniqueOrThrow({ where: { id: invitation.organizationId } });
      const reviews = await tx.grantReview.findMany({ where: { projectId: project.id,
        contentHash, approved: true }, select: { reviewerId: true } });
      let eligible = 0;
      for (const review of reviews) {
        const [member, user] = await Promise.all([
          tx.grantMembership.findUnique({ where: { organizationId_userId: {
            organizationId: invitation.organizationId, userId: review.reviewerId } } }),
          tx.user.findUnique({ where: { id: review.reviewerId }, select: { active: true } }),
        ]);
        if (member?.active && user?.active && ["OWNER", "MANAGER", "REVIEWER"].includes(member.role) &&
          (member.role !== "REVIEWER" || await tx.grantProjectAccess.findUnique({ where: { projectId_userId: {
            projectId: project.id, userId: review.reviewerId } } }))) eligible++;
      }
      currentApproval = eligible >= organization.reviewCount;
    } else {
      currentApproval = Boolean(await tx.grantPackage.findFirst({ where: {
        projectId: project.id, projectVersion: project.version, contentHash }, select: { id: true } }));
    }
    if (currentApproval) {
      const document = documentSchema.parse(project.document);
      approvedProposal = { version: project.version, contentHash, title: project.title, funder: project.funder,
        program: project.program, sectionTitles: document.sections.map(s => s.title),
        requestedOutcome: document.requestedOutcome, requestedAmountCents: content.budget.requestedCents };
    }
  }
  const acceptance = invitation.events[0];
  return { client: { legalName: invitation.client.legalName, billingEmail: invitation.recipientEmail },
    quote: { version: quote.version, scope: quote.scope, feeCents: quote.feeCents, currency: quote.currency,
      quoteHash: quote.quoteHash, approvedAt: quote.approvedAt, validUntil: quote.validUntil },
    acceptance: { name: acceptance?.clientName ?? "", at: invitation.acceptedAt,
      evidenceHash: acceptance?.evidenceHash ?? "", identityVerification: "SELF_ATTESTED_EMAIL_UNVERIFIED" },
    approvedProposal, invoiceCandidate: invoice,
    accessExpiresAt: invitation.accessExpiresAt,
    notice: "This is a read-only engagement summary. Invoice candidates and any reported payment status are unverified; no invoice delivery, funder submission or settled payment is established here." };
  }, { isolationLevel: "RepeatableRead" });
}
