import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { mutation, hash } from "../../src/lib/grants/access";
import { billingAction, billingActionSchema } from "../../src/lib/grants/billing";
import { createProject, snapshot } from "../../src/lib/grants/projects";
import { emptyDocument } from "../../src/lib/grants/document";
import { acceptPortalInvitation, issuePortalInvitation, newPortalToken, portalSummary,
  portalTokenHash, previewPortalInvitation, revokePortalInvitation } from "../../src/lib/grants/client-portal";

if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.startsWith("/inspection_test_grant_"))
  throw Error("Run grant client portal integration against a disposable grant database");

test("client portal enforces quote, organization, one-use acceptance, immutable evidence and revocation", async () => {
  const [ownerA, managerA, ownerB] = await Promise.all(["portal-owner-a", "portal-manager-a", "portal-owner-b"].map(name =>
    prisma.user.create({ data: { name, email: `${name}-${randomUUID()}@test.invalid`, passwordHash: "unused" } })));
  const orgA = await prisma.grantOrganization.create({ data: { name: "Portal organization A", reviewCount: 1,
    memberships: { create: [{ userId: ownerA.id, role: "OWNER" }, { userId: managerA.id, role: "MANAGER" }] } } });
  const orgB = await prisma.grantOrganization.create({ data: { name: "Portal organization B", reviewCount: 1,
    memberships: { create: [{ userId: ownerB.id, role: "OWNER" }] } } });
  const projectInput = { title: "Youth services grant", funder: "Fixture funder", program: "Youth", dueAt: null,
    currency: "USD" as const, document: emptyDocument };
  const projectA = await mutation(ownerA.id, orgA.id, randomUUID(), "project.create", projectInput,
    tx => createProject(tx, ownerA.id, orgA.id, projectInput)) as { id: string };
  const projectB = await mutation(ownerB.id, orgB.id, randomUUID(), "project.create", projectInput,
    tx => createProject(tx, ownerB.id, orgB.id, projectInput)) as { id: string };
  const bill = (actorId: string, orgId: string, projectId: string, input: unknown) =>
    mutation(actorId, orgId, randomUUID(), "project.billing", { projectId, input },
      tx => billingAction(tx, actorId, projectId, billingActionSchema.parse(input)));
  const clientInput = { action: "CREATE_CLIENT", legalName: "Client A", billingEmail: "billing@client.test",
    billingAddress: "100 Main Street, Albany NY 12207", contactName: "Ruth Client" };
  const clientA = (await bill(ownerA.id, orgA.id, projectA.id, clientInput)) as { client: { id: string } };
  const clientB = (await bill(ownerB.id, orgB.id, projectB.id, { ...clientInput, legalName: "Client B" })) as { client: { id: string } };
  const quoteInput = { action: "DRAFT_QUOTE", scope: "Prepare and review the cited youth services grant proposal.",
    feeAmount: "2500.00", validUntil: null };
  const quoteA = (await bill(ownerA.id, orgA.id, projectA.id, { ...quoteInput, clientId: clientA.client.id })) as {
    quote: { id: string; quoteHash: string } };
  const quoteB = (await bill(ownerB.id, orgB.id, projectB.id, { ...quoteInput,
    clientId: clientB.client.id, feeAmount: "9999.00" })) as { quote: { id: string; quoteHash: string } };
  await bill(managerA.id, orgA.id, projectA.id, { action: "APPROVE_QUOTE", quoteId: quoteA.quote.id,
    quoteHash: quoteA.quote.quoteHash, rationale: "Independently checked client scope and fee before sharing." });
  // Organization B needs a distinct approver for its quote.
  const managerB = await prisma.user.create({ data: { name: "portal-manager-b",
    email: `portal-manager-b-${randomUUID()}@test.invalid`, passwordHash: "unused" } });
  await prisma.grantMembership.create({ data: { organizationId: orgB.id, userId: managerB.id, role: "MANAGER" } });
  await bill(managerB.id, orgB.id, projectB.id, { action: "APPROVE_QUOTE", quoteId: quoteB.quote.id,
    quoteHash: quoteB.quote.quoteHash, rationale: "Independently checked second client scope and fee." });

  const invitationTokenA = newPortalToken();
  const issueA = await mutation(ownerA.id, orgA.id, randomUUID(), "client.portal.invite",
    { projectId: projectA.id, quoteId: quoteA.quote.id }, tx => issuePortalInvitation(tx,
      ownerA.id, projectA.id, quoteA.quote.id, portalTokenHash(invitationTokenA))) as { id: string };
  const invitationTokenB = newPortalToken();
  const issueB = await mutation(ownerB.id, orgB.id, randomUUID(), "client.portal.invite",
    { projectId: projectB.id, quoteId: quoteB.quote.id }, tx => issuePortalInvitation(tx,
      ownerB.id, projectB.id, quoteB.quote.id, portalTokenHash(invitationTokenB))) as { id: string };
  await assert.rejects(() => prisma.$transaction(tx => issuePortalInvitation(tx, ownerB.id,
    projectA.id, quoteA.quote.id, portalTokenHash(newPortalToken()))), /Organization access/);
  await assert.rejects(() => prisma.$transaction(tx => revokePortalInvitation(tx, ownerA.id,
    projectA.id, issueB.id, "This belongs to another organization")), /not found in this engagement/);
  const previewA = await previewPortalInvitation(invitationTokenA);
  assert.equal(previewA.quote.feeCents, 250000);
  assert.equal(previewA.clientName, "Client A");
  await assert.rejects(() => acceptPortalInvitation({ token: invitationTokenA, fullName: "Ruth Client",
    email: "someone@else.test", quoteHash: previewA.quote.quoteHash, accepted: true }, newPortalToken()), /invited billing email/);
  await assert.rejects(() => acceptPortalInvitation({ token: invitationTokenA, fullName: "Ruth Client",
    email: "billing@client.test", quoteHash: "0".repeat(64), accepted: true }, newPortalToken()), /Quote changed/);
  const accessTokenA = newPortalToken();
  const acceptanceA = await acceptPortalInvitation({ token: invitationTokenA, fullName: "Ruth Client",
    email: "billing@client.test", quoteHash: previewA.quote.quoteHash, accepted: true }, accessTokenA);
  assert.equal(acceptanceA.invitationId, issueA.id);
  await assert.rejects(() => previewPortalInvitation(invitationTokenA), /already used/);
  await assert.rejects(() => acceptPortalInvitation({ token: invitationTokenA, fullName: "Ruth Client",
    email: "billing@client.test", quoteHash: previewA.quote.quoteHash, accepted: true }, newPortalToken()), /already used/);
  const accessTokenB = newPortalToken();
  await acceptPortalInvitation({ token: invitationTokenB, fullName: "B Contact", email: "billing@client.test",
    quoteHash: quoteB.quote.quoteHash, accepted: true }, accessTokenB);
  const viewA = await portalSummary(accessTokenA);
  const viewB = await portalSummary(accessTokenB);
  assert.equal(viewA.client.legalName, "Client A");
  assert.equal(viewA.quote.feeCents, 250000);
  assert.equal(viewB.client.legalName, "Client B");
  assert.equal(viewB.quote.feeCents, 999900);
  assert.equal(viewA.approvedProposal, null, "draft proposal content cannot appear in client portal");
  assert.equal(viewA.acceptance.name, "Ruth Client");
  assert.equal(viewA.acceptance.identityVerification, "SELF_ATTESTED_EMAIL_UNVERIFIED");
  assert.equal(viewA.invoiceCandidate, null);
  const rowA = await prisma.grantClientPortalInvitation.findUniqueOrThrow({ where: { id: issueA.id } });
  assert.notEqual(rowA.tokenHash, invitationTokenA);
  assert.notEqual(rowA.accessTokenHash, accessTokenA);
  const receipts = await prisma.grantMutation.findMany({ where: { organizationId: orgA.id,
    action: "client.portal.invite" } });
  assert.ok(receipts.every(receipt => !JSON.stringify(receipt).includes(invitationTokenA)));
  const acceptedEvent = await prisma.grantClientPortalEvent.findFirstOrThrow({ where: {
    invitationId: issueA.id, eventType: "ACCEPTED" } });
  assert.equal(acceptedEvent.evidenceHash, acceptanceA.acceptanceEvidenceHash);
  assert.match(acceptedEvent.statement, /I, Ruth Client, accept quote v1/);
  await assert.rejects(() => prisma.grantClientPortalEvent.update({ where: { id: acceptedEvent.id },
    data: { clientName: "Altered" } }), /append-only/);
  await assert.rejects(() => prisma.grantClientPortalInvitation.update({ where: { id: issueA.id },
    data: { recipientEmail: "altered@test.invalid" } }), /cannot be rewritten/);

  const content = await snapshot(prisma, projectA.id);
  await prisma.grantReview.create({ data: { projectId: projectA.id, reviewerId: managerA.id,
    contentHash: hash(content), approved: true, reason: "Reviewed approved fixture" } });
  await prisma.grantProject.update({ where: { id: projectA.id }, data: { status: "APPROVED" } });
  const approvedView = await portalSummary(accessTokenA);
  assert.equal(approvedView.approvedProposal?.title, "Youth services grant");
  assert.equal(approvedView.approvedProposal?.contentHash, hash(content));
  const revised = (await bill(ownerA.id, orgA.id, projectA.id, { ...quoteInput,
    clientId: clientA.client.id, feeAmount: "2600.00" })) as { quote: { id: string; quoteHash: string } };
  await bill(managerA.id, orgA.id, projectA.id, { action: "APPROVE_QUOTE", quoteId: revised.quote.id,
    quoteHash: revised.quote.quoteHash, rationale: "Independently approved the revised engagement price." });
  await assert.rejects(() => portalSummary(accessTokenA), /current approved engagement quote/,
    "a newer approved price must invalidate old client access");
  await mutation(managerA.id, orgA.id, randomUUID(), "client.portal.revoke", { projectId: projectA.id,
    invitationId: issueA.id }, tx => revokePortalInvitation(tx, managerA.id, projectA.id,
    issueA.id, "Client requested that portal access be withdrawn"));
  await assert.rejects(() => portalSummary(accessTokenA), /revoked/);
  assert.equal((await portalSummary(accessTokenB)).client.legalName, "Client B",
    "revocation in A cannot affect B");
  assert.equal(await prisma.grantClientPortalEvent.count({ where: { invitationId: issueA.id } }), 3);

  const expiredToken = newPortalToken();
  await prisma.grantClientPortalInvitation.create({ data: { organizationId: orgA.id,
    projectId: projectA.id, clientId: clientA.client.id, quoteId: quoteA.quote.id,
    recipientEmail: "billing@client.test", quoteHash: quoteA.quote.quoteHash,
    tokenHash: portalTokenHash(expiredToken), expiresAt: new Date(Date.now() - 1000), createdById: ownerA.id } });
  await assert.rejects(() => previewPortalInvitation(expiredToken), /expired/);
  const expiredAccess = newPortalToken();
  await prisma.grantClientPortalInvitation.create({ data: { organizationId: orgA.id,
    projectId: projectA.id, clientId: clientA.client.id, quoteId: revised.quote.id,
    recipientEmail: "billing@client.test", quoteHash: revised.quote.quoteHash,
    tokenHash: portalTokenHash(newPortalToken()), expiresAt: new Date(Date.now() - 86400000),
    acceptedAt: new Date(Date.now() - 86400000), accessTokenHash: portalTokenHash(expiredAccess),
    accessExpiresAt: new Date(Date.now() - 1000), createdById: ownerA.id } });
  await assert.rejects(() => portalSummary(expiredAccess), /expired/);
  await prisma.$disconnect();
});
