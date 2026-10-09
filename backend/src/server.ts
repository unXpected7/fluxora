import cors from 'cors'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { config } from './lib/config.js'
import { PaymentProviderUnavailableError } from './lib/paymentProvider.js'
import { prisma } from './lib/prisma.js'
import { CheckoutConflictError, CheckoutInputError, checkoutRouter } from './routes/checkout.js'
import { eventsRouter } from './routes/events.js'
import { releaseExpiredReservations } from './lib/inventoryReservations.js'
import { webhooksRouter } from './routes/webhooks.js'
import { staffRouter } from './routes/staff.js'
import { processTicketDeliveries } from './lib/ticketDelivery.js'
import { partnerApiRouter } from './routes/partnerApi.js'
import { processPartnerWebhookDeliveries } from './lib/partnerWebhooks.js'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((request, response, next) => {
  const requestId = request.header('x-request-id')?.slice(0, 100) || randomUUID()
  response.setHeader('x-request-id', requestId)
  response.locals.requestId = requestId
  next()
})
app.use(cors({ origin: config.clientOrigins, credentials: true }))
app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '64kb' }), webhooksRouter)
app.use(express.json({ limit: '64kb' }))

app.get('/healthz', (_request, response) => response.json({ status: 'ok' }))
app.get('/readyz', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    response.json({ status: 'ready' })
  } catch {
    response.status(503).json({ status: 'unavailable' })
  }
})
app.use('/api/events', eventsRouter)
app.use('/api/v1', partnerApiRouter)
app.use('/api/checkout', checkoutRouter)
app.use('/api/staff', staffRouter)

app.use((request, response) => response.status(404).json({ message: 'Route not found', requestId: response.locals.requestId }))
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError'
  console.error(JSON.stringify({ event: 'request_error', requestId: response.locals.requestId, errorName }))
  if (error instanceof CheckoutInputError) {
    response.status(400).json({ message: error.message })
    return
  }
  if (error instanceof CheckoutConflictError) {
    response.status(409).json({ message: error.message })
    return
  }
  if (error instanceof PaymentProviderUnavailableError) {
    response.status(503).json({ message: 'QRIS checkout is not available yet.' })
    return
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    response.status(409).json({ message: 'Inventory changed during checkout. Refresh availability and retry.' })
    return
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    response.status(409).json({ message: 'A record with one of these unique values already exists.' })
    return
  }
  response.status(500).json({ message: 'Unexpected server error', requestId: response.locals.requestId })
})

if (config.nodeEnv !== 'test') {
  const server = app.listen(config.port, () => console.log(`Fluxora ticketing API listening on port ${config.port}`))
  const reservationWorker = setInterval(() => {
    void releaseExpiredReservations().catch(error => console.error(JSON.stringify({ event: 'reservation_expiry_failed', errorName: error instanceof Error ? error.name : 'UnknownError' })))
  }, 10_000)
  reservationWorker.unref()
  const ticketDeliveryWorker = setInterval(() => {
    void processTicketDeliveries().catch(error => console.error(JSON.stringify({ event: 'ticket_delivery_worker_failed', errorName: error instanceof Error ? error.name : 'UnknownError' })))
  }, 15_000)
  ticketDeliveryWorker.unref()
  const partnerWebhookWorker = setInterval(() => {
    void processPartnerWebhookDeliveries().catch(error => console.error(JSON.stringify({ event: 'partner_webhook_delivery_failed', errorName: error instanceof Error ? error.name : 'UnknownError' })))
  }, 5_000)
  partnerWebhookWorker.unref()
  const shutdown = () => { clearInterval(reservationWorker); clearInterval(ticketDeliveryWorker); clearInterval(partnerWebhookWorker); server.close(() => void prisma.$disconnect()) }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

export { app }
