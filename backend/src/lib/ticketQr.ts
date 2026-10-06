import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { PaymentProviderUnavailableError } from './paymentErrors.js'

function signingSecret() {
  const secret = process.env.TICKET_QR_SIGNING_SECRET || ''
  if (Buffer.byteLength(secret) < 32) throw new PaymentProviderUnavailableError('Ticket QR signing secret must contain at least 32 bytes')
  return secret
}

export function assertTicketQrConfiguration() {
  signingSecret()
}

export function newPublicTicketId() {
  return randomUUID()
}

export function ticketQrToken(publicId: string) {
  const body = `v1.${publicId}`
  const signature = createHmac('sha256', signingSecret()).update(body).digest('hex')
  return `${body}.${signature}`
}

export function ticketQrTokenHash(publicId: string) {
  return createHash('sha256').update(ticketQrToken(publicId)).digest('hex')
}

export function verifyTicketQrToken(token: string) {
  const match = /^v1\.([0-9a-f-]{36})\.([0-9a-f]{64})$/i.exec(token)
  if (!match) return null
  const expected = Buffer.from(createHmac('sha256', signingSecret()).update(`v1.${match[1]}`).digest('hex'), 'hex')
  const received = Buffer.from(match[2] || '', 'hex')
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
  return { publicId: match[1]!, tokenHash: createHash('sha256').update(token).digest('hex') }
}
