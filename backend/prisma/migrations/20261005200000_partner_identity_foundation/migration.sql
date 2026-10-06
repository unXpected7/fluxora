CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'SUPERADMIN');
CREATE TYPE "PartnerMemberRole" AS ENUM ('OWNER', 'ADMIN', 'EVENT_MANAGER', 'GATE');

ALTER TABLE "StaffUser" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'NONE';

CREATE TABLE "PartnerMembership" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "role" "PartnerMemberRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerMembership_pkey" PRIMARY KEY ("id")
);

-- Preserve existing Fluxora operators as tenant members; none become SuperAdmin implicitly.
INSERT INTO "PartnerMembership" ("id", "staffId", "partnerId", "role", "createdAt", "updatedAt")
SELECT 'legacy-membership-' || "id", "id", 'partner_fluxora', CASE WHEN "role" = 'ADMIN' THEN 'ADMIN'::"PartnerMemberRole" ELSE 'GATE'::"PartnerMemberRole" END, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StaffUser"
;

CREATE TABLE "EventStaffAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerApiKey" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerApiKey_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdminAudit" ADD COLUMN "partnerId" TEXT;

CREATE UNIQUE INDEX "PartnerMembership_staffId_partnerId_key" ON "PartnerMembership"("staffId", "partnerId");
CREATE INDEX "PartnerMembership_partnerId_role_active_idx" ON "PartnerMembership"("partnerId", "role", "active");
CREATE UNIQUE INDEX "EventStaffAssignment_eventId_staffId_key" ON "EventStaffAssignment"("eventId", "staffId");
CREATE INDEX "EventStaffAssignment_staffId_eventId_idx" ON "EventStaffAssignment"("staffId", "eventId");
CREATE UNIQUE INDEX "PartnerApiKey_keyHash_key" ON "PartnerApiKey"("keyHash");
CREATE INDEX "PartnerApiKey_partnerId_revokedAt_expiresAt_idx" ON "PartnerApiKey"("partnerId", "revokedAt", "expiresAt");
CREATE INDEX "AdminAudit_partnerId_createdAt_idx" ON "AdminAudit"("partnerId", "createdAt");

ALTER TABLE "PartnerMembership" ADD CONSTRAINT "PartnerMembership_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerMembership" ADD CONSTRAINT "PartnerMembership_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerApiKey" ADD CONSTRAINT "PartnerApiKey_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminAudit" ADD CONSTRAINT "AdminAudit_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
