import { Router, type RequestHandler } from 'express'
import { currentStaff, createStaffSession, deleteStaffSession, clearStaffCookie, setStaffCookie, verifyStaffPassword } from '../lib/staffAuth.js'
import { prisma } from '../lib/prisma.js'
import { verifyTicketQrToken } from '../lib/ticketQr.js'
import { config } from '../lib/config.js'
import { adminRouter } from './admin.js'

export const staffRouter = Router()

staffRouter.use((request, response, next) => {
  const origin = request.header('origin')
  if (origin && !config.clientOrigins.includes(origin)) { response.status(403).json({ message: 'Origin is not allowed' }); return }
  next()
})

const attempts = new Map<string, { count: number; resetAt: number }>()
function rateLimit(limit: number, windowMs: number): RequestHandler {
  return (request, response, next) => {
    const key = `${request.path}:${request.ip || 'unknown'}`
    const now = Date.now()
    const current = attempts.get(key)
    if (attempts.size > 5000) for (const [entry, value] of attempts) if (value.resetAt <= now) attempts.delete(entry)
    if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + windowMs })
    else if (++current.count > limit) { response.status(429).json({ message: 'Too many requests. Try again later.' }); return }
    next()
  }
}

const authLimit = rateLimit(10, 15 * 60 * 1000)
const scanLimit = rateLimit(60, 60 * 1000)

staffRouter.post('/auth/login', authLimit, async (request, response, next) => {
  try {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length > 256) {
      response.status(401).json({ message: 'Invalid email or password' }); return
    }
    const staff = await prisma.staffUser.findUnique({ where: { email }, include: { memberships: { where: { active: true }, include: { partner: { select: { slug: true, name: true, status: true } } } } } })
    if (!staff?.active || !await verifyStaffPassword(password, staff.passwordHash)) {
      response.status(401).json({ message: 'Invalid email or password' }); return
    }
    setStaffCookie(response, await createStaffSession(staff.id))
    response.json({ staff: { id: staff.id, email: staff.email, role: staff.role, platformRole: staff.platformRole, memberships: staff.memberships.map(membership => ({ partnerId: membership.partnerId, slug: membership.partner.slug, name: membership.partner.name, status: membership.partner.status, role: membership.role })) } })
  } catch (error) { next(error) }
})

staffRouter.get('/auth/session', async (request, response, next) => {
  try { response.json({ staff: await currentStaff(request.header('cookie')) }) }
  catch (error) { next(error) }
})

staffRouter.post('/auth/logout', async (request, response, next) => {
  try {
    await deleteStaffSession(request.header('cookie'))
    clearStaffCookie(response)
    response.status(204).end()
  } catch (error) { next(error) }
})

staffRouter.post('/check-ins/validate', scanLimit, async (request, response, next) => {
  try {
    const staff = await currentStaff(request.header('cookie'))
    if (!staff) { response.status(401).json({ message: 'Staff authentication required' }); return }
    const token = typeof request.body?.qrToken === 'string' ? request.body.qrToken.trim() : ''
    const eventId = typeof request.body?.eventId === 'string' ? request.body.eventId.trim() : ''
    const gate = typeof request.body?.gate === 'string' ? request.body.gate.trim().slice(0, 100) || null : null
    if (!token || token.length > 512 || eventId.length < 1 || eventId.length > 100) {
      response.status(400).json({ message: 'A valid qrToken and eventId are required' }); return
    }

    const event = await prisma.event.findFirst({ where: { id: eventId, ...(staff.platformRole === 'SUPERADMIN' ? {} : { partnerId: { in: staff.memberships.map(item => item.partnerId) } }) }, select: { id: true, partnerId: true } })
    if (!event) { response.status(404).json({ message: 'Event not found' }); return }
    const membership = staff.memberships.find(item => item.partnerId === event.partnerId)
    if (staff.platformRole !== 'SUPERADMIN') {
      if (!membership || !['OWNER', 'ADMIN', 'GATE'].includes(membership.role)) { response.status(403).json({ message: 'You are not assigned to this event' }); return }
      if (membership.role === 'GATE') {
        const assignment = await prisma.eventStaffAssignment.findUnique({ where: { eventId_staffId: { eventId, staffId: staff.id } }, select: { id: true } })
        if (!assignment) { response.status(403).json({ message: 'You are not assigned to this event' }); return }
      }
    }

    const verified = verifyTicketQrToken(token)
    const ticket = verified ? await prisma.ticket.findUnique({
      where: { publicId: verified.publicId },
      include: { order: { select: { paymentStatus: true } }, performance: { select: { checkInOpensAt: true, checkInClosesAt: true, startsAt: true, endsAt: true } } },
    }) : null
    const now = new Date()
    let result: 'ACCEPTED' | 'ALREADY_USED' | 'VOID' | 'WRONG_EVENT' | 'OUTSIDE_WINDOW' | 'UNKNOWN' = 'UNKNOWN'
    if (ticket && verified?.tokenHash === ticket.qrTokenHash) {
      if (ticket.eventId !== eventId) result = 'WRONG_EVENT'
      else if (ticket.status === 'VOID' || ticket.status === 'REFUNDED' || ticket.order.paymentStatus !== 'PAID') result = 'VOID'
      else if (ticket.status === 'CHECKED_IN') result = 'ALREADY_USED'
      else if (now < (ticket.performance.checkInOpensAt ?? ticket.performance.startsAt) || now > (ticket.performance.checkInClosesAt ?? ticket.performance.endsAt)) result = 'OUTSIDE_WINDOW'
      else {
        result = await prisma.$transaction(async transaction => {
          const consumed = await transaction.ticket.updateMany({ where: { id: ticket.id, status: 'ACTIVE' }, data: { status: 'CHECKED_IN', checkedInAt: now } })
          const scanResult = consumed.count === 1 ? 'ACCEPTED' : 'ALREADY_USED'
          await transaction.ticketScan.create({ data: { ticketId: ticket.id, result: scanResult, gate, staffRef: staff.id, requestId: response.locals.requestId, scannedAt: now } })
          return scanResult
        })
      }
    }

    if (result !== 'ACCEPTED' && result !== 'ALREADY_USED' || (ticket && result === 'ALREADY_USED' && ticket.status === 'CHECKED_IN')) {
      await prisma.ticketScan.create({ data: { ticketId: ticket?.id ?? null, result, gate, staffRef: staff.id, requestId: response.locals.requestId, scannedAt: now } })
    }
    response.json({ result, ticket: result === 'UNKNOWN' || result === 'WRONG_EVENT' || !ticket ? null : { publicId: ticket.publicId, eventId: ticket.eventId, performanceId: ticket.performanceId, status: result === 'ACCEPTED' || result === 'ALREADY_USED' ? 'CHECKED_IN' : ticket.status } })
  } catch (error) { next(error) }
})

staffRouter.use('/admin', rateLimit(120, 60 * 1000), adminRouter)
staffRouter.use('/partners/:partnerId/admin', rateLimit(120, 60 * 1000), adminRouter)
