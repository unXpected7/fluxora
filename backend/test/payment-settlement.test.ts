import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldSkipRecentPaymentStatusCheck } from '../src/lib/paymentSettlement.js'

describe('payment status polling cache', () => {
  it('skips repeated unpaid status checks but lets callbacks force reconciliation', () => {
    const updatedAt = new Date(100_000)
    assert.equal(shouldSkipRecentPaymentStatusCheck('PENDING', 'unpaid', updatedAt, 110_000), true)
    assert.equal(shouldSkipRecentPaymentStatusCheck('PENDING', 'unpaid', updatedAt, 110_000, true), false)
    assert.equal(shouldSkipRecentPaymentStatusCheck('PENDING', 'status_unavailable', updatedAt, 110_000, true), false)
    assert.equal(shouldSkipRecentPaymentStatusCheck('PENDING', 'unpaid', updatedAt, 131_000), false)
    assert.equal(shouldSkipRecentPaymentStatusCheck('PAID', 'unpaid', updatedAt, 110_000), false)
  })
})
