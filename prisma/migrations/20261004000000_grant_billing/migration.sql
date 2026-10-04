CREATE UNIQUE INDEX "GrantProject_id_organizationId_key" ON "GrantProject"("id","organizationId");

CREATE TABLE "GrantBillingClient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "billingEmail" TEXT NOT NULL,
  "billingAddress" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrantBillingClient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "GrantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GrantBillingClient_id_organizationId_key" ON "GrantBillingClient"("id","organizationId");
CREATE UNIQUE INDEX "GrantBillingClient_organizationId_legalName_key" ON "GrantBillingClient"("organizationId","legalName");
CREATE INDEX "GrantBillingClient_organizationId_createdAt_idx" ON "GrantBillingClient"("organizationId","createdAt");

CREATE TABLE "GrantEngagementQuote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "scope" TEXT NOT NULL,
  "feeCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3),
  "quoteHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvalRationale" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "GrantEngagementQuote_projectId_organizationId_fkey" FOREIGN KEY ("projectId","organizationId") REFERENCES "GrantProject"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantEngagementQuote_clientId_organizationId_fkey" FOREIGN KEY ("clientId","organizationId") REFERENCES "GrantBillingClient"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantEngagementQuote_version_check" CHECK ("version" > 0),
  CONSTRAINT "GrantEngagementQuote_fee_check" CHECK ("feeCents" > 0),
  CONSTRAINT "GrantEngagementQuote_status_check" CHECK ("status" IN ('DRAFT','APPROVED','SUPERSEDED')),
  CONSTRAINT "GrantEngagementQuote_hash_check" CHECK (length("quoteHash")=64)
);
CREATE UNIQUE INDEX "GrantEngagementQuote_id_organizationId_key" ON "GrantEngagementQuote"("id","organizationId");
CREATE UNIQUE INDEX "GrantEngagementQuote_id_organizationId_projectId_clientId_key" ON "GrantEngagementQuote"("id","organizationId","projectId","clientId");
CREATE UNIQUE INDEX "GrantEngagementQuote_organizationId_projectId_clientId_vers_key" ON "GrantEngagementQuote"("organizationId","projectId","clientId","version");
CREATE UNIQUE INDEX "GrantEngagementQuote_one_approved_idx" ON "GrantEngagementQuote"("organizationId","projectId","clientId") WHERE "status"='APPROVED';
CREATE INDEX "GrantEngagementQuote_organizationId_projectId_status_idx" ON "GrantEngagementQuote"("organizationId","projectId","status");

CREATE TABLE "GrantInvoiceCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "quoteHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedById" TEXT,
  "voidReason" TEXT,
  "voidedAt" TIMESTAMP(3),
  CONSTRAINT "GrantInvoiceCandidate_quoteId_organizationId_projectId_cli_fkey" FOREIGN KEY ("quoteId","organizationId","projectId","clientId") REFERENCES "GrantEngagementQuote"("id","organizationId","projectId","clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantInvoiceCandidate_projectId_organizationId_fkey" FOREIGN KEY ("projectId","organizationId") REFERENCES "GrantProject"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantInvoiceCandidate_clientId_organizationId_fkey" FOREIGN KEY ("clientId","organizationId") REFERENCES "GrantBillingClient"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantInvoiceCandidate_amount_check" CHECK ("amountCents" > 0),
  CONSTRAINT "GrantInvoiceCandidate_status_check" CHECK ("status" IN ('CANDIDATE','VOID')),
  CONSTRAINT "GrantInvoiceCandidate_hash_check" CHECK (length("quoteHash")=64)
);
CREATE UNIQUE INDEX "GrantInvoiceCandidate_quoteId_key" ON "GrantInvoiceCandidate"("quoteId");
CREATE UNIQUE INDEX "GrantInvoiceCandidate_id_organizationId_key" ON "GrantInvoiceCandidate"("id","organizationId");
CREATE UNIQUE INDEX "GrantInvoiceCandidate_one_active_idx" ON "GrantInvoiceCandidate"("organizationId","projectId","clientId") WHERE "status"='CANDIDATE';
CREATE INDEX "GrantInvoiceCandidate_organizationId_projectId_status_idx" ON "GrantInvoiceCandidate"("organizationId","projectId","status");

CREATE TABLE "GrantBillingEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "externalReference" TEXT NOT NULL,
  "evidenceText" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrantBillingEvidence_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId","organizationId") REFERENCES "GrantInvoiceCandidate"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantBillingEvidence_event_check" CHECK ("eventType" IN ('INVOICE_SENT_REPORTED','PAYMENT_PENDING_REPORTED','PAYMENT_RECEIVED_REPORTED')),
  CONSTRAINT "GrantBillingEvidence_verification_check" CHECK ("verificationStatus"='UNVERIFIED'),
  CONSTRAINT "GrantBillingEvidence_hash_check" CHECK (length("evidenceHash")=64)
);
CREATE INDEX "GrantBillingEvidence_organizationId_invoiceId_recordedAt_idx" ON "GrantBillingEvidence"("organizationId","invoiceId","recordedAt");
CREATE FUNCTION retain_grant_billing_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Billing status evidence is append-only';
END $$;
CREATE TRIGGER retain_grant_billing_evidence BEFORE UPDATE OR DELETE ON "GrantBillingEvidence" FOR EACH ROW EXECUTE FUNCTION retain_grant_billing_evidence();
