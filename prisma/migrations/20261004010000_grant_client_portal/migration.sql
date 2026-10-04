CREATE TABLE "GrantClientPortalInvitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "quoteHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "accessTokenHash" TEXT,
  "accessExpiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrantClientPortalInvitation_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "GrantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantClientPortalInvitation_project_fkey" FOREIGN KEY ("projectId","organizationId") REFERENCES "GrantProject"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantClientPortalInvitation_client_fkey" FOREIGN KEY ("clientId","organizationId") REFERENCES "GrantBillingClient"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantClientPortalInvitation_quote_fkey" FOREIGN KEY ("quoteId","organizationId","projectId","clientId") REFERENCES "GrantEngagementQuote"("id","organizationId","projectId","clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantClientPortalInvitation_hash_check" CHECK (length("quoteHash")=64 AND length("tokenHash")=64 AND ("accessTokenHash" IS NULL OR length("accessTokenHash")=64)),
  CONSTRAINT "GrantClientPortalInvitation_acceptance_check" CHECK (("acceptedAt" IS NULL AND "accessTokenHash" IS NULL AND "accessExpiresAt" IS NULL) OR ("acceptedAt" IS NOT NULL AND "accessTokenHash" IS NOT NULL AND "accessExpiresAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "GrantClientPortalInvitation_id_org_key" ON "GrantClientPortalInvitation"("id","organizationId");
CREATE UNIQUE INDEX "GrantClientPortalInvitation_tokenHash_key" ON "GrantClientPortalInvitation"("tokenHash");
CREATE UNIQUE INDEX "GrantClientPortalInvitation_accessTokenHash_key" ON "GrantClientPortalInvitation"("accessTokenHash");
CREATE INDEX "GrantClientPortalInvitation_org_project_created_idx" ON "GrantClientPortalInvitation"("organizationId","projectId","createdAt");

CREATE TABLE "GrantClientPortalEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "invitationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorId" TEXT,
  "clientName" TEXT,
  "clientEmail" TEXT,
  "statement" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrantClientPortalEvent_invitation_fkey" FOREIGN KEY ("invitationId","organizationId") REFERENCES "GrantClientPortalInvitation"("id","organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GrantClientPortalEvent_type_check" CHECK ("eventType" IN ('INVITED','ACCEPTED','REVOKED')),
  CONSTRAINT "GrantClientPortalEvent_hash_check" CHECK (length("evidenceHash")=64)
);
CREATE INDEX "GrantClientPortalEvent_org_invitation_created_idx" ON "GrantClientPortalEvent"("organizationId","invitationId","createdAt");
CREATE FUNCTION retain_grant_client_portal_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Client portal evidence is append-only';
END $$;
CREATE TRIGGER retain_grant_client_portal_event BEFORE UPDATE OR DELETE ON "GrantClientPortalEvent" FOR EACH ROW EXECUTE FUNCTION retain_grant_client_portal_event();

CREATE FUNCTION guard_grant_client_portal_invitation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF ROW(OLD."organizationId",OLD."projectId",OLD."clientId",OLD."quoteId",OLD."recipientEmail",OLD."quoteHash",OLD."tokenHash",OLD."expiresAt",OLD."createdById",OLD."createdAt")
     IS DISTINCT FROM ROW(NEW."organizationId",NEW."projectId",NEW."clientId",NEW."quoteId",NEW."recipientEmail",NEW."quoteHash",NEW."tokenHash",NEW."expiresAt",NEW."createdById",NEW."createdAt")
     OR (OLD."acceptedAt" IS NOT NULL AND ROW(OLD."acceptedAt",OLD."accessTokenHash",OLD."accessExpiresAt") IS DISTINCT FROM ROW(NEW."acceptedAt",NEW."accessTokenHash",NEW."accessExpiresAt"))
     OR (OLD."revokedAt" IS NOT NULL AND (OLD."revokedAt" IS DISTINCT FROM NEW."revokedAt" OR OLD."acceptedAt" IS DISTINCT FROM NEW."acceptedAt")) THEN
    RAISE EXCEPTION 'Client portal invitation evidence cannot be rewritten';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_grant_client_portal_invitation BEFORE UPDATE ON "GrantClientPortalInvitation" FOR EACH ROW EXECUTE FUNCTION guard_grant_client_portal_invitation();
