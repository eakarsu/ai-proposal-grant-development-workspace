CREATE TABLE "GrantAiDraft" (
 id TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "GrantOrganization"(id), "projectId" TEXT NOT NULL REFERENCES "GrantProject"(id), "actorId" TEXT NOT NULL REFERENCES "User"(id), task TEXT NOT NULL, "sectionId" TEXT, instructions TEXT NOT NULL, "baseVersion" INTEGER NOT NULL, "sourceSnapshot" JSONB NOT NULL, "sourceHash" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', output JSONB, "providerRef" TEXT, model TEXT, "inputTokens" INTEGER, "outputTokens" INTEGER, "costUsd" DECIMAL(12,6), error TEXT, "reviewedById" TEXT REFERENCES "User"(id), "reviewNotes" TEXT, "appliedVersion" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GrantAiDraft_organizationId_createdAt_idx" ON "GrantAiDraft"("organizationId","createdAt");
CREATE INDEX "GrantAiDraft_projectId_status_idx" ON "GrantAiDraft"("projectId",status);
