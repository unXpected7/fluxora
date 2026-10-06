import 'dotenv/config'

function requiredPort(value: string | undefined) {
  const port = Number(value || 4000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port')
  return port
}

function clientOrigins(value: string | undefined) {
  return (value || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: requiredPort(process.env.PORT),
  clientOrigins: clientOrigins(process.env.CLIENT_ORIGIN),
  paymentProvider: process.env.CHECKOUT_PAYMENT_PROVIDER || 'disabled',
}
