import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { PrismaClient } from '@prisma/client'

const enabled = process.env.RUN_TENANT_BACKFILL_INTEGRATION_TESTS === '1'
const preTenantMigrations = [
  '20261005100000_initial',
  '20261005120000_staff_checkin',
  '20261005140000_admin_catalog',
  '20261005160000_ticket_delivery_outbox',
]

test('tenant migrations backfill legacy event, staff, quote, and sales records', { skip: !enabled }, async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required')
  const schemaName = `fluxora_legacy_${randomUUID().replaceAll('-', '')}`
  const databaseUrl = new URL(process.env.DATABASE_URL)
  const originalSchema = databaseUrl.searchParams.get('schema') ?? 'public'
  databaseUrl.searchParams.set('schema', schemaName)
  const scopedDatabaseUrl = databaseUrl.toString()
  const cli = resolve('node_modules/prisma/build/index.js')
  const tempRoot = mkdtempSync(join(tmpdir(), 'fluxora-tenant-backfill-'))
  const migrationRoot = join(tempRoot, 'migrations')
  const preTenantSchema = join(tempRoot, 'schema.prisma')
  const prismaRoot = resolve('prisma')
  const managerUrl = new URL(process.env.DATABASE_URL)
  managerUrl.searchParams.set('schema', originalSchema)
  const manager = new PrismaClient({ datasources: { db: { url: managerUrl.toString() } } })

  try {
    await manager.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`)
    mkdirSync(migrationRoot, { recursive: true })
    copyFileSync(join(prismaRoot, 'schema.prisma'), preTenantSchema)
    copyFileSync(join(prismaRoot, 'migrations', 'migration_lock.toml'), join(migrationRoot, 'migration_lock.toml'))
    for (const migration of preTenantMigrations) cpSync(join(prismaRoot, 'migrations', migration), join(migrationRoot, migration), { recursive: true })

    function deployMigrations(schemaPath: string) {
      execFileSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schemaPath], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: scopedDatabaseUrl },
        stdio: 'pipe',
      })
    }

    deployMigrations(preTenantSchema)
    const legacy = new PrismaClient({ datasources: { db: { url: scopedDatabaseUrl } } })
    try {
      const inserts = [
        `INSERT INTO "Event" ("id", "slug", "title", "venueName", "city", "startsAt", "endsAt", "status", "updatedAt") VALUES ('legacy_event', 'legacy-event', 'Legacy Sales Event', 'Legacy Hall', 'Jakarta', NOW() + interval '10 days', NOW() + interval '10 days 4 hours', 'PUBLISHED', NOW())`,
        `INSERT INTO "Performance" ("id", "eventId", "name", "startsAt", "endsAt", "status", "updatedAt") VALUES ('legacy_performance', 'legacy_event', 'Legacy performance', NOW() + interval '10 days', NOW() + interval '10 days 4 hours', 'ON_SALE', NOW())`,
        `INSERT INTO "TicketType" ("id", "performanceId", "code", "name", "price", "capacity", "updatedAt") VALUES ('legacy_ticket_type', 'legacy_performance', 'REG', 'Legacy regular', 50000, 100, NOW())`,
        `INSERT INTO "CheckoutQuote" ("id", "accessTokenHash", "email", "subtotal", "total", "paymentProvider", "expiresAt") VALUES ('legacy_quote', 'legacy_quote_hash', 'legacy-buyer@example.test', 50000, 50000, 'disabled', NOW() + interval '1 hour')`,
        `INSERT INTO "Order" ("id", "orderNumber", "checkoutQuoteId", "idempotencyKey", "email", "subtotal", "total", "updatedAt") VALUES ('legacy_order', 'LEGACY-ORDER-1', 'legacy_quote', 'legacy-idempotency-1', 'legacy-buyer@example.test', 50000, 50000, NOW())`,
        `INSERT INTO "OrderItem" ("id", "orderId", "ticketTypeId", "itemType", "nameSnapshot", "unitPrice", "quantity", "admissionsPerUnit") VALUES ('legacy_order_item', 'legacy_order', 'legacy_ticket_type', 'TICKET', 'Legacy regular', 50000, 1, 1)`,
        `INSERT INTO "Ticket" ("id", "publicId", "qrTokenHash", "orderId", "orderItemId", "eventId", "performanceId", "ticketTypeId") VALUES ('legacy_ticket', 'LEGACY-TICKET-1', 'legacy_qr_hash', 'legacy_order', 'legacy_order_item', 'legacy_event', 'legacy_performance', 'legacy_ticket_type')`,
        `INSERT INTO "StaffUser" ("id", "email", "passwordHash", "role", "updatedAt") VALUES ('legacy_staff_admin', 'legacy-admin@example.test', 'test-only-hash', 'ADMIN', NOW()), ('legacy_staff_gate', 'legacy-gate@example.test', 'test-only-hash', 'GATE', NOW())`,
      ]
      for (const sql of inserts) await legacy.$executeRawUnsafe(sql)
    } finally {
      await legacy.$disconnect()
    }

    deployMigrations(resolve('prisma/schema.prisma'))

    const migrated = new PrismaClient({ datasources: { db: { url: scopedDatabaseUrl } } })
    try {
      const rows = await migrated.$queryRaw<Array<{
        eventPartner: string
        quotePartner: string
        adminMembership: number
        gateMembership: number
        unintendedSuperAdmins: number
        ordersWithoutEventItems: number
        orderCount: number
        ticketCount: number
        migrationCount: number
      }>>`
        SELECT
          (SELECT "partnerId" FROM "Event" WHERE id = 'legacy_event') AS "eventPartner",
          (SELECT "partnerId" FROM "CheckoutQuote" WHERE id = 'legacy_quote') AS "quotePartner",
          (SELECT count(*)::int FROM "PartnerMembership" WHERE "staffId" = 'legacy_staff_admin' AND role = 'ADMIN') AS "adminMembership",
          (SELECT count(*)::int FROM "PartnerMembership" WHERE "staffId" = 'legacy_staff_gate' AND role = 'GATE') AS "gateMembership",
          (SELECT count(*)::int FROM "StaffUser" WHERE id IN ('legacy_staff_admin', 'legacy_staff_gate') AND "platformRole" <> 'NONE') AS "unintendedSuperAdmins",
          (SELECT count(*)::int FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "OrderItem" oi LEFT JOIN "TicketType" tt ON tt.id=oi."ticketTypeId" LEFT JOIN "Performance" p ON p.id=tt."performanceId" LEFT JOIN "Bundle" b ON b.id=oi."bundleId" WHERE oi."orderId"=o.id AND (p."eventId" IS NOT NULL OR b."eventId" IS NOT NULL))) AS "ordersWithoutEventItems",
          (SELECT count(*)::int FROM "Order" WHERE id = 'legacy_order') AS "orderCount",
          (SELECT count(*)::int FROM "Ticket" WHERE id = 'legacy_ticket') AS "ticketCount",
          (SELECT count(*)::int FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) AS "migrationCount"
      `
      assert.deepEqual(rows[0], {
        eventPartner: 'partner_fluxora',
        quotePartner: 'partner_fluxora',
        adminMembership: 1,
        gateMembership: 1,
        unintendedSuperAdmins: 0,
        ordersWithoutEventItems: 0,
        orderCount: 1,
        ticketCount: 1,
        migrationCount: 12,
      })
    } finally {
      await migrated.$disconnect()
    }
  } finally {
    await manager.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await manager.$disconnect()
    rmSync(tempRoot, { recursive: true, force: true })
  }
})
