CREATE TYPE "StaffRole" AS ENUM ('GATE', 'ADMIN');
ALTER TABLE "StaffUser" ADD COLUMN "role" "StaffRole" NOT NULL DEFAULT 'GATE';

CREATE TABLE "AdminAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAudit_entityType_entityId_createdAt_idx" ON "AdminAudit"("entityType", "entityId", "createdAt");
CREATE INDEX "AdminAudit_actorId_createdAt_idx" ON "AdminAudit"("actorId", "createdAt");
