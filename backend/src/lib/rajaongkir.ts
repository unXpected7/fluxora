import type { PaymentOrder, PaymentProvider, PaymentSession } from './paymentProvider.js'
import { PaymentProviderUnavailableError, PaymentSessionIndeterminateError } from './paymentErrors.js'

type QrisGenerationResponse = {
  success?: boolean
  message?: string
  data?: {
    history_id?: string | number
    qris_string?: string
    original_amount?: number
    final_amount?: number
    payment_status?: string
    expiry_time?: string
  }
}

export type QrisPaymentStatus = {
  historyId: string
  status: 'unpaid' | 'paid' | 'expired' | 'cancelled'
  amount: number
  paidAt: Date | null
}

function apiBaseUrl() {
  const configured = process.env.RAJAONGKIR_API_BASE_URL?.trim()
  const base = configured || (process.env.NODE_ENV === 'production'
    ? 'https://api.collaborator.komerce.id/user'
    : 'https://api-sandbox.collaborator.komerce.id/user')
  let url: URL
  try { url = new URL(base) } catch { throw new PaymentProviderUnavailableError('RajaOngkir API base URL is invalid') }
  if (url.protocol !== 'https:' || !['api.collaborator.komerce.id', 'api-sandbox.collaborator.komerce.id'].includes(url.hostname) || url.search || url.hash) {
    throw new PaymentProviderUnavailableError('RajaOngkir API base URL must use an approved HTTPS endpoint')
  }
  return url.toString().replace(/\/$/, '')
}

function qrisIdValue(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value
}

function parseProviderDate(value: string | undefined) {
  if (!value) throw new PaymentSessionIndeterminateError('RajaOngkir QRIS response omitted expiry; retry is delayed to avoid duplicate generation')
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}+07:00`
  const result = new Date(normalized)
  if (!Number.isFinite(result.getTime())) throw new PaymentSessionIndeterminateError('RajaOngkir QRIS response had invalid expiry; retry is delayed to avoid duplicate generation')
  return result
}

async function apiRequest(path: string, apiKey: string, init: RequestInit = {}) {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(12_000),
      headers: { 'x-api-key': apiKey, accept: 'application/json', ...init.headers },
    })
  } catch {
    if (path.endsWith('/generate-qris')) throw new PaymentSessionIndeterminateError('RajaOngkir QRIS session result is unknown; retry is delayed to avoid creating a duplicate QRIS')
    throw new PaymentProviderUnavailableError('Could not reach the RajaOngkir QRIS status service')
  }
  let body: unknown
  try { body = await response.json() } catch {
    if (path.endsWith('/generate-qris')) throw new PaymentSessionIndeterminateError('RajaOngkir QRIS session response is unreadable; retry is delayed to avoid creating a duplicate QRIS')
    throw new PaymentProviderUnavailableError('RajaOngkir returned an invalid response')
  }
  if (response.status >= 500 && path.endsWith('/generate-qris')) throw new PaymentSessionIndeterminateError(`RajaOngkir QRIS session result is unknown (HTTP ${response.status}); retry is delayed to avoid duplicate generation`)
  if (!response.ok) throw new PaymentProviderUnavailableError(`RajaOngkir QRIS request failed with HTTP ${response.status}`)
  return body
}

export class RajaOngkirQrislyProvider implements PaymentProvider {
  constructor(private readonly apiKey: string, private readonly qrisId: string) {}

  async createPaymentSession(order: PaymentOrder): Promise<PaymentSession> {
    if (!Number.isSafeInteger(order.amount) || order.amount < 1_000 || order.amount > 100_000_000) {
      throw new PaymentProviderUnavailableError('QRIS payments require an order total between Rp1,000 and Rp100,000,000')
    }
    const response = await apiRequest('/api/v1/qrisly/generate-qris', this.apiKey, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qris_id: qrisIdValue(this.qrisId), amount: order.amount, output_type: 'string', unique_amount: false }),
    }) as QrisGenerationResponse
    const data = response?.data
    if (!response?.success || !data || (typeof data.history_id !== 'number' && typeof data.history_id !== 'string') || !data.qris_string) {
      throw new PaymentProviderUnavailableError(response?.message || 'RajaOngkir could not create a QRIS payment')
    }
    if (data.original_amount !== order.amount || data.final_amount !== order.amount || data.payment_status !== 'unpaid') {
      throw new PaymentSessionIndeterminateError('RajaOngkir created a QRIS with an unexpected amount or payment state; this order needs reconciliation')
    }
    return {
      provider: 'rajaongkir',
      providerPaymentId: String(data.history_id),
      qrCodeUrl: null,
      qrCodeContent: data.qris_string,
      expiresAt: parseProviderDate(data.expiry_time),
    }
  }

  async getPaymentStatus(historyId: string): Promise<QrisPaymentStatus> {
    if (!/^\d+$/.test(historyId)) throw new PaymentProviderUnavailableError('RajaOngkir payment history ID is invalid')
    const response = await apiRequest(`/api/v1/qrisly/payment-status/${encodeURIComponent(historyId)}`, this.apiKey) as {
      meta?: { status?: string }
      data?: { history_id?: number | string; payment_status?: string; amount?: number; paid_at?: string | null }
    }
    const data = response?.data
    if (response?.meta?.status !== 'success' || !data || String(data.history_id) !== historyId || !['unpaid', 'paid', 'expired', 'cancelled'].includes(data.payment_status || '') || !Number.isSafeInteger(data.amount)) {
      throw new PaymentProviderUnavailableError('RajaOngkir returned an invalid payment status response')
    }
    return {
      historyId,
      status: data.payment_status as QrisPaymentStatus['status'],
      amount: data.amount as number,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
    }
  }
}
