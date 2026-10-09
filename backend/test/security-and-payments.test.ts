import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { afterEach, describe, it } from 'node:test'
import { RajaOngkirQrislyProvider } from '../src/lib/rajaongkir.js'
import { validateWebhookUrl } from '../src/lib/partnerWebhooks.js'
import { ticketQrToken, verifyTicketQrToken } from '../src/lib/ticketQr.js'

const originalFetch = globalThis.fetch
const originalSecret = process.env.TICKET_QR_SIGNING_SECRET
const originalApiBase = process.env.RAJAONGKIR_API_BASE_URL

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalSecret === undefined) delete process.env.TICKET_QR_SIGNING_SECRET
  else process.env.TICKET_QR_SIGNING_SECRET = originalSecret
  if (originalApiBase === undefined) delete process.env.RAJAONGKIR_API_BASE_URL
  else process.env.RAJAONGKIR_API_BASE_URL = originalApiBase
})

describe('ticket QR signatures', () => {
  it('accepts an untampered signed ticket and rejects tampering', () => {
    process.env.TICKET_QR_SIGNING_SECRET = 'test-only-secret-with-at-least-32-bytes'
    const id = 'c7c738ac-4c10-4b15-a7e4-8c9ed01b772c'
    const token = ticketQrToken(id)
    assert.deepEqual(verifyTicketQrToken(token), { publicId: id, tokenHash: createHash('sha256').update(token).digest('hex') })
    assert.equal(verifyTicketQrToken(`${token.slice(0, -1)}0`), null)
    assert.equal(verifyTicketQrToken('not-a-ticket-token'), null)
  })
})

describe('partner webhook URL validation', () => {
  it('allows a public HTTPS IP and rejects private or non-HTTPS destinations', async () => {
    assert.equal((await validateWebhookUrl('https://8.8.8.8/hooks')).address, '8.8.8.8')
    await assert.rejects(validateWebhookUrl('https://127.0.0.1/hooks'), /public IP/)
    await assert.rejects(validateWebhookUrl('http://8.8.8.8/hooks'), /HTTPS/)
    await assert.rejects(validateWebhookUrl('https://user:pass@8.8.8.8/hooks'), /HTTPS/)
  })
})

describe('RajaOngkir QRISLY adapter', () => {
  it('accepts an exact-amount unpaid session and returns a normalized session', async () => {
    process.env.RAJAONGKIR_API_BASE_URL = 'https://api-sandbox.collaborator.komerce.id/user'
    globalThis.fetch = async () => new Response(JSON.stringify({
      success: true,
      data: { history_id: 12345, qris_string: '0002010102', original_amount: 25000, final_amount: 25000, payment_status: 'unpaid', expiry_time: '2026-10-10 12:00:00' },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
    const result = await new RajaOngkirQrislyProvider('test-key', '123').createPaymentSession({ id: 'order-1', amount: 25000, currency: 'IDR' })
    assert.equal(result.providerPaymentId, '12345')
    assert.equal(result.qrCodeContent, '0002010102')
    assert.equal(result.provider, 'rajaongkir')
    assert.equal(result.expiresAt.toISOString(), '2026-10-10T05:00:00.000Z')
  })

  it('rejects wrong-amount sessions and unsupported API origins', async () => {
    process.env.RAJAONGKIR_API_BASE_URL = 'https://api-sandbox.collaborator.komerce.id/user'
    globalThis.fetch = async () => new Response(JSON.stringify({
      success: true,
      data: { history_id: 12345, qris_string: '0002010102', original_amount: 25001, final_amount: 25001, payment_status: 'unpaid', expiry_time: '2026-10-10 12:00:00' },
    }), { status: 200 })
    await assert.rejects(new RajaOngkirQrislyProvider('test-key', '123').createPaymentSession({ id: 'order-1', amount: 25000, currency: 'IDR' }), /unexpected amount/)
    process.env.RAJAONGKIR_API_BASE_URL = 'https://attacker.example/user'
    await assert.rejects(new RajaOngkirQrislyProvider('test-key', '123').createPaymentSession({ id: 'order-1', amount: 25000, currency: 'IDR' }), /approved HTTPS endpoint/)
  })
})
