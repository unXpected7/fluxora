ALTER TABLE "PartnerApiKey"
ADD COLUMN "rotatedToId" TEXT,
ADD COLUMN "rotationGraceUntil" TIMESTAMP(3);
