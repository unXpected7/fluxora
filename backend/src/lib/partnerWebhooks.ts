import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

const supportedEvents = [
  'checkout.order_created', 'payment.verified', 'tickets.issued', 'payment.late_paid_manual_review',
  'payment.expired', 'payment.cancelled', 'payment.refund_confirmed_manually', 'checkout.reservation_expired',
]
const retryLimit = 12
const staleClaimMs = 30_000

export { supportedEvents }

function encryptionKey() {
  const encoded = process.env.PARTNER_WEBHOOK_ENCRYPTION_KEY || ''
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('PARTNER_WEBHOOK_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  return key
}

export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`
}

function decryptWebhookSecret(value: string) {
  const [ivText, tagText, ciphertextText] = value.split('.')
  if (!ivText || !tagText || !ciphertextText) throw new Error('Encrypted webhook secret is invalid')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8')
}

export async function validateWebhookUrl(value: string) {
  let target: URL
  try { target = new URL(value) } catch { throw new Error('Webhook URL must be a valid HTTPS URL') }
  if (target.protocol !== 'https:' || target.username || target.password || target.port && target.port !== '443' || target.hostname === 'localhost' || target.hostname.endsWith('.localhost') || target.hostname.endsWith('.local')) {
    throw new Error('Webhook URL must use HTTPS on the standard port and cannot include credentials or a local hostname')
  }
  const addresses = isIP(target.hostname) ? [{ address: target.hostname }] : await lookup(target.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Webhook URL must resolve only to public IP addresses')
  return { target, address: addresses[0]!.address, family: isIP(addresses[0]!.address) }
}

function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number)
    const [a, b] = octets
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && (b === 0 || b === 2 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0))
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    const first = Number.parseInt(normalized.split(':')[0] || '0', 16)
    return first >= 0x2000 && first <= 0x3fff && !normalized.startsWith('2001:db8:')
  }
  return false
}

export async function enqueuePartnerWebhook(transaction: Prisma.TransactionClient, input: { partnerId: string; eventType: string; sourceEventId: string; payload: Prisma.InputJsonValue }) {
  const endpoints = await transaction.partnerWebhook.findMany({ where: { partnerId: input.partnerId, active: true, eventTypes: { has: input.eventType } }, select: { id: true } })
  if (!endpoints.length) return
  await transaction.partnerWebhookDelivery.createMany({
    data: endpoints.map(endpoint => ({ webhookId: endpoint.id, sourceEventId: input.sourceEventId, eventType: input.eventType, payload: input.payload })),
    skipDuplicates: true,
  })
}

function deliver(url: URL, address: string, family: number, body: string, headers: Record<string, string>) {
  return new Promise<number>((resolve, reject) => {
    const outgoing = httpsRequest(url, {
      method: 'POST', headers, timeout: 8_000,
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, incoming => {
      let received = 0
      incoming.on('data', chunk => {
        received += Buffer.byteLength(chunk)
        if (received > 8192) incoming.destroy(new Error('response_too_large'))
      })
      incoming.on('end', () => resolve(incoming.statusCode ?? 0))
      incoming.on('error', reject)
    })
    outgoing.on('timeout', () => outgoing.destroy(new Error('timeout')))
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

export async function processPartnerWebhookDeliveries(batchSize = 20) {
  const now = new Date()
  const candidates = await prisma.partnerWebhookDelivery.findMany({
    where: { status: { in: ['PENDING', 'SENDING'] }, nextAttemptAt: { lte: now }, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - staleClaimMs) } }] },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }], take: batchSize,
    include: { webhook: true },
  })
  for (const candidate of candidates) {
    if (!candidate.webhook.active) {
      await prisma.partnerWebhookDelivery.updateMany({ where: { id: candidate.id, status: { in: ['PENDING', 'SENDING'] } }, data: { status: 'FAILED', claimedAt: null, lastError: 'endpoint_disabled' } })
      continue
    }
    const claimTime = new Date()
    const claim = await prisma.partnerWebhookDelivery.updateMany({
      where: { id: candidate.id, status: { in: ['PENDING', 'SENDING'] }, nextAttemptAt: { lte: claimTime }, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(claimTime.getTime() - staleClaimMs) } }] },
      data: { status: 'SENDING', claimedAt: claimTime, attempts: { increment: 1 } },
    })
    if (claim.count !== 1) continue
    let statusCode: number | null = null
    let errorCode: string | null = null
    try {
      const { target, address, family } = await validateWebhookUrl(candidate.webhook.url)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const event = { id: candidate.id, type: candidate.eventType, createdAt: candidate.createdAt.toISOString(), data: candidate.payload }
      const body = JSON.stringify(event)
      const secret = decryptWebhookSecret(candidate.webhook.encryptedSecret)
      const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
      statusCode = await deliver(target, address, family, body, {
        'content-type': 'application/json',
        'user-agent': 'Fluxora-Webhooks/1.0',
        'x-fluxora-event': candidate.eventType,
        'x-fluxora-delivery': candidate.id,
        'x-fluxora-timestamp': timestamp,
        'x-fluxora-key-version': String(candidate.webhook.signingKeyVersion),
        'x-fluxora-signature': `t=${timestamp},v1=${signature}`,
      })
      if (statusCode < 200 || statusCode >= 300) errorCode = `http_${statusCode}`
    } catch (error) {
      errorCode = error instanceof Error ? error.message.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) : 'delivery_error'
    }
    const delivered = statusCode !== null && statusCode >= 200 && statusCode < 300 && !errorCode
    const exhausted = candidate.attempts + 1 >= retryLimit
    const delaySeconds = Math.min(3600, 15 * (2 ** Math.min(candidate.attempts, 8)))
    await prisma.partnerWebhookDelivery.update({
      where: { id: candidate.id },
      data: {
        status: delivered ? 'DELIVERED' : exhausted ? 'FAILED' : 'PENDING',
        deliveredAt: delivered ? new Date() : null,
        lastStatusCode: statusCode,
        lastError: delivered ? null : errorCode || 'delivery_error',
        claimedAt: null,
        nextAttemptAt: delivered || exhausted ? claimTime : new Date(claimTime.getTime() + delaySeconds * 1000),
      },
    })
  }
}
