import { Router } from 'express'
import { reconcileRajaOngkirPayment } from '../lib/paymentSettlement.js'
import { PaymentProviderUnavailableError } from '../lib/paymentErrors.js'

export const webhooksRouter = Router()

const recentRequests = new Map<string, number[]>()
function limitWebhook(request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) {
  const now = Date.now()
  const key = request.ip || 'unknown'
  const hits = (recentRequests.get(key) || []).filter(timestamp => timestamp > now - 60_000)
  if (hits.length >= 30) {
    response.status(429).json({ message: 'Too many payment notifications' })
    return
  }
  hits.push(now)
  recentRequests.set(key, hits)
  next()
}

webhooksRouter.post('/rajaongkir', limitWebhook, async (request, response, next) => {
  try {
    if (!Buffer.isBuffer(request.body)) {
      response.status(400).json({ message: 'Expected a JSON callback body' })
      return
    }
    let notification: unknown
    try { notification = JSON.parse(request.body.toString('utf8')) } catch {
      response.status(400).json({ message: 'Invalid callback JSON' })
      return
    }
    if (!notification || typeof notification !== 'object') {
      response.status(400).json({ message: 'Invalid callback payload' })
      return
    }
    const event = notification as Record<string, unknown>
    if (!['payment.success', 'payment.expired'].includes(String(event.event))) {
      response.status(200).json({ success: true, message: 'Notification ignored' })
      return
    }
    const data = event.data
    if (!data || typeof data !== 'object') {
      response.status(400).json({ message: 'Invalid callback data' })
      return
    }
    const detail = data as Record<string, unknown>
    const historyId = String(detail.qris_history_id ?? detail.history_id ?? '')
    if (!/^\d+$/.test(historyId)) {
      console.error(JSON.stringify({ event: 'payment_callback_unmatched_identifier', identifierFormat: 'unsupported' }))
      response.status(200).json({ success: true, message: 'Notification acknowledged for status polling' })
      return
    }

    // The QRISLY callback only prompts reconciliation. The authenticated status
    // API, not callback fields, is the authority for amount and paid state.
    const outcome = await reconcileRajaOngkirPayment(historyId, true)
    if (outcome === 'amount_mismatch' || outcome === 'refund_pending') {
      console.error(JSON.stringify({ event: 'payment_reconciliation_review', providerPaymentId: historyId, outcome }))
    }
    response.status(200).json({ success: true, message: 'Notification received', outcome })
  } catch (error) {
    if (error instanceof PaymentProviderUnavailableError) {
      response.status(503).json({ message: 'Payment status could not be verified' })
      return
    }
    next(error)
  }
})
