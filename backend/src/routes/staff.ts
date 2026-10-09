import { createHash } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { currentStaff, createStaffSession, deleteStaffSession, clearStaffCookie, setStaffCookie, verifyStaffPassword, hashStaffPassword } from '../lib/staffAuth.js'
import { prisma } from '../lib/prisma.js'
import { verifyTicketQrToken } from '../lib/ticketQr.js'
import { config } from '../lib/config.js'
import { isStaffOriginAllowed } from '../lib/staffOrigin.js'
import { adminRouter } from './admin.js'

export const staffRouter = Router()

staffRouter.use((request, response, next) => {
  const origin = request.header('origin')
  if (!isStaffOriginAllowed(origin, config.staffClientOrigins)) { response.status(403).json({ message: 'Origin is not allowed' }); return }
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
const invitationLimit = rateLimit(5, 15 * 60 * 1000)
const scanLimit = rateLimit(60, 60 * 1000)

function invitationTokenHash(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(value)) return null
  return createHash('sha256').update(value).digest('hex')
}

staffRouter.post('/auth/invitations/preview', invitationLimit, async (request, response, next) => {
  try {
    const tokenHash = invitationTokenHash(request.body?.token)
    const invitation = tokenHash ? await prisma.staffInvitation.findUnique({ where: { tokenHash }, include: { partner: { select: { name: true, status: true } } } }) : null
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date() || invitation.partner.status === 'SUSPENDED') {
      response.status(400).json({ message: 'Invitation is invalid or expired' }); return
    }
    const existing = await prisma.staffUser.findUnique({ where: { email: invitation.email }, select: { active: true } })
    if (existing && !existing.active) { response.status(400).json({ message: 'Invitation is invalid or expired' }); return }
    response.json({ email: invitation.email, role: invitation.role, partnerName: invitation.partner.name, partnerStatus: invitation.partner.status, expiresAt: invitation.expiresAt, requiresPassword: !existing })
  } catch (error) { next(error) }
})

staffRouter.post('/auth/invitations/accept', invitationLimit, async (request, response, next) => {
  try {
    const tokenHash = invitationTokenHash(request.body?.token)
    const invitation = tokenHash ? await prisma.staffInvitation.findUnique({ where: { tokenHash }, include: { partner: { select: { id: true, slug: true, name: true, status: true } } } }) : null
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date() || invitation.partner.status === 'SUSPENDED') {
      response.status(400).json({ message: 'Invitation is invalid or expired' }); return
    }
    const currentStaffUser = await prisma.staffUser.findUnique({ where: { email: invitation.email } })
    if (currentStaffUser && !currentStaffUser.active) { response.status(400).json({ message: 'Invitation is invalid or expired' }); return }
    const password = typeof request.body?.password === 'string' ? request.body.password : ''
    if (!currentStaffUser && (password.length < 12 || password.length > 128)) {
      response.status(400).json({ message: 'Password must contain 12 to 128 characters' }); return
    }
    const passwordHash = currentStaffUser ? null : await hashStaffPassword(password)
    const accepted = await prisma.$transaction(async transaction => {
      const claim = await transaction.staffInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } })
      if (claim.count !== 1) throw new Error('Invitation is invalid or expired')
      const staff = currentStaffUser ?? await transaction.staffUser.create({ data: { email: invitation.email, passwordHash: passwordHash!, role: invitation.role === 'GATE' ? 'GATE' : 'ADMIN' } })
      if (!staff.active) throw new Error('Invitation is invalid or expired')
      await transaction.partnerMembership.upsert({ where: { staffId_partnerId: { staffId: staff.id, partnerId: invitation.partnerId } }, create: { staffId: staff.id, partnerId: invitation.partnerId, role: invitation.role }, update: { role: invitation.role, active: true } })
      await transaction.adminAudit.create({ data: { actorId: staff.id, partnerId: invitation.partnerId, action: 'partner.staff_invitation_accepted', entityType: 'StaffInvitation', entityId: invitation.id, payload: { email: invitation.email, role: invitation.role } } })
      return staff
    })
    setStaffCookie(response, await createStaffSession(accepted.id))
    response.json({ accepted: true, partner: { slug: invitation.partner.slug, name: invitation.partner.name } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Invitation is invalid or expired') response.status(400).json({ message: error.message })
    else next(error)
  }
})

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
