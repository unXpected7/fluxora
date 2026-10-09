import { createHash } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { prisma } from '../lib/prisma.js'
import { checkoutRouter } from './checkout.js'

export const partnerApiRouter = Router()

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
let lastCleanupAt = 0

export async function prunePartnerApiRequestWindows() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000)
  await prisma.partnerApiRequestWindow.deleteMany({ where: { windowStart: { lt: cutoff } } })
}

const authenticate: RequestHandler = async (request, response, next) => {
  try {
    const authorization = request.header('authorization') ?? ''
    const match = /^Bearer (flx_live_[A-Za-z0-9_-]{40,})$/.exec(authorization)
    if (!match) { response.status(401).json({ message: 'A valid partner API key is required' }); return }
    const key = await prisma.partnerApiKey.findUnique({ where: { keyHash: hash(match[1]) }, include: { partner: { select: { id: true, status: true } } } })
    const now = new Date()
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now) || key.partner.status !== 'ACTIVE') {
      response.status(401).json({ message: 'A valid partner API key is required' }); return
    }
    const windowStart = new Date(now)
    windowStart.setUTCSeconds(0, 0)
    const window = await prisma.partnerApiRequestWindow.upsert({
      where: { apiKeyId_windowStart: { apiKeyId: key.id, windowStart } },
      create: { apiKeyId: key.id, windowStart, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
      select: { requestCount: true },
    })
    if (now.getTime() - lastCleanupAt > 60_000) {
      lastCleanupAt = now.getTime()
      void prunePartnerApiRequestWindows().catch(error => console.error(JSON.stringify({ event: 'partner_api_rate_window_cleanup_failed', errorName: error instanceof Error ? error.name : 'UnknownError' })))
    }
    if (window.requestCount > key.rateLimitPerMinute) { response.status(429).json({ message: 'API key rate limit exceeded' }); return }
    response.locals.partnerApiKeyId = key.id
    response.locals.partnerId = key.partnerId
    response.locals.partnerApiScopes = key.scopes
    await prisma.partnerApiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } })
    next()
  } catch (error) { next(error) }
}

partnerApiRouter.use(authenticate)

const requireScope = (scope: string): RequestHandler => (_request, response, next) => {
  const scopes = response.locals.partnerApiScopes as string[] | undefined
  if (!scopes?.includes(scope)) { response.status(403).json({ message: `API key scope required: ${scope}` }); return }
  next()
}

const catalogueSelect = {
  id: true, slug: true, title: true, summary: true, coverImageUrl: true, venueName: true, venueAddress: true, city: true, timezone: true, startsAt: true, endsAt: true,
  performances: { where: { status: 'ON_SALE' as const }, orderBy: { startsAt: 'asc' as const }, select: { id: true, name: true, startsAt: true, endsAt: true, ticketTypes: { where: { active: true }, select: { id: true, name: true, description: true, price: true, capacity: true, sold: true, reserved: true } } } },
  bundles: { where: { active: true }, select: { id: true, code: true, name: true, description: true, price: true, capacity: true, sold: true, reserved: true, items: { select: { quantity: true, ticketType: { select: { id: true, name: true, performanceId: true } } } } } },
}

partnerApiRouter.get('/events', requireScope('events:read'), async (_request, response, next) => {
  try {
    const now = new Date()
    const items = await prisma.event.findMany({
      where: { partnerId: response.locals.partnerId, status: 'PUBLISHED', endsAt: { gte: now }, partner: { is: { status: 'ACTIVE' } } },
      orderBy: [{ startsAt: 'asc' }, { title: 'asc' }], select: catalogueSelect,
    })
    response.json({ items })
  } catch (error) { next(error) }
})

partnerApiRouter.get('/events/:slug', requireScope('events:read'), async (request, response, next) => {
  try {
    const now = new Date()
    const slug = Array.isArray(request.params.slug) ? request.params.slug[0] : request.params.slug
    const event = await prisma.event.findFirst({
      where: { partnerId: response.locals.partnerId, slug, status: 'PUBLISHED', endsAt: { gte: now }, partner: { is: { status: 'ACTIVE' } } },
      select: catalogueSelect,
    })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    response.json(event)
  } catch (error) { next(error) }
})

partnerApiRouter.use('/checkout', (request, response, next) => {
  const scope = request.method === 'GET' ? 'orders:read' : 'checkout:create'
  requireScope(scope)(request, response, next)
})
partnerApiRouter.use('/checkout', checkoutRouter)
