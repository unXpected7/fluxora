import { prisma } from './prisma.js'
import { ticketQrToken } from './ticketQr.js'

const maxAttempts = 8
const claimTimeoutMs = 5 * 60_000

function mailConfiguration() {
  const apiKey = process.env.BREVO_API_KEY?.trim() || ''
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || ''
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Fluxora Tickets'
  const endpoint = (process.env.BREVO_API_BASE_URL?.trim() || 'https://api.brevo.com/v3').replace(/\/$/, '')
  if (!apiKey || !senderEmail) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) throw new Error('BREVO_SENDER_EMAIL is invalid')
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.hostname !== 'api.brevo.com') throw new Error('BREVO_API_BASE_URL must use the Brevo HTTPS API host')
  return { apiKey, senderEmail, senderName, endpoint }
}

function ticketEmail(order: {
  orderNumber: string
  firstName: string | null
  tickets: Array<{ publicId: string; performance: { name: string; startsAt: Date }; event: { title: string }; ticketType: { name: string } }>
}) {
  const greeting = order.firstName ? `Hi ${order.firstName},` : 'Hello,'
  const rows = order.tickets.map((ticket, index) => [
    `${index + 1}. ${ticket.event.title} — ${ticket.performance.name}`,
    `   Ticket: ${ticket.ticketType.name}`,
    `   Starts: ${ticket.performance.startsAt.toISOString()}`,
    `   Ticket ID: ${ticket.publicId}`,
    `   QR code value: ${ticketQrToken(ticket.publicId)}`,
  ].join('\n')).join('\n\n')
  return {
    subject: `Your Fluxora tickets for order ${order.orderNumber}`,
    textContent: `${greeting}\n\nYour payment is confirmed. Present the QR code for each admission at the venue. The QR code value below can be rendered as a QR code in your ticket wallet. Keep it private.\n\nOrder: ${order.orderNumber}\n\n${rows}\n\nIf you need help with this order, contact the event organizer and include your order number.`,
  }
}

async function sendDelivery(deliveryId: string) {
  const delivery = await prisma.ticketDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      order: {
        include: {
          tickets: {
            include: {
              event: { select: { title: true } },
              performance: { select: { name: true, startsAt: true } },
              ticketType: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  })
  if (!delivery || delivery.order.paymentStatus !== 'PAID' || !delivery.order.tickets.length) throw new Error('Paid order tickets are unavailable for delivery')
  const config = mailConfiguration()
  if (!config) throw new Error('Brevo mail configuration is missing')
  const email = ticketEmail(delivery.order)
  const response = await fetch(`${config.endpoint}/smtp/email`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { 'api-key': config.apiKey, accept: 'application/json', 'content-type': 'application/json', ...(process.env.BREVO_SANDBOX === 'true' ? { 'x-sib-sandbox': 'drop' } : {}) },
    body: JSON.stringify({ sender: { email: config.senderEmail, name: config.senderName }, to: [{ email: delivery.email }], subject: email.subject, textContent: email.textContent }),
  })
  if (!response.ok) throw new Error(`Brevo rejected email (HTTP ${response.status})`)
}

export async function processTicketDeliveries() {
  if (!process.env.BREVO_API_KEY?.trim() || !process.env.BREVO_SENDER_EMAIL?.trim()) return
  const now = new Date()
  const staleClaim = new Date(now.getTime() - claimTimeoutMs)
  const pending = await prisma.ticketDelivery.findMany({
    where: { attempts: { lt: maxAttempts }, OR: [{ status: 'PENDING', nextAttemptAt: { lte: now } }, { status: 'SENDING', claimedAt: { lt: staleClaim } }] },
    orderBy: { createdAt: 'asc' }, take: 10, select: { id: true, status: true },
  })
  for (const candidate of pending) {
    const claimed = await prisma.ticketDelivery.updateMany({
      where: candidate.status === 'PENDING'
        ? { id: candidate.id, status: 'PENDING', nextAttemptAt: { lte: now } }
        : { id: candidate.id, status: 'SENDING', claimedAt: { lt: staleClaim } },
      data: { status: 'SENDING', claimedAt: now, attempts: { increment: 1 } },
    })
    if (claimed.count !== 1) continue
    const delivery = await prisma.ticketDelivery.findUnique({ where: { id: candidate.id }, select: { attempts: true } })
    if (!delivery) continue
    try {
      await sendDelivery(candidate.id)
      await prisma.ticketDelivery.updateMany({ where: { id: candidate.id, status: 'SENDING', claimedAt: now }, data: { status: 'SENT', sentAt: new Date(), claimedAt: null, lastError: null } })
      await prisma.orderEvent.create({ data: { orderId: (await prisma.ticketDelivery.findUniqueOrThrow({ where: { id: candidate.id }, select: { orderId: true } })).orderId, event: 'tickets.email_sent', actor: 'system' } })
    } catch (error) {
      const attempts = delivery.attempts
      const retry = attempts < maxAttempts
      const delayMs = Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 10))
      const message = error instanceof Error && error.message.startsWith('Brevo rejected email') ? error.message : 'Email provider request failed'
      await prisma.ticketDelivery.updateMany({ where: { id: candidate.id, status: 'SENDING', claimedAt: now }, data: { status: retry ? 'PENDING' : 'FAILED', nextAttemptAt: new Date(Date.now() + delayMs), claimedAt: null, lastError: message } })
      if (!retry) console.error(JSON.stringify({ event: 'ticket_email_delivery_exhausted', deliveryId: candidate.id }))
    }
  }
}
