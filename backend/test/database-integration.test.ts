import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PrismaClient } from '@prisma/client'

test('fresh migrated database exposes the repeatable ticket catalogue seed', { skip: process.env.RUN_DATABASE_INTEGRATION_TESTS !== '1' }, async () => {
  const prisma = new PrismaClient()

  try {
    const migrationRows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `
    assert.ok(migrationRows.length >= 12, 'all ticketing schema migrations should be applied')

    const events = await prisma.event.findMany({
      where: { slug: 'fluxora-demo-live' },
      include: { performances: { include: { ticketTypes: true } }, bundles: true },
    })
    assert.equal(events.length, 1, 'running the seed twice must not duplicate the demo event')
    assert.deepEqual(events[0]?.performances[0]?.ticketTypes.map(ticketType => ticketType.code).sort(), ['REG', 'VIP'])
    assert.equal(events[0]?.bundles.filter(bundle => bundle.code === 'DUO').length, 1)
  } finally {
    await prisma.$disconnect()
  }
})
