import { PaymentProviderUnavailableError } from './paymentErrors.js'
import { RajaOngkirQrislyProvider } from './rajaongkir.js'

export type PaymentOrder = {
  orderNumber: string
  amount: number
  email: string
}

export type PaymentSession = {
  provider: string
  providerPaymentId: string
  qrCodeUrl: string | null
  qrCodeContent: string | null
  expiresAt: Date
}

export interface PaymentProvider {
  createPaymentSession(order: PaymentOrder): Promise<PaymentSession>
}

export { PaymentProviderUnavailableError }

export function paymentProvider(expectedProvider?: string): RajaOngkirQrislyProvider {
  const provider = process.env.CHECKOUT_PAYMENT_PROVIDER || 'disabled'
  if (expectedProvider && expectedProvider !== provider) throw new PaymentProviderUnavailableError('Configured payment provider does not match this order')
  if (provider !== 'rajaongkir') throw new PaymentProviderUnavailableError(`Payment provider "${provider}" is not configured for Fluxora.`)
  const apiKey = process.env.RAJAONGKIR_QRIS_API_KEY?.trim()
  const qrisId = process.env.RAJAONGKIR_QRIS_ID?.trim()
  if (!apiKey || !qrisId) throw new PaymentProviderUnavailableError('RajaOngkir QRIS credentials are not configured')
  return new RajaOngkirQrislyProvider(apiKey, qrisId)
}
