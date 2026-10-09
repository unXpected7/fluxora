ALTER TABLE "PartnerApiKey"
ADD COLUMN "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120;

CREATE TABLE "PartnerApiRequestWindow" (
    "apiKeyId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PartnerApiRequestWindow_pkey" PRIMARY KEY ("apiKeyId", "windowStart")
);

CREATE INDEX "PartnerApiRequestWindow_windowStart_idx" ON "PartnerApiRequestWindow"("windowStart");

ALTER TABLE "PartnerApiRequestWindow"
ADD CONSTRAINT "PartnerApiRequestWindow_apiKeyId_fkey"
FOREIGN KEY ("apiKeyId") REFERENCES "PartnerApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
