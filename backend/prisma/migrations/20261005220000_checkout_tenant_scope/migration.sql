ALTER TABLE "CheckoutQuote" ADD COLUMN "partnerId" TEXT;
UPDATE "CheckoutQuote" SET "partnerId" = 'partner_fluxora';
ALTER TABLE "CheckoutQuote" ALTER COLUMN "partnerId" SET NOT NULL;
CREATE INDEX "CheckoutQuote_partnerId_createdAt_idx" ON "CheckoutQuote"("partnerId", "createdAt");
ALTER TABLE "CheckoutQuote" ADD CONSTRAINT "CheckoutQuote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
