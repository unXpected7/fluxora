import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Prisma } from '@prisma/client'
import { isTransactionConflictError } from '../src/lib/prismaErrors.js'

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('database test error', { code, clientVersion: 'test', meta })
}

describe('database transaction conflict detection', () => {
  it('recognizes Prisma transaction conflicts and PostgreSQL serialization/deadlock errors', () => {
    assert.equal(isTransactionConflictError(knownError('P2034')), true)
    assert.equal(isTransactionConflictError(knownError('P2010', { code: '40001' })), true)
    assert.equal(isTransactionConflictError(knownError('P2010', { code: '40P01' })), true)
  })

  it('does not classify unrelated database errors as inventory conflicts', () => {
    assert.equal(isTransactionConflictError(knownError('P2010', { code: '23505' })), false)
    assert.equal(isTransactionConflictError(knownError('P2002')), false)
    assert.equal(isTransactionConflictError(new Error('not a Prisma error')), false)
  })
})
