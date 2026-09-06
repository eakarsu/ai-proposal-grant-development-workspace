-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "GrantOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "reviewCount" INTEGER NOT NULL DEFAULT 2,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "projectId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "funder" TEXT NOT NULL,
    "program" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantProjectAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GrantProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "bytes" BYTEA,
    "contentHash" TEXT NOT NULL,
    "chunks" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantPackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectVersion" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "docx" BYTEA NOT NULL,
    "pdf" BYTEA NOT NULL,
    "archive" BYTEA NOT NULL,
    "frozenBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "receiptReference" TEXT,
    "receiptBytes" BYTEA,
    "receiptHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantMutation" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrantMembership_userId_active_idx" ON "GrantMembership"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "GrantMembership_organizationId_userId_key" ON "GrantMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantInvitation_tokenHash_key" ON "GrantInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "GrantProject_organizationId_status_dueAt_idx" ON "GrantProject"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrantProjectAccess_projectId_userId_key" ON "GrantProjectAccess"("projectId", "userId");

-- CreateIndex
CREATE INDEX "GrantSource_projectId_createdAt_idx" ON "GrantSource"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrantRevision_projectId_version_key" ON "GrantRevision"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GrantReview_projectId_contentHash_reviewerId_key" ON "GrantReview"("projectId", "contentHash", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantPackage_projectId_projectVersion_key" ON "GrantPackage"("projectId", "projectVersion");

-- CreateIndex
CREATE INDEX "GrantComment_projectId_createdAt_idx" ON "GrantComment"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "GrantNotification_userId_readAt_createdAt_idx" ON "GrantNotification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "GrantMembership" ADD CONSTRAINT "GrantMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "GrantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantInvitation" ADD CONSTRAINT "GrantInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "GrantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantProject" ADD CONSTRAINT "GrantProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "GrantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantProjectAccess" ADD CONSTRAINT "GrantProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GrantProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantSource" ADD CONSTRAINT "GrantSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GrantProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantRevision" ADD CONSTRAINT "GrantRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GrantProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantReview" ADD CONSTRAINT "GrantReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GrantProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantPackage" ADD CONSTRAINT "GrantPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GrantProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantComment" ADD CONSTRAINT "GrantComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GrantProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO "GrantOrganization" (id,name) VALUES ('legacy','Original workspace');
INSERT INTO "GrantMembership" (id,"organizationId","userId",role) SELECT 'legacy:'||id,'legacy',id,CASE WHEN role='ADMIN' THEN 'OWNER' WHEN role='MANAGER' THEN 'MANAGER' ELSE 'EDITOR' END FROM "User";
ALTER TABLE "GrantMembership" ADD CONSTRAINT grant_member_role CHECK (role IN ('OWNER','MANAGER','EDITOR','REVIEWER','CLIENT'));
ALTER TABLE "GrantOrganization" ADD CONSTRAINT grant_review_count CHECK ("reviewCount" BETWEEN 1 AND 5);
ALTER TABLE "GrantProject" ADD CONSTRAINT grant_project_status CHECK (status IN ('DRAFT','REVIEW','APPROVED','FROZEN','SUBMITTED','AWARDED','DECLINED','WITHDRAWN'));
