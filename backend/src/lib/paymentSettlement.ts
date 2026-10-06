import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { paymentProvider } from './paymentProvider.js'
import { releaseExpiredReservations } from './inventoryReservations.js'
import { newPublicTicketId, ticketQrTokenHash } from './ticketQr.js'

type SnapshotComponent = { ticketTypeId: string; performanceId: string; quantity: number }

function bundleComponents(value: Prisma.JsonValue | null): SnapshotComponent[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Bundle ticket snapshot is invalid')
  const components = (value as { components?: unknown }).components
  if (!Array.isArray(components)) throw new Error('Bundle ticket snapshot is invalid')
  return components.map(component => {
    if (!component || typeof component !== 'object') throw new Error('Bundle ticket snapshot is invalid')
    const row = component as Record<string, unknown>
    if (typeof row.ticketTypeId !== 'string' || typeof row.performanceId !== 'string' || !Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1) throw new Error('Bundle ticket snapshot is invalid')
    return { ticketTypeId: row.ticketTypeId, performanceId: row.performanceId, quantity: Number(row.quantity) }
  })
}

async function settlePaid(attemptId: string, providerAmount: number, paidAt: Date | null) {
  return prisma.$transaction(async transaction => {
    const attempt = await transaction.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        order: {
          include: {
            items: true,
            checkoutQuote: { include: { partner: { select: { status: true } }, reservations: { include: { items: true, bundleItems: true } } } },
          },
        },
      },
    })
    if (!attempt) return 'unknown'
    if (attempt.status === 'PAID') return 'paid'
    if (attempt.amount !== providerAmount || attempt.order.total !== providerAmount) return 'amount_mismatch'
    const reservation = attempt.order.checkoutQuote.reservations.find(item => item.status === 'ACTIVE' && item.expiresAt > new Date())
    const eligibleForTicketIssue = attempt.status === 'PENDING' && attempt.order.status === 'PENDING' && attempt.order.paymentStatus === 'PENDING' && attempt.order.checkoutQuote.partner.status === 'ACTIVE' && reservation
    if (!eligibleForTicketIssue) {
      if (attempt.status === 'REFUNDED' || attempt.order.status === 'REFUNDED') return 'closed'
      if (attempt.order.status === 'REFUND_PENDING') return 'refund_pending'
      if (reservation) {
        await transaction.inventoryReservation.updateMany({ where: { id: reservation.id, status: 'ACTIVE' }, data: { expiresAt: new Date(0) } })
      }
      const paymentChanged = await transaction.paymentAttempt.updateMany({ where: { id: attempt.id, status: { in: ['PENDING', 'FAILED', 'EXPIRED'] }, amount: providerAmount }, data: { status: 'PAID', verifiedAt: paidAt || new Date(), providerStatus: 'paid' } })
      const orderChanged = await transaction.order.updateMany({ where: { id: attempt.orderId, status: { in: ['PENDING', 'CANCELLED'] }, paymentStatus: { in: ['PENDING', 'FAILED', 'EXPIRED'] }, total: providerAmount }, data: { status: 'REFUND_PENDING', paymentStatus: 'PAID' } })
      if (paymentChanged.count !== 1 || orderChanged.count !== 1) return 'changed'
      const reviewReason = !reservation ? 'inventory_reservation_unavailable' : attempt.order.checkoutQuote.partner.status !== 'ACTIVE' ? 'partner_suspended' : 'order_not_payable'
      await transaction.orderEvent.create({ data: { orderId: attempt.orderId, event: 'payment.late_paid_manual_review', actor: 'rajaongkir', payload: { providerPaymentId: attempt.providerPaymentId, amount: providerAmount, reason: reviewReason } } })
      return 'refund_pending'
    }

    for (const item of reservation.items) {
      const changed = await transaction.$executeRaw`UPDATE "TicketType" SET "reserved" = "reserved" - ${item.quantity}, "sold" = "sold" + ${item.quantity} WHERE "id" = ${item.ticketTypeId} AND "reserved" >= ${item.quantity} AND "capacity" >= "sold" + ${item.quantity}`
      if (changed !== 1) throw new Error('Ticket inventory cannot be committed')
    }
    for (const item of reservation.bundleItems) {
      const changed = await transaction.$executeRaw`UPDATE "Bundle" SET "reserved" = "reserved" - ${item.quantity}, "sold" = "sold" + ${item.quantity} WHERE "id" = ${item.bundleId} AND "reserved" >= ${item.quantity} AND ("capacity" IS NULL OR "capacity" >= "sold" + ${item.quantity})`
      if (changed !== 1) throw new Error('Bundle inventory cannot be committed')
    }

    const paymentChanged = await transaction.paymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING', amount: providerAmount }, data: { status: 'PAID', verifiedAt: paidAt || new Date(), providerStatus: 'paid' } })
    const orderChanged = await transaction.order.updateMany({ where: { id: attempt.orderId, status: 'PENDING', paymentStatus: 'PENDING', total: providerAmount }, data: { status: 'PAID', paymentStatus: 'PAID' } })
    if (paymentChanged.count !== 1 || orderChanged.count !== 1) throw new Error('Payment state changed during settlement')

    const typeIds = new Set<string>()
    for (const item of attempt.order.items) {
      if (item.itemType === 'TICKET' && item.ticketTypeId) typeIds.add(item.ticketTypeId)
      if (item.itemType === 'BUNDLE') for (const component of bundleComponents(item.bundleSnapshot)) typeIds.add(component.ticketTypeId)
    }
    const ticketTypes = await transaction.ticketType.findMany({ where: { id: { in: [...typeIds] } }, select: { id: true, performanceId: true, performance: { select: { eventId: true } } } })
    const ticketTypeById = new Map(ticketTypes.map(ticketType => [ticketType.id, ticketType]))
    for (const item of attempt.order.items) {
      const admissions: Array<{ ticketTypeId: string; performanceId: string; quantity: number }> = []
      if (item.itemType === 'TICKET' && item.ticketTypeId) {
        const ticketType = ticketTypeById.get(item.ticketTypeId)
        if (!ticketType) throw new Error('Purchased ticket type no longer exists')
        admissions.push({ ticketTypeId: ticketType.id, performanceId: ticketType.performanceId, quantity: item.quantity })
      } else if (item.itemType === 'BUNDLE') {
        admissions.push(...bundleComponents(item.bundleSnapshot).map(component => ({ ...component, quantity: component.quantity * item.quantity })))
      }
      for (const admission of admissions) {
        const ticketType = ticketTypeById.get(admission.ticketTypeId)
        if (!ticketType || ticketType.performanceId !== admission.performanceId) throw new Error('Purchased ticket snapshot no longer matches catalogue')
        for (let index = 0; index < admission.quantity; index += 1) {
          const publicId = newPublicTicketId()
          await transaction.ticket.create({ data: {
            publicId,
            qrTokenHash: ticketQrTokenHash(publicId),
            orderId: attempt.orderId,
            orderItemId: item.id,
            eventId: ticketType.performance.eventId,
            performanceId: ticketType.performanceId,
            ticketTypeId: ticketType.id,
          } })
        }
      }
    }
    await transaction.ticketDelivery.create({ data: { orderId: attempt.orderId, email: attempt.order.email } })
    await transaction.inventoryReservation.update({ where: { id: reservation.id }, data: { status: 'CONSUMED' } })
    await transaction.orderEvent.create({ data: { orderId: attempt.orderId, event: 'payment.verified', actor: 'rajaongkir', payload: { providerPaymentId: attempt.providerPaymentId, amount: providerAmount } } })
    await transaction.orderEvent.create({ data: { orderId: attempt.orderId, event: 'tickets.issued', actor: 'system', payload: { count: await transaction.ticket.count({ where: { orderId: attempt.orderId } }) } } })
    return 'paid'
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

async function settleClosed(attemptId: string, amount: number, status: 'expired' | 'cancelled') {
  await prisma.$transaction(async transaction => {
    const attempt = await transaction.paymentAttempt.findUnique({ where: { id: attemptId }, include: { order: true } })
    if (!attempt || attempt.status !== 'PENDING' || attempt.amount !== amount) return
    await transaction.paymentAttempt.update({ where: { id: attempt.id }, data: { status: status === 'expired' ? 'EXPIRED' : 'FAILED', providerStatus: status, verifiedAt: new Date() } })
    await transaction.order.updateMany({ where: { id: attempt.orderId, status: 'PENDING', paymentStatus: 'PENDING' }, data: { status: 'CANCELLED', paymentStatus: status === 'expired' ? 'EXPIRED' : 'FAILED' } })
    await transaction.orderEvent.create({ data: { orderId: attempt.orderId, event: `payment.${status}`, actor: 'rajaongkir', payload: { providerPaymentId: attempt.providerPaymentId } } })
    await transaction.inventoryReservation.updateMany({ where: { quoteId: attempt.order.checkoutQuoteId, status: 'ACTIVE' }, data: { expiresAt: new Date(0) } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  await releaseExpiredReservations()
}

export async function reconcileRajaOngkirPayment(providerPaymentId: string, force = false) {
  const attempt = await prisma.paymentAttempt.findFirst({ where: { provider: 'rajaongkir', providerPaymentId }, include: { order: { select: { total: true, status: true } } } })
  if (!attempt) return 'unknown'
  if (attempt.status === 'PAID') return attempt.order.status === 'REFUND_PENDING' ? 'refund_pending' : attempt.order.status === 'REFUNDED' ? 'closed' : 'paid'
  if (attempt.status === 'REFUNDED') return 'closed'
  if (attempt.status === 'PENDING' && ['unpaid', 'status_unavailable'].includes(attempt.providerStatus || '') && Date.now() - attempt.updatedAt.getTime() < 30_000) return 'pending'
  if (attempt.status !== 'PENDING' && !force && Date.now() - attempt.updatedAt.getTime() < 30_000) return 'closed'
  let status
  try {
    status = await paymentProvider(attempt.provider).getPaymentStatus(providerPaymentId)
  } catch (error) {
    await prisma.paymentAttempt.updateMany({ where: { id: attempt.id, status: { in: ['PENDING', 'FAILED', 'EXPIRED'] } }, data: { providerStatus: 'status_unavailable' } })
    throw error
  }
  if (status.historyId !== providerPaymentId || status.amount !== attempt.amount || status.amount !== attempt.order.total) return 'amount_mismatch'
  if (status.status === 'paid') {
    const outcome = await settlePaid(attempt.id, status.amount, status.paidAt)
    if (outcome === 'refund_pending') await releaseExpiredReservations()
    return outcome
  }
  if (status.status === 'expired' || status.status === 'cancelled') {
    if (attempt.status !== 'PENDING') {
      await prisma.paymentAttempt.updateMany({ where: { id: attempt.id, status: attempt.status }, data: { providerStatus: status.status, verifiedAt: new Date() } })
      return 'closed'
    }
    await settleClosed(attempt.id, status.amount, status.status)
    return status.status
  }
  if (attempt.status !== 'PENDING') {
    await prisma.paymentAttempt.updateMany({ where: { id: attempt.id, status: attempt.status }, data: { providerStatus: 'unpaid', verifiedAt: new Date() } })
    return 'closed'
  }
  await prisma.paymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING' }, data: { providerStatus: 'unpaid' } })
  return 'pending'
}
