import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { enqueuePartnerWebhook } from './partnerWebhooks.js'

export async function releaseExpiredReservations(now = new Date()) {
  const expired = await prisma.inventoryReservation.findMany({
    where: { status: 'ACTIVE', expiresAt: { lte: now } },
    select: {
      id: true,
      quote: {
        select: {
          partnerId: true,
          order: {
            select: {
              id: true, orderNumber: true, status: true, paymentStatus: true,
              paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: { expiresAt: 'asc' },
    take: 100,
  })

  let released = 0
  for (const candidate of expired) {
    const order = candidate.quote.order
    const attempt = order?.paymentAttempts[0]
    if (order && attempt && order.status === 'PENDING' && order.paymentStatus === 'PENDING') {
      if (attempt.provider === 'rajaongkir' && attempt.providerPaymentId && attempt.sessionCreatedAt) {
        try {
          const { reconcileRajaOngkirPayment } = await import('./paymentSettlement.js')
          const outcome = await reconcileRajaOngkirPayment(attempt.providerPaymentId)
          if (outcome === 'paid' || outcome === 'expired' || outcome === 'cancelled' || outcome === 'closed') continue
        } catch (error) {
          console.error(JSON.stringify({ event: 'expired_payment_reconciliation_failed', orderId: order.id, errorName: error instanceof Error ? error.name : 'UnknownError' }))
        }
        await prisma.inventoryReservation.updateMany({ where: { id: candidate.id, status: 'ACTIVE', expiresAt: { lte: now } }, data: { expiresAt: new Date(now.getTime() + 30_000) } })
        continue
      }
      const claimStillFresh = attempt.sessionCreatingAt && attempt.sessionCreatingAt.getTime() > now.getTime() - 20 * 60_000
      if (claimStillFresh) {
        await prisma.inventoryReservation.updateMany({ where: { id: candidate.id, status: 'ACTIVE', expiresAt: { lte: now } }, data: { expiresAt: new Date(now.getTime() + 30_000) } })
        continue
      }
      await prisma.$transaction(async transaction => {
        await transaction.paymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING', sessionCreatedAt: null }, data: { status: 'EXPIRED', providerStatus: 'session_unavailable', verifiedAt: now } })
        await transaction.order.updateMany({ where: { id: order.id, status: 'PENDING', paymentStatus: 'PENDING' }, data: { status: 'CANCELLED', paymentStatus: 'EXPIRED' } })
        const orderEvent = await transaction.orderEvent.create({ data: { orderId: order.id, event: 'checkout.reservation_expired', actor: 'system', payload: { reservationId: candidate.id } } })
        await enqueuePartnerWebhook(transaction, { partnerId: candidate.quote.partnerId, eventType: orderEvent.event, sourceEventId: orderEvent.id, payload: { orderId: order.id, orderNumber: order.orderNumber, status: 'CANCELLED', paymentStatus: 'EXPIRED' } })
      })
    }
    const didRelease = await prisma.$transaction(async transaction => {
      const reservation = await transaction.inventoryReservation.findFirst({
        where: { id: candidate.id, status: 'ACTIVE', expiresAt: { lte: now } },
        include: { items: true, bundleItems: true },
      })
      if (!reservation) return false

      for (const item of reservation.items) {
        const updated = await transaction.$executeRaw`UPDATE "TicketType" SET "reserved" = "reserved" - ${item.quantity} WHERE "id" = ${item.ticketTypeId} AND "reserved" >= ${item.quantity}`
        if (updated !== 1) throw new Error('Ticket inventory reservation counter is inconsistent')
      }
      for (const item of reservation.bundleItems) {
        const updated = await transaction.$executeRaw`UPDATE "Bundle" SET "reserved" = "reserved" - ${item.quantity} WHERE "id" = ${item.bundleId} AND "reserved" >= ${item.quantity}`
        if (updated !== 1) throw new Error('Bundle inventory reservation counter is inconsistent')
      }
      const changed = await transaction.inventoryReservation.updateMany({ where: { id: reservation.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } })
      return changed.count === 1
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    if (didRelease) released += 1
  }
  return released
}
