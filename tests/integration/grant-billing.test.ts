import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { billingAction, billingActionSchema, billingView, quoteFingerprint } from "../../src/lib/grants/billing";
import { createProject } from "../../src/lib/grants/projects";
import { emptyDocument } from "../../src/lib/grants/document";
import { mutation } from "../../src/lib/grants/access";

if (!new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid").pathname.startsWith("/inspection_test_grant_"))
  throw Error("Run grant billing integration against a disposable grant database");

test("billing is client and organization scoped, approved independently, and payment reports stay unverified", async () => {
  const users = await Promise.all(["owner", "manager", "editor", "other"].map(name => prisma.user.create({ data: {
    name, email: `${name}-${randomUUID()}@test.invalid`, passwordHash: "unused", role: "ANALYST",
  } })));
  const [owner, manager, editor, other] = users;
  const orgA = await prisma.grantOrganization.create({ data: { name: "Grant billing organization A",
    memberships: { create: [{ userId: owner.id, role: "OWNER" }, { userId: manager.id, role: "MANAGER" },
      { userId: editor.id, role: "EDITOR" }] } } });
  const orgB = await prisma.grantOrganization.create({ data: { name: "Grant billing organization B",
    memberships: { create: [{ userId: other.id, role: "OWNER" }] } } });
  const projectInput = { title: "Housing support proposal", funder: "Fixture funder", program: "Housing",
    dueAt: null, currency: "USD" as const, document: emptyDocument };
  const projectA = await mutation(owner.id, orgA.id, randomUUID(), "project.create", projectInput,
    tx => createProject(tx, owner.id, orgA.id, projectInput)) as { id: string };
  const projectB = await mutation(other.id, orgB.id, randomUUID(), "project.create", projectInput,
    tx => createProject(tx, other.id, orgB.id, projectInput)) as { id: string };
  await prisma.grantProjectAccess.create({ data: { projectId: projectA.id, userId: editor.id } });
  const run = (actorId: string, organizationId: string, projectId: string, input: unknown, key = randomUUID()) =>
    mutation(actorId, organizationId, key, "project.billing", { projectId, input },
      tx => billingAction(tx, actorId, projectId, billingActionSchema.parse(input)));

  const clientInput = { action: "CREATE_CLIENT", legalName: "Community Services Inc",
    billingEmail: "billing@community.test", billingAddress: "100 Main Street, Albany NY 12207", contactName: "Ruth Client" };
  await assert.rejects(() => run(editor.id, orgA.id, projectA.id, clientInput), /authorized organization role/);
  const clientA = (await run(owner.id, orgA.id, projectA.id, clientInput)) as { client: { id: string } };
  const clientB = (await run(other.id, orgB.id, projectB.id, { ...clientInput, legalName: "Other Agency" })) as { client: { id: string } };
  assert.equal((await billingView(prisma, owner.id, projectA.id)).clients.length, 1);
  assert.equal((await billingView(prisma, other.id, projectB.id)).clients.length, 1);
  await assert.rejects(() => billingView(prisma, other.id, projectA.id), /Organization access/);
  await assert.rejects(() => run(owner.id, orgA.id, projectA.id, {
    action: "DRAFT_QUOTE", clientId: clientB.client.id, scope: "Develop one cited housing support grant application.",
    feeAmount: "2500.00", validUntil: null,
  }), /client is not in this organization/);

  const draftInput = { action: "DRAFT_QUOTE", clientId: clientA.client.id,
    scope: "Develop one cited housing support grant application and review the budget narrative.",
    feeAmount: "2500.00", validUntil: null };
  const quote = (await run(owner.id, orgA.id, projectA.id, draftInput)) as { quote: {
    id: string; version: number; quoteHash: string; feeCents: number; status: string } };
  assert.equal(quote.quote.version, 1); assert.equal(quote.quote.feeCents, 250000);
  await assert.rejects(() => run(manager.id, orgA.id, projectA.id, {
    action: "CREATE_INVOICE_CANDIDATE", quoteId: quote.quote.id,
  }), /current approved/);
  const approval = { action: "APPROVE_QUOTE", quoteId: quote.quote.id, quoteHash: quote.quote.quoteHash,
    rationale: "Independently checked the client, deliverables and fixed fee against the draft." };
  await assert.rejects(() => run(owner.id, orgA.id, projectA.id, approval), /creator cannot approve/);
  await assert.rejects(() => run(manager.id, orgA.id, projectA.id, { ...approval, quoteHash: "0".repeat(64) }), /changed/);
  const approved = (await run(manager.id, orgA.id, projectA.id, approval)) as { quote: { status: string } };
  assert.equal(approved.quote.status, "APPROVED");
  const invoice = (await run(manager.id, orgA.id, projectA.id, { action: "CREATE_INVOICE_CANDIDATE", quoteId: quote.quote.id })) as {
    invoice: { id: string; status: string; amountCents: number; quoteHash: string } };
  assert.equal(invoice.invoice.status, "CANDIDATE"); assert.equal(invoice.invoice.amountCents, 250000);
  assert.equal(invoice.invoice.quoteHash, quote.quote.quoteHash);
  await assert.rejects(() => run(manager.id, orgA.id, projectA.id, {
    action: "CREATE_INVOICE_CANDIDATE", quoteId: quote.quote.id,
  }), /already exists/);
  await assert.rejects(() => run(manager.id, orgA.id, projectA.id, {
    action: "RECORD_PAYMENT_STATUS", invoiceId: invoice.invoice.id, eventType: "PAYMENT_RECEIVED_REPORTED",
    externalReference: "PORTAL-12345", evidenceText: "Operator says payment arrived but has no provider receipt.",
  }), /invoice-sent evidence/);
  const sentInput = { action: "RECORD_PAYMENT_STATUS", invoiceId: invoice.invoice.id, eventType: "INVOICE_SENT_REPORTED",
    externalReference: "EMAIL-12345", evidenceText: "Copied client email reports the invoice was sent for review." };
  const sentKey = randomUUID();
  const sent = (await run(manager.id, orgA.id, projectA.id, sentInput, sentKey)) as { evidence: {
    id: string; verificationStatus: string; eventType: string } };
  assert.equal(sent.evidence.verificationStatus, "UNVERIFIED");
  const retried = (await run(manager.id, orgA.id, projectA.id, sentInput, sentKey)) as { evidence: { id: string } };
  assert.equal(retried.evidence.id, sent.evidence.id, "idempotent retries cannot duplicate evidence");
  const received = (await run(manager.id, orgA.id, projectA.id, {
    action: "RECORD_PAYMENT_STATUS", invoiceId: invoice.invoice.id, eventType: "PAYMENT_RECEIVED_REPORTED",
    externalReference: "PORTAL-12345", evidenceText: "Operator copied a payment-received status from a portal message.",
  })) as { evidence: { verificationStatus: string } };
  assert.equal(received.evidence.verificationStatus, "UNVERIFIED");
  await assert.rejects(() => run(manager.id, orgA.id, projectA.id, {
    action: "VOID_INVOICE_CANDIDATE", invoiceId: invoice.invoice.id,
    reason: "Attempted to remove a candidate with payment reports",
  }), /retain it for review/);
  const view = await billingView(prisma, owner.id, projectA.id);
  assert.equal(view.invoices[0].status, "CANDIDATE");
  assert.equal(view.invoices[0].evidence.length, 2);
  assert.ok(view.invoices[0].evidence.every(event => event.verificationStatus === "UNVERIFIED"));
  await assert.rejects(() => prisma.grantBillingEvidence.update({ where: { id: sent.evidence.id },
    data: { evidenceText: "Rewritten evidence" } }), /append-only/);

  const revision = (await run(owner.id, orgA.id, projectA.id, { ...draftInput, feeAmount: "2600.00" })) as {
    quote: { id: string; version: number; quoteHash: string } };
  assert.equal(revision.quote.version, 2);
  await run(manager.id, orgA.id, projectA.id, { ...approval, quoteId: revision.quote.id,
    quoteHash: revision.quote.quoteHash });
  assert.equal((await prisma.grantEngagementQuote.findUniqueOrThrow({ where: { id: quote.quote.id } })).status, "SUPERSEDED");
  await assert.rejects(() => run(manager.id, orgA.id, projectA.id, {
    action: "CREATE_INVOICE_CANDIDATE", quoteId: revision.quote.id,
  }), /already exists/);
  await assert.rejects(() => prisma.grantEngagementQuote.create({ data: {
    organizationId: orgA.id, projectId: projectA.id, clientId: clientB.client.id, version: 1,
    scope: "Cross-organization quote must fail", feeCents: 100, currency: "USD", validUntil: null,
    quoteHash: quoteFingerprint({ organizationId: orgA.id, projectId: projectA.id, clientId: clientB.client.id,
      version: 1, scope: "Cross-organization quote must fail", feeCents: 100, currency: "USD", validUntil: null }),
    createdById: owner.id,
  } }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003");
  await prisma.$disconnect();
});
