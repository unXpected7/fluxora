import { Prisma } from '@prisma/client'

const postgresTransactionConflictCodes = new Set(['40001', '40P01'])

export function isTransactionConflictError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === 'P2034') return true
  if (error.code !== 'P2010') return false
  const databaseCode = error.meta?.code
  return typeof databaseCode === 'string' && postgresTransactionConflictCodes.has(databaseCode)
}
