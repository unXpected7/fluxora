import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { paymentProvider } from '../lib/paymentProvider.js'
import { PaymentSessionIndeterminateError } from '../lib/paymentErrors.js'
import { prisma } from '../lib/prisma.js'
import { assertTicketQrConfiguration, ticketQrToken } from '../lib/ticketQr.js'
import { reconcileRajaOngkirPayment } from '../lib/paymentSettlement.js'

export const checkoutRouter = Router()

function rateLimit(maximum: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
    const now = Date.now()
    const recent = (hits.get(request.ip || 'unknown') || []).filter(timestamp => timestamp > now - windowMs)
    if (recent.length >= maximum) {
      response.status(429).json({ message: 'Too many checkout requests. Retry shortly.' })
      return
    }
    recent.push(now)
    hits.set(request.ip || 'unknown', recent)
    if (hits.size > 10_000) {
      for (const [key, timestamps] of hits) if (!timestamps.length || timestamps[timestamps.length - 1]! <= now - windowMs) hits.delete(key)
    }
    next()
  }
}

const limitQuotes = rateLimit(5, 60_000)
const limitOrders = rateLimit(10, 60_000)
const limitOrderStatus = rateLimit(30, 60_000)
const limitPaymentSessions = rateLimit(5, 60_000)

const quoteLifetimeMs = 15 * 60_000
const paymentLifetimeMs = 15 * 60_000
const maxOrderQuantity = 10
const maxAdmissionsPerOrder = 20

type Selection = { id: string; quantity: number }
type QuoteLine = {
  ticketTypeId: string | null
  bundleId: string | null
  itemType: 'TICKET' | 'BUNDLE'
  nameSnapshot: string
  unitPrice: number
  quantity: number
  admissionsPerUnit: number
  bundleSnapshot?: Prisma.InputJsonValue
}

class CheckoutInputError extends Error {}
class CheckoutConflictError extends Error {}

function requiredText(value: unknown, name: string, maxLength = 160) {
  if (typeof value !== 'string') throw new CheckoutInputError(`${name} is required`)
  const result = value.trim()
  if (!result || result.length > maxLength) throw new CheckoutInputError(`${name} is invalid`)
  return result
}

function optionalText(value: unknown, name: string, maxLength = 100) {
  if (value === undefined || value === null || value === '') return null
  return requiredText(value, name, maxLength)
}

function emailAddress(value: unknown) {
  const email = requiredText(value, 'Email', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckoutInputError('Enter a valid email address')
  return email
}

function selections(value: unknown, label: string): Selection[] {
  if (!Array.isArray(value)) return []
  if (value.length > 20) throw new CheckoutInputError(`Choose no more than 20 ${label}`)
  const parsed = value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new CheckoutInputError(`Invalid ${label} selection`)
    const row = item as Record<string, unknown>
    const id = requiredText(row.id ?? row.ticketTypeId ?? row.bundleId, `${label} ${index + 1} ID`, 80)
    const quantity = Number(row.quantity)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxOrderQuantity) throw new CheckoutInputError(`Quantity for ${label} must be between 1 and ${maxOrderQuantity}`)
    return { id, quantity }
  })
  if (new Set(parsed.map(item => item.id)).size !== parsed.length) throw new CheckoutInputError(`Each ${label} can appear only once`)
  return parsed
}

function isOnSale(start: Date | null, end: Date | null, now: Date) {
  return (!start || start <= now) && (!end || end >= now)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function orderNumber() {
  return `FLX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(5).toString('hex').toUpperCase()}`
}

function idempotencyKey(value: string | undefined) {
  const key = value?.trim() || ''
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(key)) throw new CheckoutInputError('Idempotency-Key must be 16 to 128 safe characters')
  return key
}

checkoutRouter.post('/quotes', limitQuotes, async (request, response, next) => {
  try {
    if (!request.body || typeof request.body !== 'object') throw new CheckoutInputError('Checkout details are required')
    const body = request.body as Record<string, unknown>
    const ticketSelections = selections(body.tickets, 'ticket')
    const bundleSelections = selections(body.bundles, 'bundle')
    if (!ticketSelections.length && !bundleSelections.length) throw new CheckoutInputError('Choose at least one ticket or bundle')
    const email = emailAddress(body.email)
    const firstName = optionalText(body.firstName, 'First name')
    const lastName = optionalText(body.lastName, 'Last name')
    const phone = optionalText(body.phone, 'Phone', 24)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + quoteLifetimeMs)
    const accessToken = randomBytes(32).toString('base64url')
    const quoteLines: QuoteLine[] = []
    const requiredInventory = new Map<string, number>()
    const bundleQuantities = new Map<string, number>()
    let selectedPartnerId: string | null = null
    const selectPartner = (partnerId: string) => {
      if (selectedPartnerId && selectedPartnerId !== partnerId) throw new CheckoutConflictError('A checkout can contain tickets from one partner only')
      selectedPartnerId = partnerId
    }

    const quote = await prisma.$transaction(async transaction => {
      for (const selection of ticketSelections) {
        const ticketType = await transaction.ticketType.findUnique({
          where: { id: selection.id },
          include: { performance: { include: { event: { include: { partner: { select: { status: true } } } } } } },
        })
        if (!ticketType || !ticketType.active || ticketType.price < 0 || ticketType.performance.status !== 'ON_SALE' || ticketType.performance.event.status !== 'PUBLISHED' || ticketType.performance.event.partner.status !== 'ACTIVE' || !isOnSale(ticketType.salesStartAt, ticketType.salesEndAt, now)) {
          throw new CheckoutConflictError('A selected ticket is unavailable for sale')
        }
        if (typeof response.locals.partnerId === 'string' && ticketType.performance.event.partnerId !== response.locals.partnerId) throw new CheckoutConflictError('A selected ticket is unavailable for this API key')
        selectPartner(ticketType.performance.event.partnerId)
        if (selection.quantity > ticketType.perOrderLimit) throw new CheckoutInputError(`${ticketType.name} limit is ${ticketType.perOrderLimit} per order`)
        quoteLines.push({ ticketTypeId: ticketType.id, bundleId: null, itemType: 'TICKET', nameSnapshot: `${ticketType.performance.event.title} — ${ticketType.name}`, unitPrice: ticketType.price, quantity: selection.quantity, admissionsPerUnit: 1 })
        requiredInventory.set(ticketType.id, (requiredInventory.get(ticketType.id) || 0) + selection.quantity)
      }

      for (const selection of bundleSelections) {
        const bundle = await transaction.bundle.findUnique({
          where: { id: selection.id },
          include: {
            event: { include: { partner: { select: { status: true } } } },
            items: { include: { ticketType: { include: { performance: { include: { event: true } } } } } },
          },
        })
        if (!bundle || !bundle.active || bundle.event.status !== 'PUBLISHED' || bundle.event.partner.status !== 'ACTIVE' || !isOnSale(bundle.salesStartAt, bundle.salesEndAt, now) || !bundle.items.length) {
          throw new CheckoutConflictError('A selected bundle is unavailable for sale')
        }
        if (typeof response.locals.partnerId === 'string' && bundle.event.partnerId !== response.locals.partnerId) throw new CheckoutConflictError('A selected bundle is unavailable for this API key')
        selectPartner(bundle.event.partnerId)
        if (selection.quantity > bundle.perOrderLimit) throw new CheckoutInputError(`${bundle.name} limit is ${bundle.perOrderLimit} per order`)
        const components = bundle.items.map(item => {
          if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !item.ticketType.active || item.ticketType.price < 0 || item.ticketType.performance.eventId !== bundle.eventId || item.ticketType.performance.event.status !== 'PUBLISHED' || item.ticketType.performance.status !== 'ON_SALE' || !isOnSale(item.ticketType.salesStartAt, item.ticketType.salesEndAt, now)) {
            throw new CheckoutConflictError(`${item.ticketType.name} in ${bundle.name} is unavailable for sale`)
          }
          const quantity = item.quantity * selection.quantity
          requiredInventory.set(item.ticketTypeId, (requiredInventory.get(item.ticketTypeId) || 0) + quantity)
          return { ticketTypeId: item.ticketTypeId, performanceId: item.ticketType.performanceId, name: item.ticketType.name, quantity: item.quantity }
        })
        bundleQuantities.set(bundle.id, (bundleQuantities.get(bundle.id) || 0) + selection.quantity)
        quoteLines.push({ ticketTypeId: null, bundleId: bundle.id, itemType: 'BUNDLE', nameSnapshot: `${bundle.event.title} — ${bundle.name}`, unitPrice: bundle.price, quantity: selection.quantity, admissionsPerUnit: components.reduce((sum, item) => sum + item.quantity, 0), bundleSnapshot: { components } })
      }

      const admissions = quoteLines.reduce((sum, line) => sum + line.admissionsPerUnit * line.quantity, 0)
      if (admissions > maxAdmissionsPerOrder) throw new CheckoutInputError(`An order may contain at most ${maxAdmissionsPerOrder} admissions`)
      const subtotal = quoteLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
      if (!Number.isSafeInteger(subtotal) || subtotal < 1) throw new CheckoutInputError('Checkout total is invalid')
      const created = await transaction.checkoutQuote.create({
        data: {
          accessTokenHash: hashToken(accessToken), partnerId: selectedPartnerId!, email, firstName, lastName, phone,
          subtotal, total: subtotal, paymentProvider: process.env.CHECKOUT_PAYMENT_PROVIDER || 'disabled', expiresAt,
          items: { create: quoteLines.map(line => ({ ...line, bundleSnapshot: line.bundleSnapshot ?? Prisma.JsonNull })) },
        },
        include: { items: true },
      })
      const reservation = await transaction.inventoryReservation.create({ data: { quoteId: created.id, expiresAt } })
      for (const [ticketTypeId, quantity] of requiredInventory) {
        const updated = await transaction.$executeRaw`UPDATE "TicketType" SET "reserved" = "reserved" + ${quantity} WHERE "id" = ${ticketTypeId} AND "active" = true AND "capacity" >= "sold" + "reserved" + ${quantity}`
        if (updated !== 1) throw new CheckoutConflictError('A selected ticket just sold out. Refresh availability and try again.')
        await transaction.inventoryReservationItem.create({ data: { reservationId: reservation.id, ticketTypeId, quantity } })
      }
      for (const [bundleId, quantity] of bundleQuantities) {
        const updated = await transaction.$executeRaw`UPDATE "Bundle" SET "reserved" = "reserved" + ${quantity} WHERE "id" = ${bundleId} AND "active" = true AND ("capacity" IS NULL OR "capacity" >= "sold" + "reserved" + ${quantity})`
        if (updated !== 1) throw new CheckoutConflictError('A selected bundle just sold out. Refresh availability and try again.')
        await transaction.inventoryReservationBundleItem.create({ data: { reservationId: reservation.id, bundleId, quantity } })
      }
      return created
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    response.status(201).json({
      id: quote.id, accessToken, email: quote.email, subtotal: quote.subtotal, fees: quote.fees, total: quote.total,
      expiresAt: quote.expiresAt,
      items: quote.items.map(item => ({ type: item.itemType.toLowerCase(), name: item.nameSnapshot, unitPrice: item.unitPrice, quantity: item.quantity, admissionsPerUnit: item.admissionsPerUnit })),
    })
  } catch (error) { next(error) }
})

checkoutRouter.post('/orders', limitOrders, async (request, response, next) => {
  try {
    if (!request.body || typeof request.body !== 'object') throw new CheckoutInputError('Quote details are required')
    const body = request.body as Record<string, unknown>
    const quoteId = requiredText(body.quoteId, 'Quote ID', 80)
    const accessToken = requiredText(body.accessToken, 'Quote access token', 100)
    const key = idempotencyKey(request.header('idempotency-key'))
    const result = await prisma.$transaction(async transaction => {
      const prior = await transaction.order.findUnique({ where: { idempotencyKey: key }, select: { id: true, orderNumber: true, checkoutQuoteId: true } })
      if (prior) {
        if (prior.checkoutQuoteId !== quoteId) throw new CheckoutConflictError('Idempotency-Key was already used for another checkout')
        return { id: prior.id, orderNumber: prior.orderNumber, replayed: true }
      }
      const quote = await transaction.checkoutQuote.findUnique({
        where: { id: quoteId },
        include: {
          partner: { select: { status: true } },
          items: {
            include: {
              ticketType: { include: { performance: { include: { event: { select: { partnerId: true } } } } } },
              bundle: { include: { event: { select: { partnerId: true } } } },
            },
          },
          reservations: { include: { items: true } },
        },
      })
      if (!quote || quote.accessTokenHash !== hashToken(accessToken)) throw new CheckoutConflictError('Checkout quote not found')
      if (quote.partner.status !== 'ACTIVE' || (typeof response.locals.partnerId === 'string' && quote.partnerId !== response.locals.partnerId) || quote.items.some(item => (item.ticketType?.performance.event.partnerId ?? item.bundle?.event.partnerId) !== quote.partnerId)) throw new CheckoutConflictError('This partner is unavailable for checkout')
      const existingQuoteOrder = await transaction.order.findUnique({ where: { checkoutQuoteId: quote.id }, select: { id: true, orderNumber: true, idempotencyKey: true } })
      if (existingQuoteOrder) {
        if (existingQuoteOrder.idempotencyKey !== key) throw new CheckoutConflictError('This quote has already been submitted with another idempotency key')
        return { id: existingQuoteOrder.id, orderNumber: existingQuoteOrder.orderNumber, replayed: true }
      }
      if (quote.expiresAt <= new Date()) throw new CheckoutConflictError('Checkout quote has expired')
      const reservation = quote.reservations.find(item => item.status === 'ACTIVE' && item.expiresAt > new Date())
      if (!reservation) throw new CheckoutConflictError('Inventory reservation has expired')
      const number = orderNumber()
      const order = await transaction.order.create({
        data: {
          orderNumber: number, checkoutQuoteId: quote.id, idempotencyKey: key,
          email: quote.email, firstName: quote.firstName, lastName: quote.lastName, phone: quote.phone,
          subtotal: quote.subtotal, fees: quote.fees, total: quote.total,
          items: { create: quote.items.map(item => ({
            ticketTypeId: item.ticketTypeId, bundleId: item.bundleId, itemType: item.itemType, nameSnapshot: item.nameSnapshot,
            unitPrice: item.unitPrice, quantity: item.quantity, admissionsPerUnit: item.admissionsPerUnit, bundleSnapshot: item.bundleSnapshot ?? Prisma.JsonNull,
          })) },
          paymentAttempts: { create: { provider: quote.paymentProvider, providerOrderId: number, amount: quote.total } },
          events: { create: { event: 'checkout.order_created', actor: 'guest', payload: { quoteId: quote.id } } },
        },
      })
      const paymentExpiry = new Date(Date.now() + paymentLifetimeMs)
      await transaction.inventoryReservation.update({ where: { id: reservation.id }, data: { expiresAt: paymentExpiry } })
      await transaction.paymentAttempt.updateMany({ where: { orderId: order.id }, data: { expiresAt: paymentExpiry } })
      return { id: order.id, orderNumber: order.orderNumber, replayed: false }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    response.status(result.replayed ? 200 : 201).json(result)
  } catch (error) { next(error) }
})

checkoutRouter.get('/orders/:id', limitOrderStatus, async (request, response, next) => {
  try {
    const authorization = request.header('authorization') || ''
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    const orderId = typeof request.params.id === 'string' ? request.params.id : ''
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { checkoutQuote: { select: { accessTokenHash: true, partnerId: true } }, items: true, paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 }, tickets: { select: { publicId: true, status: true, issuedAt: true } }, ticketDelivery: { select: { status: true, sentAt: true } } },
    })
    if (!order || !accessToken || order.checkoutQuote.accessTokenHash !== hashToken(accessToken) || (typeof response.locals.partnerId === 'string' && order.checkoutQuote.partnerId !== response.locals.partnerId)) {
      response.status(404).json({ message: 'Order not found' })
      return
    }
    const currentAttempt = order.paymentAttempts[0]
    const shouldPollClosedPayment = currentAttempt && ['EXPIRED', 'FAILED'].includes(currentAttempt.status) && Date.now() - currentAttempt.updatedAt.getTime() >= 30_000
    if (currentAttempt?.provider === 'rajaongkir' && currentAttempt.providerPaymentId && currentAttempt.sessionCreatedAt && (currentAttempt.status === 'PENDING' || shouldPollClosedPayment)) {
      try { await reconcileRajaOngkirPayment(currentAttempt.providerPaymentId) } catch (error) {
        console.error(JSON.stringify({ event: 'payment_status_poll_failed', requestId: response.locals.requestId, errorName: error instanceof Error ? error.name : 'UnknownError' }))
      }
    }
    const refreshedOrder = currentAttempt?.provider === 'rajaongkir' && currentAttempt.providerPaymentId && (currentAttempt.status === 'PENDING' || shouldPollClosedPayment)
      ? await prisma.order.findUnique({ where: { id: order.id }, include: { checkoutQuote: { select: { accessTokenHash: true, partnerId: true } }, items: true, paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 }, tickets: { select: { publicId: true, status: true, issuedAt: true } }, ticketDelivery: { select: { status: true, sentAt: true } } } })
      : order
    if (!refreshedOrder) throw new CheckoutConflictError('Order not found')
    const responseOrder = refreshedOrder
    response.json({
      id: responseOrder.id, orderNumber: responseOrder.orderNumber, status: responseOrder.status, paymentStatus: responseOrder.paymentStatus,
      subtotal: responseOrder.subtotal, fees: responseOrder.fees, total: responseOrder.total,
      items: responseOrder.items.map(item => ({ name: item.nameSnapshot, unitPrice: item.unitPrice, quantity: item.quantity, admissionsPerUnit: item.admissionsPerUnit })),
      payment: responseOrder.paymentAttempts[0] ? { provider: responseOrder.paymentAttempts[0].provider, status: responseOrder.paymentAttempts[0].status, qrCodeUrl: responseOrder.paymentAttempts[0].qrCodeUrl, qrCodeContent: responseOrder.paymentAttempts[0].qrCodeContent, expiresAt: responseOrder.paymentAttempts[0].expiresAt } : null,
      tickets: responseOrder.tickets.map(ticket => ({ publicId: ticket.publicId, qrToken: ticketQrToken(ticket.publicId), status: ticket.status, issuedAt: ticket.issuedAt })),
      ticketDelivery: responseOrder.ticketDelivery,
    })
  } catch (error) { next(error) }
})

checkoutRouter.post('/orders/:id/payment', limitPaymentSessions, async (request, response, next) => {
  try {
    const authorization = request.header('authorization') || ''
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!accessToken) throw new CheckoutConflictError('Order not found')
    const orderId = typeof request.params.id === 'string' ? request.params.id : ''
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { checkoutQuote: { select: { accessTokenHash: true, partnerId: true, partner: { select: { status: true } }, reservations: true } }, paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!order || order.checkoutQuote.accessTokenHash !== hashToken(accessToken) || (typeof response.locals.partnerId === 'string' && order.checkoutQuote.partnerId !== response.locals.partnerId)) throw new CheckoutConflictError('Order not found')
    if (order.checkoutQuote.partner.status !== 'ACTIVE') throw new CheckoutConflictError('This partner is unavailable for payment')
    if (order.status !== 'PENDING' || order.paymentStatus !== 'PENDING') throw new CheckoutConflictError('Payment cannot be started for this order')
    const attempt = order.paymentAttempts[0]
    if (!attempt) throw new CheckoutConflictError('Pending payment attempt not found')
    if (attempt.sessionCreatedAt) {
      response.json({ orderId: order.id, provider: attempt.provider, providerPaymentId: attempt.providerPaymentId, qrCodeUrl: attempt.qrCodeUrl, qrCodeContent: attempt.qrCodeContent, expiresAt: attempt.expiresAt, replayed: true })
      return
    }

    const now = new Date()
    const staleBefore = new Date(now.getTime() - 20 * 60_000)
    const reservation = order.checkoutQuote.reservations.find(item => item.status === 'ACTIVE' && item.expiresAt > now)
    if (!reservation) throw new CheckoutConflictError('Inventory reservation has expired')
    assertTicketQrConfiguration()
    const claimExpiresAt = new Date(now.getTime() + 60_000)
    const claimed = await prisma.$transaction(async transaction => {
      const attemptClaim = await transaction.paymentAttempt.updateMany({
        where: { id: attempt.id, sessionCreatedAt: null, OR: [{ sessionCreatingAt: null }, { sessionCreatingAt: { lt: staleBefore } }] },
        data: { sessionCreatingAt: now },
      })
      if (attemptClaim.count !== 1) return false
      const reservationClaim = await transaction.inventoryReservation.updateMany({ where: { id: reservation.id, status: 'ACTIVE', expiresAt: { gt: now } }, data: { expiresAt: claimExpiresAt } })
      if (reservationClaim.count !== 1) throw new CheckoutConflictError('Inventory reservation has expired')
      return true
    })
    if (!claimed) throw new CheckoutConflictError('Payment session creation is already in progress. Retry shortly.')
    try {
      const session = await paymentProvider(attempt.provider).createPaymentSession({ orderNumber: order.orderNumber, amount: order.total, email: order.email })
      if (session.provider !== attempt.provider || !session.providerPaymentId || (!session.qrCodeUrl && !session.qrCodeContent)) throw new PaymentSessionIndeterminateError('Payment provider created a session with an invalid response; retry is delayed')
      if (session.expiresAt <= now) throw new PaymentSessionIndeterminateError('Payment provider created an already-expired session; retry is delayed')
      const saved = await prisma.$transaction(async transaction => {
        const attemptSaved = await transaction.paymentAttempt.updateMany({
          where: { id: attempt.id, sessionCreatingAt: now, sessionCreatedAt: null },
          data: { providerPaymentId: session.providerPaymentId, qrCodeUrl: session.qrCodeUrl, qrCodeContent: session.qrCodeContent, expiresAt: session.expiresAt, sessionCreatingAt: null, sessionCreatedAt: new Date(), paymentType: 'qris' },
        })
        if (attemptSaved.count !== 1) return false
        const reservationSaved = await transaction.inventoryReservation.updateMany({ where: { id: reservation.id, status: 'ACTIVE' }, data: { expiresAt: session.expiresAt } })
        return reservationSaved.count === 1
      })
      if (!saved) throw new CheckoutConflictError('Payment session state changed. Retry shortly.')
      response.status(201).json({ orderId: order.id, ...session, replayed: false })
    } catch (error) {
      if (!(error instanceof PaymentSessionIndeterminateError)) {
        await prisma.paymentAttempt.updateMany({ where: { id: attempt.id, sessionCreatedAt: null }, data: { sessionCreatingAt: null } })
      }
      throw error
    }
  } catch (error) { next(error) }
})

export { CheckoutConflictError, CheckoutInputError }
