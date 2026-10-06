CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Partner" ("id", "slug", "name", "status", "createdAt", "updatedAt")
VALUES ('partner_fluxora', 'fluxora', 'Fluxora', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Event" ADD COLUMN "partnerId" TEXT;
UPDATE "Event" SET "partnerId" = 'partner_fluxora';
ALTER TABLE "Event" ALTER COLUMN "partnerId" SET NOT NULL;

CREATE UNIQUE INDEX "Partner_slug_key" ON "Partner"("slug");
CREATE INDEX "Partner_status_createdAt_idx" ON "Partner"("status", "createdAt");
CREATE INDEX "Event_partnerId_status_startsAt_idx" ON "Event"("partnerId", "status", "startsAt");
ALTER TABLE "Event" ADD CONSTRAINT "Event_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
