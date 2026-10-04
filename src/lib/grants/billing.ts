import { Prisma } from "@prisma/client";
import { z } from "zod";
import { RequestError } from "@/lib/record-policy";
import { audit, editors, hash, managers, projectAccess } from "./access";

export const clientSchema = z.object({
  action: z.literal("CREATE_CLIENT"),
  legalName: z.string().trim().min(2).max(200),
  billingEmail: z.email().max(250),
  billingAddress: z.string().trim().min(10).max(1000),
  contactName: z.string().trim().min(2).max(150),
}).strict();
const draftSchema = z.object({
  action: z.literal("DRAFT_QUOTE"),
  clientId: z.string().min(1).max(100),
  scope: z.string().trim().min(20).max(5000),
  feeAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a positive amount with at most two decimal places"),
  validUntil: z.iso.date().nullable().default(null),
}).strict();
const approvalSchema = z.object({
  action: z.literal("APPROVE_QUOTE"),
  quoteId: z.string().min(1).max(100),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  rationale: z.string().trim().min(20).max(2000),
}).strict();
const invoiceSchema = z.object({ action: z.literal("CREATE_INVOICE_CANDIDATE"), quoteId: z.string().min(1).max(100) }).strict();
const voidSchema = z.object({
  action: z.literal("VOID_INVOICE_CANDIDATE"), invoiceId: z.string().min(1).max(100),
  reason: z.string().trim().min(10).max(2000),
}).strict();
const evidenceSchema = z.object({
  action: z.literal("RECORD_PAYMENT_STATUS"),
  invoiceId: z.string().min(1).max(100),
  eventType: z.enum(["INVOICE_SENT_REPORTED", "PAYMENT_PENDING_REPORTED", "PAYMENT_RECEIVED_REPORTED"]),
  externalReference: z.string().trim().min(5).max(200),
  evidenceText: z.string().trim().min(20).max(10000),
}).strict();
export const billingActionSchema = z.discriminatedUnion("action", [clientSchema, draftSchema, approvalSchema, invoiceSchema, voidSchema, evidenceSchema]);
export type BillingAction = z.infer<typeof billingActionSchema>;

export function feeCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new RequestError("Enter a positive fee with at most two decimal places");
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > 2_000_000_000n) throw new RequestError("Quoted fee must be between 0.01 and 20,000,000.00 in the project currency");
  return Number(cents);
}
export function quoteFingerprint(quote: { organizationId: string; projectId: string; clientId: string;
  version: number; scope: string; feeCents: number; currency: string; validUntil: Date | null }) {
  return hash({ organizationId: quote.organizationId, projectId: quote.projectId, clientId: quote.clientId,
    version: quote.version, scope: quote.scope, feeCents: quote.feeCents, currency: quote.currency,
    validUntil: quote.validUntil?.toISOString() ?? null });
}
function requireRole(role: string, allowed: string[]) {
  if (!allowed.includes(role)) throw new RequestError("Billing action requires an authorized organization role", 403);
}
async function invoiceInScope(tx: Prisma.TransactionClient, projectId: string, organizationId: string, invoiceId: string) {
  const invoice = await tx.grantInvoiceCandidate.findFirst({ where: { id: invoiceId, projectId, organizationId } });
  if (!invoice) throw new RequestError("Invoice candidate not found in this engagement", 404);
  return invoice;
}

export async function billingView(tx: Prisma.TransactionClient, actorId: string, projectId: string) {
  const { project, member } = await projectAccess(tx, actorId, projectId, editors);
  const [clients, quotes, invoices, portalInvitations] = await Promise.all([
    tx.grantBillingClient.findMany({ where: { organizationId: project.organizationId }, orderBy: { createdAt: "desc" }, take: 200 }),
    tx.grantEngagementQuote.findMany({ where: { organizationId: project.organizationId, projectId }, orderBy: [{ createdAt: "desc" }, { version: "desc" }], take: 200 }),
    tx.grantInvoiceCandidate.findMany({ where: { organizationId: project.organizationId, projectId },
      include: { evidence: { orderBy: { recordedAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    tx.grantClientPortalInvitation.findMany({ where: { organizationId: project.organizationId, projectId },
      select: { id: true, clientId: true, quoteId: true, recipientEmail: true, quoteHash: true,
        expiresAt: true, acceptedAt: true, accessExpiresAt: true, revokedAt: true, createdAt: true,
        events: { select: { id: true, eventType: true, actorId: true, clientName: true, clientEmail: true,
          statement: true, evidenceHash: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return { project: { id: project.id, title: project.title, currency: project.currency, organizationId: project.organizationId },
    actorId, role: member.role, clients, quotes, invoices, portalInvitations,
    scope: "Invoice candidates and operator-entered payment events are internal records; no payment provider receipt has been verified" };
}

export async function billingAction(tx: Prisma.TransactionClient, actorId: string, projectId: string, input: BillingAction) {
  const { project, member } = await projectAccess(tx, actorId, projectId, editors);
  const organizationId = project.organizationId;
  if (input.action === "CREATE_CLIENT") {
    requireRole(member.role, managers);
    const client = await tx.grantBillingClient.create({ data: { organizationId, legalName: input.legalName,
      billingEmail: input.billingEmail.toLowerCase(), billingAddress: input.billingAddress,
      contactName: input.contactName, createdById: actorId } });
    await audit(tx, actorId, "GRANT_BILLING_CLIENT_RECORDED", projectId, { clientId: client.id,
      scope: "Billing profile recorded; client consent and portal access not asserted" });
    return { client };
  }
  if (input.action === "DRAFT_QUOTE") {
    const client = await tx.grantBillingClient.findFirst({ where: { id: input.clientId, organizationId } });
    if (!client) throw new RequestError("Billing client is not in this organization", 404);
    const validUntil = input.validUntil ? new Date(`${input.validUntil}T23:59:59.999Z`) : null;
    if (validUntil && validUntil <= new Date()) throw new RequestError("Quote expiry must be in the future");
    const latest = await tx.grantEngagementQuote.findFirst({ where: { organizationId, projectId, clientId: client.id },
      orderBy: { version: "desc" }, select: { version: true } });
    const values = { organizationId, projectId, clientId: client.id, version: (latest?.version ?? 0) + 1,
      scope: input.scope, feeCents: feeCents(input.feeAmount), currency: project.currency, validUntil };
    const quote = await tx.grantEngagementQuote.create({ data: { ...values,
      quoteHash: quoteFingerprint(values), createdById: actorId } });
    await audit(tx, actorId, "GRANT_ENGAGEMENT_QUOTE_DRAFTED", projectId, { quoteId: quote.id,
      clientId: client.id, version: quote.version, quoteHash: quote.quoteHash, feeCents: quote.feeCents,
      scope: "Operator-quoted engagement scope and price; client acceptance not verified" });
    return { quote };
  }
  if (input.action === "APPROVE_QUOTE") {
    requireRole(member.role, managers);
    const quote = await tx.grantEngagementQuote.findFirst({ where: { id: input.quoteId, organizationId, projectId } });
    if (!quote) throw new RequestError("Quote not found in this engagement", 404);
    if (quote.status !== "DRAFT") throw new RequestError("Only a draft quote can be approved", 409);
    if (quote.createdById === actorId) throw new RequestError("The quote creator cannot approve their own price", 403);
    if (quote.quoteHash !== input.quoteHash || quote.quoteHash !== quoteFingerprint(quote))
      throw new RequestError("Quote scope or price changed; review the current version", 409);
    if (quote.validUntil && quote.validUntil <= new Date()) throw new RequestError("Quote has expired", 409);
    await tx.grantEngagementQuote.updateMany({ where: { organizationId, projectId, clientId: quote.clientId,
      status: "APPROVED" }, data: { status: "SUPERSEDED" } });
    const approved = await tx.grantEngagementQuote.update({ where: { id: quote.id }, data: {
      status: "APPROVED", approvedById: actorId, approvalRationale: input.rationale, approvedAt: new Date() } });
    await audit(tx, actorId, "GRANT_ENGAGEMENT_QUOTE_APPROVED", projectId, { quoteId: quote.id,
      quoteHash: quote.quoteHash, rationale: input.rationale,
      scope: "Independent internal approval of operator-quoted terms; client acceptance not verified" });
    return { quote: approved };
  }
  if (input.action === "CREATE_INVOICE_CANDIDATE") {
    requireRole(member.role, managers);
    const quote = await tx.grantEngagementQuote.findFirst({ where: { id: input.quoteId, organizationId, projectId } });
    if (!quote || quote.status !== "APPROVED" || quote.quoteHash !== quoteFingerprint(quote))
      throw new RequestError("A current approved engagement quote is required", 409);
    if (quote.validUntil && quote.validUntil <= new Date()) throw new RequestError("The approved quote has expired", 409);
    const active = await tx.grantInvoiceCandidate.findFirst({ where: { organizationId, projectId,
      clientId: quote.clientId, status: "CANDIDATE" } });
    if (active) throw new RequestError("An invoice candidate already exists for this client engagement", 409);
    const invoice = await tx.grantInvoiceCandidate.create({ data: { organizationId, projectId,
      clientId: quote.clientId, quoteId: quote.id, amountCents: quote.feeCents,
      currency: quote.currency, quoteHash: quote.quoteHash, createdById: actorId } });
    await audit(tx, actorId, "GRANT_INVOICE_CANDIDATE_CREATED", projectId, { invoiceId: invoice.id,
      quoteId: quote.id, quoteHash: quote.quoteHash, amountCents: invoice.amountCents,
      scope: "Internal invoice candidate only; no invoice sent or payment verified" });
    return { invoice };
  }
  if (input.action === "VOID_INVOICE_CANDIDATE") {
    requireRole(member.role, managers);
    const invoice = await invoiceInScope(tx, projectId, organizationId, input.invoiceId);
    if (invoice.status !== "CANDIDATE") throw new RequestError("Only an active invoice candidate can be voided", 409);
    if (await tx.grantBillingEvidence.count({ where: { organizationId, invoiceId: invoice.id } }))
      throw new RequestError("This invoice has status evidence; retain it for review rather than voiding", 409);
    const voided = await tx.grantInvoiceCandidate.update({ where: { id: invoice.id }, data: {
      status: "VOID", voidedById: actorId, voidReason: input.reason, voidedAt: new Date() } });
    await audit(tx, actorId, "GRANT_INVOICE_CANDIDATE_VOIDED", projectId, { invoiceId: invoice.id, reason: input.reason });
    return { invoice: voided };
  }
  requireRole(member.role, managers);
  const invoice = await invoiceInScope(tx, projectId, organizationId, input.invoiceId);
  if (invoice.status !== "CANDIDATE") throw new RequestError("Payment status requires an active invoice candidate", 409);
  const events = await tx.grantBillingEvidence.findMany({ where: { organizationId, invoiceId: invoice.id },
    orderBy: { recordedAt: "asc" } });
  if (input.eventType !== "INVOICE_SENT_REPORTED" && !events.some(e => e.eventType === "INVOICE_SENT_REPORTED"))
    throw new RequestError("Record invoice-sent evidence before a payment status report", 409);
  if (input.eventType === "INVOICE_SENT_REPORTED" && events.some(e => e.eventType === "INVOICE_SENT_REPORTED"))
    throw new RequestError("Invoice-sent evidence was already recorded", 409);
  if (events.some(e => e.eventType === "PAYMENT_RECEIVED_REPORTED"))
    throw new RequestError("A payment-received report is already recorded; resolve it outside this candidate workflow", 409);
  const evidenceHash = hash({ eventType: input.eventType, externalReference: input.externalReference,
    evidenceText: input.evidenceText, invoiceId: invoice.id });
  const evidence = await tx.grantBillingEvidence.create({ data: { organizationId, invoiceId: invoice.id,
    eventType: input.eventType, externalReference: input.externalReference,
    evidenceText: input.evidenceText, evidenceHash, verificationStatus: "UNVERIFIED", recordedById: actorId } });
  await audit(tx, actorId, "GRANT_BILLING_STATUS_REPORTED", projectId, { invoiceId: invoice.id,
    evidenceId: evidence.id, eventType: input.eventType, evidenceHash,
    scope: "Operator-entered status only; actual provider receipt and settled payment are not verified" });
  return { evidence };
}
