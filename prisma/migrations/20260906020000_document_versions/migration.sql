CREATE UNIQUE INDEX "GrantSource_supersedesId_key" ON "GrantSource"("supersedesId");
ALTER TABLE "GrantSource" ADD CONSTRAINT "GrantSource_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "GrantSource"("id") ON DELETE RESTRICT;
CREATE TABLE "GrantSubmissionReceipt" (
 "id" TEXT PRIMARY KEY,"projectId" TEXT NOT NULL REFERENCES "GrantProject"("id"),"packageId" TEXT NOT NULL REFERENCES "GrantPackage"("id"),
 "actorId" TEXT NOT NULL REFERENCES "User"("id"),"fileName" TEXT NOT NULL,"mediaType" TEXT NOT NULL,"bytes" BYTEA NOT NULL,
 "contentHash" TEXT NOT NULL,"note" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "grant_receipt_size" CHECK (octet_length("bytes") BETWEEN 1 AND 5000000)
);
CREATE INDEX "GrantSubmissionReceipt_projectId_packageId_createdAt_idx" ON "GrantSubmissionReceipt"("projectId","packageId","createdAt");
CREATE FUNCTION retain_grant_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Submission receipt history is append-only'; END $$;
CREATE TRIGGER retain_grant_receipt BEFORE UPDATE OR DELETE ON "GrantSubmissionReceipt" FOR EACH ROW EXECUTE FUNCTION retain_grant_receipt();
