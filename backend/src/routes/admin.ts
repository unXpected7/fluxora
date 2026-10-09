import { createHash, randomBytes } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { Prisma } from '@prisma/client'
import { currentStaff } from '../lib/staffAuth.js'
import { prisma } from '../lib/prisma.js'
import { encryptWebhookSecret, enqueuePartnerWebhook, supportedEvents, validateWebhookUrl } from '../lib/partnerWebhooks.js'
import { config } from '../lib/config.js'

export const adminRouter = Router({ mergeParams: true })

adminRouter.use(async (request: Request, response: Response, next: NextFunction) => {
  try {
    const staff = await currentStaff(request.header('cookie'))
    if (!staff) { response.status(401).json({ message: 'Staff authentication required' }); return }
    const partnerId = request.params.partnerId
    const membership = partnerId ? staff.memberships.find(item => item.partnerId === partnerId) : null
    const canManagePartner = membership && membership.partner.status === 'ACTIVE' && ['OWNER', 'ADMIN', 'EVENT_MANAGER'].includes(membership.role)
    if (staff.platformRole !== 'SUPERADMIN' && !canManagePartner) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    response.locals.adminStaff = staff
    response.locals.adminPartnerId = staff.platformRole === 'SUPERADMIN' ? partnerId || null : partnerId
    response.locals.isPlatformAdmin = staff.platformRole === 'SUPERADMIN'
    next()
  } catch (error) { next(error) }
})

function text(value: unknown, label: string, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} is required and must be at most ${max} characters`)
  return value.trim()
}
function optionalText(value: unknown, label: string, max = 200) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return text(value, label, max)
}
function date(value: unknown, label: string, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be an ISO date string`)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be an ISO date string`)
  return parsed
}
function integer(value: unknown, label: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} must be an integer from ${min} to ${max}`)
  return value as number
}
function auditData(request: Request, actorId: string, action: string, entityType: string, entityId: string, payload: Prisma.InputJsonValue, partnerId?: string) {
  return { actorId, partnerId: partnerId ?? request.res?.locals.adminPartnerId ?? null, action, entityType, entityId, requestId: request.res?.locals.requestId, payload }
}
function badInput(error: unknown, response: Response) {
  response.status(400).json({ message: error instanceof Error ? error.message : 'Invalid request' })
}
function isPlatformAdmin(response: Response) { return response.locals.isPlatformAdmin === true }
function partnerScope(response: Response): string | null { return typeof response.locals.adminPartnerId === 'string' ? response.locals.adminPartnerId : null }
function scopedIdWhere(id: string, response: Response) {
  const partnerId = partnerScope(response)
  return partnerId ? { id, partnerId } : { id }
}

function requirePlatformAdmin(response: Response) {
  if (isPlatformAdmin(response)) return true
  response.status(403).json({ message: 'Platform administrator access required' })
  return false
}

function invitationUrl(token: string) {
  const configured = process.env.STAFF_INVITATION_BASE_URL?.trim()
  const defaultOrigin = config.clientOrigins.find(candidate => {
    try { const hostname = new URL(candidate).hostname; return hostname === 'localhost' || hostname.startsWith('partner.') || hostname.includes('partner-eticket') }
    catch { return false }
  })
  const origin = configured || defaultOrigin
  if (!origin || !config.clientOrigins.includes(origin)) throw new Error('STAFF_INVITATION_BASE_URL must be a partner portal origin included in CLIENT_ORIGIN')
  return `${origin.replace(/\/$/, '')}/staff/invite#${token}`
}

adminRouter.get('/partners', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const limit = Number(request.query.limit ?? 50)
    const offset = Number(request.query.offset ?? 0)
    const status = request.query.status
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) { response.status(400).json({ message: 'limit must be 1-100 and offset must be a non-negative integer up to 100000' }); return }
    if (status !== undefined && !['PENDING', 'ACTIVE', 'SUSPENDED'].includes(String(status))) { response.status(400).json({ message: 'status must be PENDING, ACTIVE, or SUSPENDED' }); return }
    const where = status ? { status: String(status) as 'PENDING' | 'ACTIVE' | 'SUSPENDED' } : {}
    const [items, total] = await Promise.all([
      prisma.partner.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit, include: { _count: { select: { events: true, memberships: true } } } }),
      prisma.partner.count({ where }),
    ])
    response.json({ items: items.map(({ _count, ...partner }) => ({ ...partner, eventCount: _count.events, membershipCount: _count.memberships })), total, limit, offset })
  } catch (error) { next(error) }
})

adminRouter.get('/api-usage', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const limit = Number(request.query.limit ?? 50)
    const offset = Number(request.query.offset ?? 0)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
      response.status(400).json({ message: 'limit must be 1-100 and offset must be a non-negative integer up to 100000' }); return
    }
    const windowEnd = new Date()
    windowEnd.setUTCSeconds(0, 0)
    const windowStart = new Date(windowEnd.getTime() - 59 * 60_000)
    const [keys, total] = await Promise.all([
      prisma.partnerApiKey.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit,
        select: { id: true, partnerId: true, name: true, keyPrefix: true, rateLimitPerMinute: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true, partner: { select: { slug: true, name: true, status: true } } },
      }),
      prisma.partnerApiKey.count(),
    ])
    const windows = keys.length ? await prisma.partnerApiRequestWindow.findMany({
        where: { apiKeyId: { in: keys.map(key => key.id) }, windowStart: { gte: windowStart } },
        select: { apiKeyId: true, windowStart: true, requestCount: true },
      }) : []
    const windowsByKey = new Map<string, typeof windows>()
    for (const item of windows) windowsByKey.set(item.apiKeyId, [...(windowsByKey.get(item.apiKeyId) ?? []), item])
    const items = keys.map(key => {
      const keyWindows = windowsByKey.get(key.id) ?? []
      const currentMinuteRequests = keyWindows.find(item => item.windowStart.getTime() === windowEnd.getTime())?.requestCount ?? 0
      const requestsLastHour = keyWindows.reduce((sum, item) => sum + item.requestCount, 0)
      const estimatedRateLimitedLastHour = keyWindows.reduce((sum, item) => sum + Math.max(0, item.requestCount - key.rateLimitPerMinute), 0)
      return {
        id: key.id, partnerId: key.partnerId, partner: key.partner, name: key.name, keyPrefix: key.keyPrefix,
        rateLimitPerMinute: key.rateLimitPerMinute, currentMinuteRequests, requestsLastHour,
        estimatedRateLimitedLastHour, lastUsedAt: key.lastUsedAt, expiresAt: key.expiresAt,
        revokedAt: key.revokedAt, createdAt: key.createdAt,
      }
    })
    response.json({ items, total, limit, offset, observedAt: new Date().toISOString(), windowMinutes: 60, retainedWindowHours: 24 })
  } catch (error) { next(error) }
})

adminRouter.get('/operations/queues', async (_request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const now = new Date()
    const [ticketDelivery, webhookDelivery, refundReviewOrders, overduePayments, expiredReservations, oldestDueTicketDelivery, oldestDueWebhookDelivery] = await Promise.all([
      prisma.ticketDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.partnerWebhookDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.count({ where: { status: 'REFUND_PENDING' } }),
      prisma.paymentAttempt.count({ where: { status: 'PENDING', expiresAt: { lte: now } } }),
      prisma.inventoryReservation.count({ where: { status: 'ACTIVE', expiresAt: { lte: now } } }),
      prisma.ticketDelivery.findFirst({ where: { status: 'PENDING', nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      prisma.partnerWebhookDelivery.findFirst({ where: { status: 'PENDING', nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ])
    response.json({
      observedAt: now.toISOString(),
      ticketDelivery: { countsByStatus: Object.fromEntries(ticketDelivery.map(item => [item.status, item._count._all])), oldestDueAt: oldestDueTicketDelivery?.createdAt ?? null },
      partnerWebhookDelivery: { countsByStatus: Object.fromEntries(webhookDelivery.map(item => [item.status, item._count._all])), oldestDueAt: oldestDueWebhookDelivery?.createdAt ?? null },
      refundReviewOrders,
      overduePendingPayments: overduePayments,
      expiredActiveReservations: expiredReservations,
    })
  } catch (error) { next(error) }
})

adminRouter.post('/partners', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const slug = text(request.body?.slug, 'slug', 100).toLowerCase()
    const name = text(request.body?.name, 'name', 200)
    const contactEmail = optionalText(request.body?.contactEmail, 'contactEmail', 254) ?? null
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { response.status(400).json({ message: 'slug may contain lowercase letters, numbers, and hyphens' }); return }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { response.status(400).json({ message: 'contactEmail must be a valid email address' }); return }
    const actor = response.locals.adminStaff as { id: string }
    const partner = await prisma.$transaction(async transaction => {
      const created = await transaction.partner.create({ data: { slug, name, contactEmail, status: 'PENDING' } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'platform.partner_created', 'Partner', created.id, { slug, name, contactEmail, status: created.status }, created.id) })
      return created
    })
    response.status(201).json(partner)
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.get('/partners/:partnerId', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const partner = await prisma.partner.findUnique({ where: { id: request.params.partnerId }, include: { _count: { select: { events: true, memberships: true, apiKeys: true, webhooks: true } } } })
    if (!partner) { response.status(404).json({ message: 'Partner not found' }); return }
    const { _count, ...data } = partner
    response.json({ ...data, eventCount: _count.events, membershipCount: _count.memberships, apiKeyCount: _count.apiKeys, webhookCount: _count.webhooks })
  } catch (error) { next(error) }
})

adminRouter.patch('/partners/:partnerId', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const current = await prisma.partner.findUnique({ where: { id: request.params.partnerId } })
    if (!current) { response.status(404).json({ message: 'Partner not found' }); return }
    const data: Prisma.PartnerUpdateInput = {}
    if (request.body?.name !== undefined) data.name = text(request.body.name, 'name', 200)
    if (request.body?.contactEmail !== undefined) {
      const email = optionalText(request.body.contactEmail, 'contactEmail', 254) ?? null
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { response.status(400).json({ message: 'contactEmail must be a valid email address' }); return }
      data.contactEmail = email
    }
    if (request.body?.status !== undefined) {
      if (!['PENDING', 'ACTIVE', 'SUSPENDED'].includes(request.body.status)) { response.status(400).json({ message: 'status must be PENDING, ACTIVE, or SUSPENDED' }); return }
      data.status = request.body.status
    }
    if (!Object.keys(data).length) { response.status(400).json({ message: 'Provide name, contactEmail, or status' }); return }
    const actor = response.locals.adminStaff as { id: string }
    const updated = await prisma.$transaction(async transaction => {
      const saved = await transaction.partner.update({ where: { id: current.id }, data })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, saved.status !== current.status ? `platform.partner_${saved.status.toLowerCase()}` : 'platform.partner_updated', 'Partner', saved.id, { fields: Object.keys(data), previousStatus: current.status, status: saved.status }, saved.id) })
      return saved
    })
    response.json(updated)
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.post('/partners/:partnerId/owners', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const partner = await prisma.partner.findUnique({ where: { id: request.params.partnerId }, select: { id: true } })
    if (!partner) { response.status(404).json({ message: 'Partner not found' }); return }
    const staffId = text(request.body?.staffId, 'staffId', 100)
    const staff = await prisma.staffUser.findUnique({ where: { id: staffId }, select: { id: true, email: true, active: true } })
    if (!staff || !staff.active) { response.status(404).json({ message: 'Active staff account not found' }); return }
    const actor = response.locals.adminStaff as { id: string }
    const membership = await prisma.$transaction(async transaction => {
      const saved = await transaction.partnerMembership.upsert({ where: { staffId_partnerId: { staffId, partnerId: partner.id } }, create: { staffId, partnerId: partner.id, role: 'OWNER' }, update: { role: 'OWNER', active: true } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'platform.partner_owner_assigned', 'PartnerMembership', saved.id, { staffId, email: staff.email }, partner.id) })
      return saved
    })
    response.status(200).json({ id: membership.id, staffId, email: staff.email, role: membership.role, active: membership.active })
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.get('/partners/:partnerId/invitations', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const items = await prisma.staffInvitation.findMany({ where: { partnerId: request.params.partnerId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true } })
    response.json({ items })
  } catch (error) { next(error) }
})

adminRouter.post('/partners/:partnerId/invitations', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const partner = await prisma.partner.findUnique({ where: { id: request.params.partnerId }, select: { id: true } })
    if (!partner) { response.status(404).json({ message: 'Partner not found' }); return }
    const email = text(request.body?.email, 'email', 254).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { response.status(400).json({ message: 'email must be valid' }); return }
    const role = request.body?.role
    if (!['OWNER', 'ADMIN', 'EVENT_MANAGER', 'GATE'].includes(role)) { response.status(400).json({ message: 'role must be OWNER, ADMIN, EVENT_MANAGER, or GATE' }); return }
    const actor = response.locals.adminStaff as { id: string }
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000)
    const invitation = await prisma.$transaction(async transaction => {
      const prior = await transaction.staffInvitation.findFirst({ where: { partnerId: partner.id, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
      if (prior) throw new Error('ACTIVE_INVITATION_EXISTS')
      const created = await transaction.staffInvitation.create({ data: { partnerId: partner.id, email, role, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt, createdById: actor.id } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.staff_invitation_created', 'StaffInvitation', created.id, { email, role, expiresAt }, partner.id) })
      return created
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    response.status(201).json({ id: invitation.id, email, role, expiresAt, invitationUrl: invitationUrl(token) })
  } catch (error) {
    if (error instanceof Error && error.message === 'ACTIVE_INVITATION_EXISTS') { response.status(409).json({ message: 'An active invitation already exists for this email; resend it instead' }); return }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') { response.status(409).json({ message: 'Invitation changed concurrently; reload and try again' }); return }
    if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('STAFF_INVITATION'))) badInput(error, response); else next(error)
  }
})

adminRouter.post('/partners/:partnerId/invitations/:invitationId/resend', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const actor = response.locals.adminStaff as { id: string }
    const current = await prisma.staffInvitation.findFirst({ where: { id: request.params.invitationId, partnerId: request.params.partnerId, acceptedAt: null, revokedAt: null } })
    if (!current) { response.status(404).json({ message: 'Active invitation not found' }); return }
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000)
    const nextInvite = await prisma.$transaction(async transaction => {
      const revoked = await transaction.staffInvitation.updateMany({ where: { id: current.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
      if (revoked.count !== 1) throw new Error('INVITATION_CHANGED')
      const created = await transaction.staffInvitation.create({ data: { partnerId: current.partnerId, email: current.email, role: current.role, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt, createdById: actor.id } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.staff_invitation_resent', 'StaffInvitation', created.id, { previousInvitationId: current.id, email: current.email, role: current.role, expiresAt }, current.partnerId) })
      return created
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    response.json({ id: nextInvite.id, email: nextInvite.email, role: nextInvite.role, expiresAt, invitationUrl: invitationUrl(token) })
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITATION_CHANGED') { response.status(409).json({ message: 'Invitation changed concurrently; reload and try again' }); return }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') { response.status(409).json({ message: 'Invitation changed concurrently; reload and try again' }); return }
    if (error instanceof Error && error.message.includes('STAFF_INVITATION')) badInput(error, response); else next(error)
  }
})

adminRouter.delete('/partners/:partnerId/invitations/:invitationId', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const actor = response.locals.adminStaff as { id: string }
    const invitation = await prisma.staffInvitation.findFirst({ where: { id: request.params.invitationId, partnerId: request.params.partnerId, acceptedAt: null, revokedAt: null } })
    if (!invitation) { response.status(404).json({ message: 'Active invitation not found' }); return }
    await prisma.$transaction(async transaction => {
      await transaction.staffInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.staff_invitation_revoked', 'StaffInvitation', invitation.id, { email: invitation.email, role: invitation.role }, invitation.partnerId) })
    })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/audit', async (request, response, next) => {
  try {
    if (!requirePlatformAdmin(response)) return
    const limit = Number(request.query.limit ?? 50)
    const offset = Number(request.query.offset ?? 0)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) { response.status(400).json({ message: 'limit must be 1-100 and offset must be a non-negative integer up to 100000' }); return }
    const partnerId = typeof request.query.partnerId === 'string' ? request.query.partnerId : undefined
    const action = typeof request.query.action === 'string' ? request.query.action.slice(0, 120) : undefined
    const entityType = typeof request.query.entityType === 'string' ? request.query.entityType.slice(0, 80) : undefined
    const where: Prisma.AdminAuditWhereInput = { ...(partnerId ? { partnerId } : {}), ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}), ...(entityType ? { entityType: { equals: entityType, mode: 'insensitive' } } : {}) }
    const [items, total] = await Promise.all([
      prisma.adminAudit.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit }),
      prisma.adminAudit.count({ where }),
    ])
    response.json({ items, total, limit, offset })
  } catch (error) { next(error) }
})

adminRouter.get('/events', async (_request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    response.json({ items: await prisma.event.findMany({ where: partnerId ? { partnerId } : {}, orderBy: [{ startsAt: 'desc' }], include: { performances: { orderBy: { startsAt: 'asc' }, include: { ticketTypes: { orderBy: { createdAt: 'asc' } } } }, bundles: { orderBy: { createdAt: 'asc' }, include: { items: { include: { ticketType: true } } } } } }) })
  } catch (error) { next(error) }
})

adminRouter.get('/events/:eventId/gate-staff', async (request, response, next) => {
  try {
    const event = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response), select: { id: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const assignments = await prisma.eventStaffAssignment.findMany({ where: { eventId: event.id }, include: { staff: { select: { id: true, email: true, active: true } } }, orderBy: { createdAt: 'asc' } })
    response.json({ items: assignments.map(item => ({ id: item.staff.id, email: item.staff.email, active: item.staff.active, assignedAt: item.createdAt })) })
  } catch (error) { next(error) }
})

adminRouter.get('/events/:eventId/orders', async (request, response, next) => {
  try {
    const event = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response), select: { id: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const parsedLimit = Number(request.query.limit ?? 50)
    const parsedOffset = Number(request.query.offset ?? 0)
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100 || !Number.isInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > 100000) {
      response.status(400).json({ message: 'limit must be 1-100 and offset must be a non-negative integer up to 100000' }); return
    }
    const orderGroups = await prisma.ticket.groupBy({
      by: ['orderId'],
      where: { eventId: event.id },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip: parsedOffset,
      take: parsedLimit + 1,
    })
    const hasMore = orderGroups.length > parsedLimit
    const orderIds = orderGroups.slice(0, parsedLimit).map(group => group.orderId)
    const tickets = orderIds.length ? await prisma.ticket.findMany({
      where: { eventId: event.id, orderId: { in: orderIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, publicId: true, status: true, issuedAt: true, checkedInAt: true,
        ticketType: { select: { name: true } },
        performance: { select: { name: true, startsAt: true } },
        order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true, createdAt: true } },
      },
    }) : []
    const byOrder = new Map<string, { id: string; orderNumber: string; status: string; paymentStatus: string; createdAt: Date; admissions: { ticketId: string; ticketType: string; performance: string; performanceStartsAt: Date; status: string; issuedAt: Date; checkedInAt: Date | null }[] }>()
    for (const ticket of tickets) {
      let order = byOrder.get(ticket.order.id)
      if (!order) {
        order = { ...ticket.order, admissions: [] }
        byOrder.set(ticket.order.id, order)
      }
      order.admissions.push({ ticketId: ticket.publicId, ticketType: ticket.ticketType.name, performance: ticket.performance.name, performanceStartsAt: ticket.performance.startsAt, status: ticket.status, issuedAt: ticket.issuedAt, checkedInAt: ticket.checkedInAt })
    }
    const orders = [...byOrder.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    response.json({ items: orders, limit: parsedLimit, offset: parsedOffset, hasMore })
  } catch (error) { next(error) }
})

adminRouter.get('/events/:eventId/check-in-summary', async (request, response, next) => {
  try {
    const event = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response), select: { id: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const [total, active, checkedIn, voided, refunded, byPerformance] = await Promise.all([
      prisma.ticket.count({ where: { eventId: event.id } }),
      prisma.ticket.count({ where: { eventId: event.id, status: 'ACTIVE' } }),
      prisma.ticket.count({ where: { eventId: event.id, status: 'CHECKED_IN' } }),
      prisma.ticket.count({ where: { eventId: event.id, status: 'VOID' } }),
      prisma.ticket.count({ where: { eventId: event.id, status: 'REFUNDED' } }),
      prisma.ticket.groupBy({ by: ['performanceId', 'status'], where: { eventId: event.id }, _count: { _all: true } }),
    ])
    const performanceIds = [...new Set(byPerformance.map(row => row.performanceId))]
    const performances = await prisma.performance.findMany({ where: { id: { in: performanceIds } }, select: { id: true, name: true, startsAt: true }, orderBy: { startsAt: 'asc' } })
    response.json({ total, active, checkedIn, voided, refunded, performances: performances.map(performance => ({ ...performance, tickets: Object.fromEntries(byPerformance.filter(row => row.performanceId === performance.id).map(row => [row.status, row._count._all])) })) })
  } catch (error) { next(error) }
})

adminRouter.post('/events/:eventId/gate-staff', async (request, response, next) => {
  try {
    const event = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response), select: { id: true, partnerId: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const staffId = text(request.body?.staffId, 'staffId', 100)
    const gateStaff = await prisma.staffUser.findFirst({ where: { id: staffId, active: true, memberships: { some: { partnerId: event.partnerId, active: true, role: 'GATE' } } }, select: { id: true, email: true } })
    if (!gateStaff) { response.status(404).json({ message: 'Active gate staff member not found in this partner' }); return }
    const actor = response.locals.adminStaff as { id: string }
    const assignment = await prisma.$transaction(async transaction => {
      const saved = await transaction.eventStaffAssignment.upsert({ where: { eventId_staffId: { eventId: event.id, staffId: gateStaff.id } }, create: { eventId: event.id, staffId: gateStaff.id }, update: {} })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'event.gate_staff_assigned', 'EventStaffAssignment', saved.id, { eventId: event.id, staffId: gateStaff.id }, event.partnerId) })
      return saved
    })
    response.status(201).json({ id: gateStaff.id, email: gateStaff.email, assignmentId: assignment.id })
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.delete('/events/:eventId/gate-staff/:staffId', async (request, response, next) => {
  try {
    const event = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response), select: { id: true, partnerId: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const assignment = await prisma.eventStaffAssignment.findUnique({ where: { eventId_staffId: { eventId: event.id, staffId: request.params.staffId } } })
    if (!assignment) { response.status(404).json({ message: 'Event staff assignment not found' }); return }
    const actor = response.locals.adminStaff as { id: string }
    await prisma.$transaction(async transaction => {
      await transaction.eventStaffAssignment.delete({ where: { id: assignment.id } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'event.gate_staff_removed', 'EventStaffAssignment', assignment.id, { eventId: event.id, staffId: assignment.staffId }, event.partnerId) })
    })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/memberships', async (_request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const memberships = await prisma.partnerMembership.findMany({ where: { partnerId }, include: { staff: { select: { id: true, email: true, active: true } } }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] })
    response.json({ items: memberships.map(item => ({ id: item.id, staffId: item.staffId, email: item.staff.email, staffActive: item.staff.active, role: item.role, active: item.active, createdAt: item.createdAt })) })
  } catch (error) { next(error) }
})

adminRouter.get('/staff-accounts', async (request, response, next) => {
  try {
    const actor = response.locals.adminStaff as { memberships: { partnerId: string; role: string }[] }
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner owner or administrator access required' }); return }
    const email = typeof request.query.email === 'string' ? request.query.email.trim() : ''
    if (email.length < 3 || email.length > 254) { response.status(400).json({ message: 'email search must contain 3 to 254 characters' }); return }
    const accounts = await prisma.staffUser.findMany({
      where: { active: true, email: { contains: email, mode: 'insensitive' } },
      select: { id: true, email: true, memberships: { where: { partnerId }, select: { active: true, role: true } } },
      orderBy: { email: 'asc' }, take: 20,
    })
    response.json({ items: accounts.map(account => ({ id: account.id, email: account.email, membership: account.memberships[0] ?? null })) })
  } catch (error) { next(error) }
})

adminRouter.put('/memberships/:staffId', async (request, response, next) => {
  try {
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner owner or administrator access required' }); return }
    const role = request.body?.role
    if (!['OWNER', 'ADMIN', 'EVENT_MANAGER', 'GATE'].includes(role)) { response.status(400).json({ message: 'role must be OWNER, ADMIN, EVENT_MANAGER, or GATE' }); return }
    if (role === 'OWNER' && !isPlatformAdmin(response)) { response.status(403).json({ message: 'Only a SuperAdmin can assign the OWNER role' }); return }
    const staffId = text(request.params.staffId, 'staffId', 100)
    const staff = await prisma.staffUser.findUnique({ where: { id: staffId }, select: { id: true, email: true, active: true } })
    if (!staff) { response.status(404).json({ message: 'Staff account not found' }); return }
    if (!staff.active) { response.status(409).json({ message: 'Inactive staff account cannot be added to a partner' }); return }
    const saved = await prisma.$transaction(async transaction => {
      const membership = await transaction.partnerMembership.upsert({ where: { staffId_partnerId: { staffId, partnerId } }, create: { staffId, partnerId, role }, update: { role, active: true } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.membership_upserted', 'PartnerMembership', membership.id, { staffId, role }, partnerId) })
      return membership
    })
    response.status(200).json({ id: saved.id, staffId, email: staff.email, role: saved.role, active: saved.active })
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.delete('/memberships/:staffId', async (request, response, next) => {
  try {
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner owner or administrator access required' }); return }
    const staffId = text(request.params.staffId, 'staffId', 100)
    const membership = await prisma.partnerMembership.findUnique({ where: { staffId_partnerId: { staffId, partnerId } } })
    if (!membership || !membership.active) { response.status(404).json({ message: 'Active partner membership not found' }); return }
    if (membership.role === 'OWNER') {
      const owners = await prisma.partnerMembership.count({ where: { partnerId, role: 'OWNER', active: true } })
      if (owners <= 1) { response.status(409).json({ message: 'The partner must retain at least one active owner' }); return }
    }
    await prisma.$transaction(async transaction => {
      await transaction.partnerMembership.update({ where: { id: membership.id }, data: { active: false } })
      await transaction.eventStaffAssignment.deleteMany({ where: { staffId, event: { partnerId } } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.membership_deactivated', 'PartnerMembership', membership.id, { staffId, role: membership.role }, partnerId) })
    })
    response.status(204).end()
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.get('/api-keys', async (_request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const keys = await prisma.partnerApiKey.findMany({ where: { partnerId }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, keyPrefix: true, scopes: true, rateLimitPerMinute: true, lastUsedAt: true, expiresAt: true, revokedAt: true, rotatedToId: true, rotationGraceUntil: true, createdAt: true } })
    response.json({ items: keys })
  } catch (error) { next(error) }
})

adminRouter.post('/api-keys', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    const name = text(request.body?.name, 'name', 100)
    const scopes = request.body?.scopes === undefined ? ['events:read'] : request.body.scopes
    const allowedScopes = ['events:read', 'checkout:create', 'orders:read']
    if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string' || !allowedScopes.includes(scope)) || !scopes.includes('events:read') || new Set(scopes).size !== scopes.length) {
      response.status(400).json({ message: 'scopes must include events:read and may include checkout:create and orders:read' }); return
    }
    if (scopes.includes('orders:read') && !scopes.includes('checkout:create')) { response.status(400).json({ message: 'orders:read requires checkout:create' }); return }
    const rateLimitPerMinute = request.body?.rateLimitPerMinute === undefined ? 120 : request.body.rateLimitPerMinute
    if (!Number.isSafeInteger(rateLimitPerMinute) || rateLimitPerMinute < 1 || rateLimitPerMinute > 600) { response.status(400).json({ message: 'rateLimitPerMinute must be an integer from 1 to 600' }); return }
    const expiresAt = request.body?.expiresAt === undefined || request.body.expiresAt === null || request.body.expiresAt === '' ? null : date(request.body.expiresAt, 'expiresAt')
    if (expiresAt && expiresAt <= new Date()) { response.status(400).json({ message: 'expiresAt must be in the future' }); return }
    const token = `flx_live_${randomBytes(32).toString('base64url')}`
    const key = await prisma.$transaction(async transaction => {
      const created = await transaction.partnerApiKey.create({ data: { partnerId, name, keyPrefix: token.slice(0, 16), keyHash: createHash('sha256').update(token).digest('hex'), scopes, rateLimitPerMinute, expiresAt, createdById: actor.id } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.api_key_created', 'PartnerApiKey', created.id, { name, scopes: created.scopes, rateLimitPerMinute, expiresAt }, partnerId) })
      return created
    })
    response.status(201).json({ id: key.id, name: key.name, keyPrefix: key.keyPrefix, scopes: key.scopes, rateLimitPerMinute: key.rateLimitPerMinute, expiresAt: key.expiresAt, token })
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.post('/api-keys/:keyId/rotate', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    const previous = await prisma.partnerApiKey.findFirst({ where: { id: request.params.keyId, partnerId } })
    if (!previous || previous.revokedAt || previous.rotatedToId) { response.status(404).json({ message: 'Active, unrotated API key not found' }); return }
    const requestedScopes = request.body?.scopes ?? previous.scopes
    const allowedScopes = ['events:read', 'checkout:create', 'orders:read']
    if (!Array.isArray(requestedScopes) || requestedScopes.some(scope => typeof scope !== 'string' || !allowedScopes.includes(scope)) || !requestedScopes.includes('events:read') || new Set(requestedScopes).size !== requestedScopes.length || (requestedScopes.includes('orders:read') && !requestedScopes.includes('checkout:create'))) {
      response.status(400).json({ message: 'Invalid scopes; include events:read, and orders:read requires checkout:create' }); return
    }
    const rateLimitPerMinute = request.body?.rateLimitPerMinute ?? previous.rateLimitPerMinute
    if (!Number.isSafeInteger(rateLimitPerMinute) || rateLimitPerMinute < 1 || rateLimitPerMinute > 600) { response.status(400).json({ message: 'rateLimitPerMinute must be an integer from 1 to 600' }); return }
    const rotationGraceMinutes = request.body?.rotationGraceMinutes === undefined ? 0 : request.body.rotationGraceMinutes
    if (!Number.isSafeInteger(rotationGraceMinutes) || rotationGraceMinutes < 0 || rotationGraceMinutes > 10080) { response.status(400).json({ message: 'rotationGraceMinutes must be an integer from 0 to 10080' }); return }
    const name = request.body?.name === undefined ? `${previous.name} rotated`.slice(0, 100) : text(request.body.name, 'name', 100)
    const expiresAt = request.body?.expiresAt === undefined ? previous.expiresAt : request.body.expiresAt === null || request.body.expiresAt === '' ? null : date(request.body.expiresAt, 'expiresAt')
    if (expiresAt && expiresAt <= new Date()) { response.status(400).json({ message: 'expiresAt must be in the future' }); return }
    const token = `flx_live_${randomBytes(32).toString('base64url')}`
    const now = new Date()
    const graceUntil = new Date(now.getTime() + rotationGraceMinutes * 60_000)
    const previousKeyValidUntil = rotationGraceMinutes && previous.expiresAt && previous.expiresAt < graceUntil ? previous.expiresAt : rotationGraceMinutes ? graceUntil : now
    const replacement = await prisma.$transaction(async transaction => {
      const current = await transaction.partnerApiKey.findUnique({ where: { id: previous.id } })
      if (!current || current.partnerId !== partnerId || current.revokedAt || current.rotatedToId) throw new Error('API key was already rotated or revoked')
      const nextKey = await transaction.partnerApiKey.create({ data: { partnerId, name, keyPrefix: token.slice(0, 16), keyHash: createHash('sha256').update(token).digest('hex'), scopes: requestedScopes, rateLimitPerMinute, expiresAt, createdById: actor.id } })
      const oldUpdated = await transaction.partnerApiKey.updateMany({
        where: { id: current.id, rotatedToId: null, revokedAt: null },
        data: { rotatedToId: nextKey.id, rotationGraceUntil: rotationGraceMinutes ? previousKeyValidUntil : now, revokedAt: rotationGraceMinutes ? null : now, expiresAt: rotationGraceMinutes ? previousKeyValidUntil : current.expiresAt },
      })
      if (oldUpdated.count !== 1) throw new Error('API key was already rotated or revoked')
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.api_key_rotated', 'PartnerApiKey', nextKey.id, { previousKeyId: current.id, scopes: requestedScopes, rateLimitPerMinute, rotationGraceMinutes, rotationGraceUntil: rotationGraceMinutes ? graceUntil : null }, partnerId) })
      return nextKey
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    response.status(201).json({ id: replacement.id, name: replacement.name, keyPrefix: replacement.keyPrefix, scopes: replacement.scopes, rateLimitPerMinute: replacement.rateLimitPerMinute, expiresAt: replacement.expiresAt, token, previousKeyId: previous.id, previousKeyValidUntil })
  } catch (error) {
    if (error instanceof Error && error.message.includes('already rotated or revoked')) response.status(409).json({ message: error.message })
    else if (error instanceof Error && error.message.includes(' is required')) badInput(error, response)
    else next(error)
  }
})

adminRouter.delete('/api-keys/:keyId', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    const key = await prisma.partnerApiKey.findFirst({ where: { id: request.params.keyId, partnerId } })
    if (!key) { response.status(404).json({ message: 'API key not found' }); return }
    if (key.revokedAt) { response.status(204).end(); return }
    await prisma.$transaction(async transaction => {
      await transaction.partnerApiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.api_key_revoked', 'PartnerApiKey', key.id, { name: key.name, keyPrefix: key.keyPrefix }, partnerId) })
    })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/webhooks', async (_request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const items = await prisma.partnerWebhook.findMany({ where: { partnerId }, select: { id: true, name: true, url: true, eventTypes: true, active: true, signingKeyVersion: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'desc' } })
    response.json({ items })
  } catch (error) { next(error) }
})

adminRouter.post('/webhooks', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    const name = text(request.body?.name, 'name', 100)
    const url = text(request.body?.url, 'url', 2048)
    const eventTypes = request.body?.eventTypes
    if (!Array.isArray(eventTypes) || eventTypes.length < 1 || eventTypes.length > supportedEvents.length || eventTypes.some(item => typeof item !== 'string' || !supportedEvents.includes(item)) || new Set(eventTypes).size !== eventTypes.length) {
      response.status(400).json({ message: `eventTypes must be unique values from: ${supportedEvents.join(', ')}` }); return
    }
    try { await validateWebhookUrl(url) } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : 'Invalid webhook URL' }); return }
    let encryptedSecret: string
    const secret = randomBytes(32).toString('base64url')
    try { encryptedSecret = encryptWebhookSecret(secret) } catch (error) {
      if (error instanceof Error && error.message.includes('PARTNER_WEBHOOK_ENCRYPTION_KEY')) { response.status(503).json({ message: 'Webhook signing is not configured on this server' }); return }
      throw error
    }
    const endpoint = await prisma.$transaction(async transaction => {
      const saved = await transaction.partnerWebhook.create({ data: { partnerId, name, url, eventTypes, encryptedSecret } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.webhook_created', 'PartnerWebhook', saved.id, { name, url, eventTypes }, partnerId) })
      return saved
    })
    response.status(201).json({ id: endpoint.id, name, url, eventTypes, active: endpoint.active, signingKeyVersion: endpoint.signingKeyVersion, secret })
  } catch (error) { if (error instanceof Error && error.message.includes(' is required')) badInput(error, response); else next(error) }
})

adminRouter.post('/webhooks/:webhookId/rotate-secret', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    const endpoint = await prisma.partnerWebhook.findFirst({ where: { id: request.params.webhookId, partnerId } })
    if (!endpoint) { response.status(404).json({ message: 'Webhook endpoint not found' }); return }
    const secret = randomBytes(32).toString('base64url')
    let encryptedSecret: string
    try { encryptedSecret = encryptWebhookSecret(secret) } catch (error) {
      if (error instanceof Error && error.message.includes('PARTNER_WEBHOOK_ENCRYPTION_KEY')) { response.status(503).json({ message: 'Webhook signing is not configured on this server' }); return }
      throw error
    }
    const updated = await prisma.$transaction(async transaction => {
      const saved = await transaction.partnerWebhook.update({ where: { id: endpoint.id }, data: { encryptedSecret, signingKeyVersion: { increment: 1 } } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.webhook_secret_rotated', 'PartnerWebhook', endpoint.id, { signingKeyVersion: saved.signingKeyVersion }, partnerId) })
      return saved
    })
    response.json({ id: updated.id, signingKeyVersion: updated.signingKeyVersion, secret })
  } catch (error) { next(error) }
})

adminRouter.delete('/webhooks/:webhookId', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    const endpoint = await prisma.partnerWebhook.findFirst({ where: { id: request.params.webhookId, partnerId } })
    if (!endpoint) { response.status(404).json({ message: 'Webhook endpoint not found' }); return }
    await prisma.$transaction(async transaction => {
      await transaction.partnerWebhook.update({ where: { id: endpoint.id }, data: { active: false } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.webhook_deactivated', 'PartnerWebhook', endpoint.id, { name: endpoint.name }, partnerId) })
    })
    response.status(204).end()
  } catch (error) { next(error) }
})

adminRouter.get('/webhook-deliveries', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const limit = Number(request.query.limit ?? 50)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) { response.status(400).json({ message: 'limit must be an integer from 1 to 100' }); return }
    const items = await prisma.partnerWebhookDelivery.findMany({ where: { webhook: { partnerId } }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true, webhookId: true, sourceEventId: true, eventType: true, status: true, attempts: true, nextAttemptAt: true, deliveredAt: true, lastStatusCode: true, lastError: true, createdAt: true } })
    response.json({ items })
  } catch (error) { next(error) }
})

adminRouter.post('/webhook-deliveries/:deliveryId/retry', async (request, response, next) => {
  try {
    const partnerId = partnerScope(response)
    if (!partnerId) { response.status(400).json({ message: 'Select a partner-scoped admin route' }); return }
    const actor = response.locals.adminStaff as { id: string; memberships: { partnerId: string; role: string }[] }
    const actorRole = actor.memberships.find(item => item.partnerId === partnerId)?.role
    if (!isPlatformAdmin(response) && !['OWNER', 'ADMIN'].includes(actorRole ?? '')) { response.status(403).json({ message: 'Partner administrator access required' }); return }
    const delivery = await prisma.partnerWebhookDelivery.findFirst({ where: { id: request.params.deliveryId, webhook: { partnerId }, status: 'FAILED' }, include: { webhook: { select: { active: true } } } })
    if (!delivery) { response.status(404).json({ message: 'Failed webhook delivery not found' }); return }
    if (!delivery.webhook.active) { response.status(409).json({ message: 'Webhook endpoint is disabled' }); return }
    await prisma.$transaction(async transaction => {
      await transaction.partnerWebhookDelivery.update({ where: { id: delivery.id }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), claimedAt: null, lastError: null, lastStatusCode: null } })
      await transaction.adminAudit.create({ data: auditData(request, actor.id, 'partner.webhook_delivery_retried', 'PartnerWebhookDelivery', delivery.id, { eventType: delivery.eventType }, partnerId) })
    })
    response.status(202).json({ id: delivery.id, status: 'PENDING' })
  } catch (error) { next(error) }
})

adminRouter.get('/refund-review', async (_request, response, next) => {
  try {
    if (!isPlatformAdmin(response)) { response.status(403).json({ message: 'Platform administrator access required' }); return }
    const orders = await prisma.order.findMany({
      where: { status: 'REFUND_PENDING' },
      orderBy: { updatedAt: 'asc' },
      include: { paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 }, items: true, events: { where: { event: 'payment.late_paid_manual_review' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    response.json({ items: orders.map(order => ({
      id: order.id, orderNumber: order.orderNumber, email: order.email, total: order.total, createdAt: order.createdAt,
      payment: order.paymentAttempts[0] ? { provider: order.paymentAttempts[0].provider, providerPaymentId: order.paymentAttempts[0].providerPaymentId, verifiedAt: order.paymentAttempts[0].verifiedAt } : null,
      items: order.items.map(item => ({ name: item.nameSnapshot, quantity: item.quantity })),
      review: order.events[0] ? { createdAt: order.events[0].createdAt, payload: order.events[0].payload } : null,
    })) })
  } catch (error) { next(error) }
})

adminRouter.post('/events', async (request, response, next) => {
  try {
    const body = request.body ?? {}
    const slug = text(body.slug, 'slug', 100).toLowerCase()
    if (body.partnerId !== undefined && typeof body.partnerId !== 'string') { response.status(400).json({ message: 'partnerId must be a string' }); return }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { response.status(400).json({ message: 'slug may contain lowercase letters, numbers, and hyphens' }); return }
    const startsAt = date(body.startsAt, 'startsAt')!
    const endsAt = date(body.endsAt, 'endsAt')!
    if (endsAt <= startsAt) { response.status(400).json({ message: 'endsAt must be later than startsAt' }); return }
    const scopedPartnerId = partnerScope(response)
    if (scopedPartnerId && body.partnerId && body.partnerId !== scopedPartnerId) { response.status(403).json({ message: 'Cannot create an event for another partner' }); return }
    const requestedPartnerId = scopedPartnerId || (typeof body.partnerId === 'string' ? body.partnerId : null)
    const partner = requestedPartnerId
      ? await prisma.partner.findUnique({ where: { id: requestedPartnerId }, select: { id: true, status: true } })
      : await prisma.partner.findUnique({ where: { slug: 'fluxora' }, select: { id: true, status: true } })
    if (!partner || partner.status !== 'ACTIVE') { response.status(404).json({ message: 'Active partner not found' }); return }
    const input = {
      slug, title: text(body.title, 'title'), venueName: text(body.venueName, 'venueName'), city: text(body.city, 'city'), startsAt, endsAt,
      summary: optionalText(body.summary, 'summary', 500) ?? null,
      description: optionalText(body.description, 'description', 20000) ?? null,
      coverImageUrl: optionalText(body.coverImageUrl, 'coverImageUrl', 2000) ?? null,
      venueAddress: optionalText(body.venueAddress, 'venueAddress', 1000) ?? null,
      timezone: body.timezone === undefined ? 'Asia/Jakarta' : text(body.timezone, 'timezone', 80),
    }
    const staff = response.locals.adminStaff as { id: string }
    const event = await prisma.$transaction(async transaction => {
      const created = await transaction.event.create({ data: { ...input, partnerId: partner.id } })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'event.created', 'Event', created.id, { slug, title: input.title }, partner.id) })
      return created
    })
    response.status(201).json(event)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else next(error) }
})

adminRouter.patch('/events/:eventId', async (request, response, next) => {
  try {
    const current = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response) })
    if (!current) { response.status(404).json({ message: 'Event not found' }); return }
    const body = request.body ?? {}
    const data: Prisma.EventUpdateInput = {}
    if (body.slug !== undefined) {
      const slug = text(body.slug, 'slug', 100).toLowerCase()
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { response.status(400).json({ message: 'slug may contain lowercase letters, numbers, and hyphens' }); return }
      data.slug = slug
    }
    for (const field of ['title', 'venueName', 'city', 'timezone'] as const) if (body[field] !== undefined) data[field] = text(body[field], field, field === 'timezone' ? 80 : 200)
    for (const field of ['summary', 'description', 'coverImageUrl', 'venueAddress'] as const) if (body[field] !== undefined) data[field] = optionalText(body[field], field, field === 'description' ? 20000 : 2000) ?? null
    if (body.startsAt !== undefined) data.startsAt = date(body.startsAt, 'startsAt')!
    if (body.endsAt !== undefined) data.endsAt = date(body.endsAt, 'endsAt')!
    if (body.status !== undefined) {
      if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(body.status)) { response.status(400).json({ message: 'status must be DRAFT, PUBLISHED, or ARCHIVED' }); return }
      data.status = body.status
    }
    const nextStart = data.startsAt instanceof Date ? data.startsAt : current.startsAt
    const nextEnd = data.endsAt instanceof Date ? data.endsAt : current.endsAt
    if (nextEnd <= nextStart) { response.status(400).json({ message: 'endsAt must be later than startsAt' }); return }
    if (!Object.keys(data).length) { response.status(400).json({ message: 'Provide at least one event field to update' }); return }
    const staff = response.locals.adminStaff as { id: string }
    const event = await prisma.$transaction(async transaction => {
      const updated = await transaction.event.update({ where: { id: current.id }, data })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'event.updated', 'Event', updated.id, { fields: Object.keys(data) }, current.partnerId) })
      return updated
    })
    response.json(event)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else next(error) }
})

adminRouter.post('/events/:eventId/performances', async (request, response, next) => {
  try {
    const event = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response), select: { id: true, partnerId: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const body = request.body ?? {}
    const startsAt = date(body.startsAt, 'startsAt')!
    const endsAt = date(body.endsAt, 'endsAt')!
    const checkInOpensAt = date(body.checkInOpensAt, 'checkInOpensAt', true)
    const checkInClosesAt = date(body.checkInClosesAt, 'checkInClosesAt', true)
    if (endsAt <= startsAt || (checkInOpensAt && checkInClosesAt && checkInClosesAt <= checkInOpensAt)) { response.status(400).json({ message: 'Performance and check-in end times must be later than their start times' }); return }
    const staff = response.locals.adminStaff as { id: string }
    const performance = await prisma.$transaction(async transaction => {
      const created = await transaction.performance.create({ data: { eventId: event.id, name: text(body.name, 'name'), startsAt, endsAt, checkInOpensAt, checkInClosesAt } })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'performance.created', 'Performance', created.id, { eventId: event.id, name: created.name }, event.partnerId) })
      return created
    })
    response.status(201).json(performance)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else next(error) }
})

adminRouter.patch('/performances/:performanceId', async (request, response, next) => {
  try {
    const current = await prisma.performance.findFirst({ where: { id: request.params.performanceId, ...(partnerScope(response) ? { event: { partnerId: partnerScope(response)! } } : {}) }, include: { event: { select: { partnerId: true } } } })
    if (!current) { response.status(404).json({ message: 'Performance not found' }); return }
    const body = request.body ?? {}
    const data: Prisma.PerformanceUpdateInput = {}
    if (body.name !== undefined) data.name = text(body.name, 'name')
    if (body.status !== undefined) {
      if (!['DRAFT', 'ON_SALE', 'PAUSED', 'CLOSED'].includes(body.status)) { response.status(400).json({ message: 'Invalid performance status' }); return }
      data.status = body.status
    }
    if (body.startsAt !== undefined) data.startsAt = date(body.startsAt, 'startsAt')!
    if (body.endsAt !== undefined) data.endsAt = date(body.endsAt, 'endsAt')!
    if (body.checkInOpensAt !== undefined) data.checkInOpensAt = date(body.checkInOpensAt, 'checkInOpensAt', true)
    if (body.checkInClosesAt !== undefined) data.checkInClosesAt = date(body.checkInClosesAt, 'checkInClosesAt', true)
    const startsAt = data.startsAt instanceof Date ? data.startsAt : current.startsAt
    const endsAt = data.endsAt instanceof Date ? data.endsAt : current.endsAt
    const opensAt = data.checkInOpensAt === null || data.checkInOpensAt instanceof Date ? data.checkInOpensAt : current.checkInOpensAt
    const closesAt = data.checkInClosesAt === null || data.checkInClosesAt instanceof Date ? data.checkInClosesAt : current.checkInClosesAt
    if (endsAt <= startsAt || (opensAt && closesAt && closesAt <= opensAt)) { response.status(400).json({ message: 'Performance and check-in end times must be later than their start times' }); return }
    if (!Object.keys(data).length) { response.status(400).json({ message: 'Provide at least one performance field to update' }); return }
    const staff = response.locals.adminStaff as { id: string }
    const performance = await prisma.$transaction(async transaction => {
      const updated = await transaction.performance.update({ where: { id: current.id }, data })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'performance.updated', 'Performance', updated.id, { fields: Object.keys(data) }, current.event.partnerId) })
      return updated
    })
    response.json(performance)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else next(error) }
})

adminRouter.post('/performances/:performanceId/ticket-types', async (request, response, next) => {
  try {
    const performance = await prisma.performance.findFirst({ where: { id: request.params.performanceId, ...(partnerScope(response) ? { event: { partnerId: partnerScope(response)! } } : {}) }, select: { id: true, event: { select: { partnerId: true } } } })
    if (!performance) { response.status(404).json({ message: 'Performance not found' }); return }
    const body = request.body ?? {}
    const staff = response.locals.adminStaff as { id: string }
    const ticketType = await prisma.$transaction(async transaction => {
      const created = await transaction.ticketType.create({ data: {
        performanceId: performance.id, code: text(body.code, 'code', 60).toUpperCase(), name: text(body.name, 'name'),
        description: optionalText(body.description, 'description', 2000) ?? null,
        price: integer(body.price, 'price', 0, 100_000_000), capacity: integer(body.capacity, 'capacity', 1, 1_000_000),
        perOrderLimit: body.perOrderLimit === undefined ? 10 : integer(body.perOrderLimit, 'perOrderLimit', 1, 100),
        salesStartAt: date(body.salesStartAt, 'salesStartAt', true), salesEndAt: date(body.salesEndAt, 'salesEndAt', true),
      } })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'ticket_type.created', 'TicketType', created.id, { performanceId: performance.id, code: created.code, price: created.price, capacity: created.capacity }, performance.event.partnerId) })
      return created
    })
    response.status(201).json(ticketType)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else next(error) }
})

adminRouter.patch('/ticket-types/:ticketTypeId', async (request, response, next) => {
  try {
    const current = await prisma.ticketType.findFirst({ where: { id: request.params.ticketTypeId, ...(partnerScope(response) ? { performance: { event: { partnerId: partnerScope(response)! } } } : {}) }, include: { performance: { include: { event: { select: { partnerId: true } } } } } })
    if (!current) { response.status(404).json({ message: 'Ticket type not found' }); return }
    const body = request.body ?? {}
    const data: Prisma.TicketTypeUpdateInput = {}
    if (body.code !== undefined) data.code = text(body.code, 'code', 60).toUpperCase()
    if (body.name !== undefined) data.name = text(body.name, 'name')
    if (body.description !== undefined) data.description = optionalText(body.description, 'description', 2000) ?? null
    if (body.price !== undefined) data.price = integer(body.price, 'price', 0, 100_000_000)
    if (body.perOrderLimit !== undefined) data.perOrderLimit = integer(body.perOrderLimit, 'perOrderLimit', 1, 100)
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') { response.status(400).json({ message: 'active must be a boolean' }); return }
      data.active = body.active
    }
    if (body.salesStartAt !== undefined) data.salesStartAt = date(body.salesStartAt, 'salesStartAt', true)
    if (body.salesEndAt !== undefined) data.salesEndAt = date(body.salesEndAt, 'salesEndAt', true)
    const newCapacity = body.capacity === undefined ? undefined : integer(body.capacity, 'capacity', 1, 1_000_000)
    if (newCapacity !== undefined && newCapacity < current.sold + current.reserved) { response.status(409).json({ message: 'Capacity cannot be lower than sold plus reserved tickets' }); return }
    if (!Object.keys(data).length && newCapacity === undefined) { response.status(400).json({ message: 'Provide at least one ticket type field to update' }); return }
    const staff = response.locals.adminStaff as { id: string }
    const ticketType = await prisma.$transaction(async transaction => {
      if (newCapacity !== undefined) {
        const changed = await transaction.ticketType.updateMany({ where: { id: current.id, sold: current.sold, reserved: current.reserved }, data: { capacity: newCapacity } })
        if (changed.count !== 1) throw new Error('Inventory changed while updating capacity; retry with current availability')
      }
      const updated = await transaction.ticketType.update({ where: { id: current.id }, data })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'ticket_type.updated', 'TicketType', updated.id, { fields: [...Object.keys(data), ...(newCapacity === undefined ? [] : ['capacity'])] }, current.performance.event.partnerId) })
      return updated
    })
    response.json(ticketType)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else if (error instanceof Error && error.message.includes('Inventory changed')) response.status(409).json({ message: error.message }); else next(error) }
})

adminRouter.post('/events/:eventId/bundles', async (request, response, next) => {
  try {
    const event = await prisma.event.findFirst({ where: scopedIdWhere(request.params.eventId, response), select: { id: true, partnerId: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const body = request.body ?? {}
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) { response.status(400).json({ message: 'items must contain 1 to 30 ticket type entries' }); return }
    const items: { ticketTypeId: string; quantity: number }[] = (body.items as unknown[]).map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new Error('Each bundle item must include a ticketTypeId and quantity')
      const item = entry as Record<string, unknown>
      return { ticketTypeId: text(item.ticketTypeId, 'ticketTypeId', 100), quantity: integer(item.quantity, 'quantity', 1, 100) }
    })
    if (new Set(items.map(item => item.ticketTypeId)).size !== items.length) { response.status(400).json({ message: 'Each ticket type may appear only once in a bundle' }); return }
    const types = await prisma.ticketType.findMany({ where: { id: { in: items.map(item => item.ticketTypeId) }, performance: { eventId: event.id } }, select: { id: true } })
    if (types.length !== items.length) { response.status(400).json({ message: 'Every bundle ticket type must belong to this event' }); return }
    const capacity = body.capacity === undefined || body.capacity === null ? null : integer(body.capacity, 'capacity', 1, 1_000_000)
    const staff = response.locals.adminStaff as { id: string }
    const bundle = await prisma.$transaction(async transaction => {
      const created = await transaction.bundle.create({ data: {
        eventId: event.id, code: text(body.code, 'code', 60).toUpperCase(), name: text(body.name, 'name'),
        description: optionalText(body.description, 'description', 2000) ?? null,
        price: integer(body.price, 'price', 0, 100_000_000), capacity,
        perOrderLimit: body.perOrderLimit === undefined ? 5 : integer(body.perOrderLimit, 'perOrderLimit', 1, 100),
        salesStartAt: date(body.salesStartAt, 'salesStartAt', true), salesEndAt: date(body.salesEndAt, 'salesEndAt', true),
        items: { create: items },
      }, include: { items: true } })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'bundle.created', 'Bundle', created.id, { eventId: event.id, code: created.code, itemCount: items.length }, event.partnerId) })
      return created
    })
    response.status(201).json(bundle)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else next(error) }
})

adminRouter.patch('/bundles/:bundleId', async (request, response, next) => {
  try {
    const current = await prisma.bundle.findFirst({ where: { id: request.params.bundleId, ...(partnerScope(response) ? { event: { partnerId: partnerScope(response)! } } : {}) }, include: { event: { select: { partnerId: true } } } })
    if (!current) { response.status(404).json({ message: 'Bundle not found' }); return }
    const body = request.body ?? {}
    const data: Prisma.BundleUpdateInput = {}
    let newCapacity: number | null | undefined
    if (body.code !== undefined) data.code = text(body.code, 'code', 60).toUpperCase()
    if (body.name !== undefined) data.name = text(body.name, 'name')
    if (body.description !== undefined) data.description = optionalText(body.description, 'description', 2000) ?? null
    if (body.price !== undefined) data.price = integer(body.price, 'price', 0, 100_000_000)
    if (body.perOrderLimit !== undefined) data.perOrderLimit = integer(body.perOrderLimit, 'perOrderLimit', 1, 100)
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') { response.status(400).json({ message: 'active must be a boolean' }); return }
      data.active = body.active
    }
    if (body.salesStartAt !== undefined) data.salesStartAt = date(body.salesStartAt, 'salesStartAt', true)
    if (body.salesEndAt !== undefined) data.salesEndAt = date(body.salesEndAt, 'salesEndAt', true)
    if (body.capacity !== undefined) {
      newCapacity = body.capacity === null ? null : integer(body.capacity, 'capacity', 1, 1_000_000)
      if (newCapacity !== null && newCapacity < current.sold + current.reserved) { response.status(409).json({ message: 'Capacity cannot be lower than sold plus reserved bundles' }); return }
    }
    if (!Object.keys(data).length) { response.status(400).json({ message: 'Provide at least one bundle field to update' }); return }
    const staff = response.locals.adminStaff as { id: string }
    const bundle = await prisma.$transaction(async transaction => {
      if (newCapacity !== undefined) {
        const changed = await transaction.bundle.updateMany({ where: { id: current.id, sold: current.sold, reserved: current.reserved }, data: { capacity: newCapacity } })
        if (changed.count !== 1) throw new Error('Inventory changed while updating capacity; retry with current availability')
      }
      const updated = await transaction.bundle.update({ where: { id: current.id }, data })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'bundle.updated', 'Bundle', updated.id, { fields: Object.keys(data) }, current.event.partnerId) })
      return updated
    })
    response.json(bundle)
  } catch (error) { if (error instanceof Error && (error.message.includes(' is required') || error.message.includes('must be'))) badInput(error, response); else if (error instanceof Error && error.message.includes('Inventory changed')) response.status(409).json({ message: error.message }); else next(error) }
})

adminRouter.post('/orders/:orderId/ticket-delivery/retry', async (request, response, next) => {
  try {
    if (!isPlatformAdmin(response)) { response.status(403).json({ message: 'Platform administrator access required' }); return }
    const order = await prisma.order.findUnique({ where: { id: request.params.orderId }, include: { ticketDelivery: true } })
    if (!order || order.paymentStatus !== 'PAID' || !order.ticketDelivery) { response.status(404).json({ message: 'Paid order delivery not found' }); return }
    if (order.ticketDelivery.status !== 'FAILED') { response.status(409).json({ message: 'Only failed ticket deliveries can be retried' }); return }
    const staff = response.locals.adminStaff as { id: string }
    await prisma.$transaction(async transaction => {
      const retried = await transaction.ticketDelivery.updateMany({ where: { id: order.ticketDelivery!.id, status: 'FAILED' }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), claimedAt: null, lastError: null } })
      if (retried.count !== 1) throw new Error('Ticket delivery state changed; refresh and retry')
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'ticket_delivery.retry_requested', 'TicketDelivery', order.ticketDelivery!.id, { orderId: order.id }) })
    })
    response.status(202).json({ status: 'PENDING' })
  } catch (error) { if (error instanceof Error && error.message.includes('state changed')) response.status(409).json({ message: error.message }); else next(error) }
})

adminRouter.post('/orders/:orderId/refund-confirmed', async (request, response, next) => {
  try {
    if (!isPlatformAdmin(response)) { response.status(403).json({ message: 'Platform administrator access required' }); return }
    const reference = text(request.body?.providerRefundReference, 'providerRefundReference', 160)
    const order = await prisma.order.findUnique({ where: { id: request.params.orderId }, include: { checkoutQuote: { select: { partnerId: true } }, paymentAttempts: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    const attempt = order?.paymentAttempts[0]
    if (!order || order.status !== 'REFUND_PENDING' || !attempt || attempt.status !== 'PAID') { response.status(409).json({ message: 'Order is not awaiting a refund confirmation' }); return }
    const staff = response.locals.adminStaff as { id: string }
    await prisma.$transaction(async transaction => {
      const paymentUpdated = await transaction.paymentAttempt.updateMany({ where: { id: attempt.id, status: 'PAID' }, data: { status: 'REFUNDED', providerStatus: 'refunded' } })
      const orderUpdated = await transaction.order.updateMany({ where: { id: order.id, status: 'REFUND_PENDING', paymentStatus: 'PAID' }, data: { status: 'REFUNDED', paymentStatus: 'REFUNDED' } })
      if (paymentUpdated.count !== 1 || orderUpdated.count !== 1) throw new Error('Refund review state changed; refresh and retry')
      const orderEvent = await transaction.orderEvent.create({ data: { orderId: order.id, event: 'payment.refund_confirmed_manually', actor: staff.id, payload: { providerRefundReference: reference } } })
      await enqueuePartnerWebhook(transaction, { partnerId: order.checkoutQuote.partnerId, eventType: orderEvent.event, sourceEventId: orderEvent.id, payload: { orderId: order.id, orderNumber: order.orderNumber, status: 'REFUNDED', paymentStatus: 'REFUNDED', amount: order.total } })
      await transaction.adminAudit.create({ data: auditData(request, staff.id, 'payment.refund_confirmed_manually', 'Order', order.id, { providerRefundReference: reference }, order.checkoutQuote.partnerId) })
    })
    response.status(200).json({ orderId: order.id, status: 'REFUNDED' })
  } catch (error) {
    if (error instanceof Error && error.message.includes(' is required')) badInput(error, response)
    else if (error instanceof Error && error.message.includes('state changed')) response.status(409).json({ message: error.message })
    else next(error)
  }
})
