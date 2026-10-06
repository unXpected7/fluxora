CREATE TYPE "TicketDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "TicketDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "TicketDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketDelivery_orderId_key" ON "TicketDelivery"("orderId");
CREATE INDEX "TicketDelivery_status_nextAttemptAt_idx" ON "TicketDelivery"("status", "nextAttemptAt");
ALTER TABLE "TicketDelivery" ADD CONSTRAINT "TicketDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
