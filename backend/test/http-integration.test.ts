import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { hashStaffPassword } from '../src/lib/staffAuth.js'

test('fresh database serves catalogue and enforces staff portal origins over HTTP', { skip: process.env.RUN_DATABASE_INTEGRATION_TESTS !== '1' }, async () => {
  const [{ app }, { prisma }] = await Promise.all([
    import('../src/server.js'),
    import('../src/lib/prisma.js'),
  ])
  const server = app.listen(0, '127.0.0.1')

  try {
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`

    const health = await fetch(`${baseUrl}/healthz`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok' })

    const readiness = await fetch(`${baseUrl}/readyz`)
    assert.equal(readiness.status, 200)
    assert.deepEqual(await readiness.json(), { status: 'ready' })

    const catalogue = await fetch(`${baseUrl}/api/events`)
    assert.equal(catalogue.status, 200)
    const eventList = await catalogue.json() as { items: { slug: string }[] }
    assert.ok(eventList.items.some(event => event.slug === 'fluxora-demo-live'))

    const staffSession = await fetch(`${baseUrl}/api/staff/auth/session`, { headers: { Origin: 'https://admin-eticket.fluxorastudio.id' } })
    assert.equal(staffSession.status, 200)
    assert.deepEqual(await staffSession.json(), { staff: null })
    assert.equal(staffSession.headers.get('access-control-allow-origin'), 'https://admin-eticket.fluxorastudio.id')

    const customerStaffSession = await fetch(`${baseUrl}/api/staff/auth/session`, { headers: { Origin: 'https://e-ticket.fluxorastudio.id' } })
    assert.equal(customerStaffSession.status, 403)
    assert.deepEqual(await customerStaffSession.json(), { message: 'Origin is not allowed' })

    const suffix = randomUUID()
    const superAdminEmail = `contract-superadmin-${suffix}@example.test`
    const partnerEmail = `contract-owner-${suffix}@example.test`
    let superAdminId: string | undefined
    let partnerStaffId: string | undefined
    let partnerId: string | undefined
    let otherPartnerId: string | undefined
    try {
      const password = 'integration-test-only-password'
      const partner = await prisma.partner.create({ data: { slug: `contract-${suffix}`, name: 'Contract Test Partner', status: 'ACTIVE' } })
      partnerId = partner.id
      const otherPartner = await prisma.partner.create({ data: { slug: `contract-other-${suffix}`, name: 'Other Contract Partner', status: 'ACTIVE' } })
      otherPartnerId = otherPartner.id
      const [superAdmin, partnerStaff] = await Promise.all([
        prisma.staffUser.create({ data: { email: superAdminEmail, passwordHash: await hashStaffPassword(password), role: 'ADMIN', platformRole: 'SUPERADMIN' } }),
        prisma.staffUser.create({ data: { email: partnerEmail, passwordHash: await hashStaffPassword(password), role: 'ADMIN' } }),
      ])
      superAdminId = superAdmin.id
      partnerStaffId = partnerStaff.id
      await prisma.partnerMembership.create({ data: { staffId: partnerStaff.id, partnerId: partner.id, role: 'OWNER' } })

      async function login(email: string) {
        const response = await fetch(`${baseUrl}/api/staff/auth/login`, {
          method: 'POST',
          headers: { Origin: 'https://admin-eticket.fluxorastudio.id', 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        assert.equal(response.status, 200)
        const cookie = response.headers.get('set-cookie')?.split(';')[0]
        assert.ok(cookie?.startsWith('fluxora_staff='))
        return cookie
      }

      const superAdminCookie = await login(superAdminEmail)
      const partnerCookie = await login(partnerEmail)
      const authHeaders = (cookie: string) => ({ Origin: 'https://admin-eticket.fluxorastudio.id', Cookie: cookie })

      const unauthenticatedQueues = await fetch(`${baseUrl}/api/staff/admin/operations/queues`, { headers: { Origin: 'https://admin-eticket.fluxorastudio.id' } })
      assert.equal(unauthenticatedQueues.status, 401)

      const quotaReport = await fetch(`${baseUrl}/api/staff/admin/api-usage`, { headers: authHeaders(superAdminCookie!) })
      assert.equal(quotaReport.status, 200)
      const quotaBody = await quotaReport.json() as { items: unknown[]; total: number; windowMinutes: number; retainedWindowHours: number }
      assert.ok(Array.isArray(quotaBody.items))
      assert.equal(quotaBody.windowMinutes, 60)
      assert.equal(quotaBody.retainedWindowHours, 24)

      const queues = await fetch(`${baseUrl}/api/staff/admin/operations/queues`, { headers: authHeaders(superAdminCookie!) })
      assert.equal(queues.status, 200)
      const queueBody = await queues.json() as Record<string, unknown>
      for (const field of ['ticketDelivery', 'partnerWebhookDelivery', 'refundReviewOrders', 'overduePendingPayments', 'expiredActiveReservations']) assert.ok(field in queueBody)

      for (const endpoint of ['api-usage', 'operations/queues']) {
        const denied = await fetch(`${baseUrl}/api/staff/admin/${endpoint}`, { headers: authHeaders(partnerCookie!) })
        assert.equal(denied.status, 403, `partner owner cannot read platform ${endpoint}`)
      }
      const partnerEvents = await fetch(`${baseUrl}/api/staff/partners/${partnerId}/admin/events`, { headers: authHeaders(partnerCookie!) })
      assert.equal(partnerEvents.status, 200)
      assert.deepEqual(await partnerEvents.json(), { items: [] })
      const otherPartnerEvents = await fetch(`${baseUrl}/api/staff/partners/${otherPartnerId}/admin/events`, { headers: authHeaders(partnerCookie!) })
      assert.equal(otherPartnerEvents.status, 403, 'partner owner cannot substitute another partner ID')
    } finally {
      const staffIds = [superAdminId, partnerStaffId].filter((id): id is string => Boolean(id))
      if (staffIds.length) await prisma.staffSession.deleteMany({ where: { staffId: { in: staffIds } } })
      if (partnerId || otherPartnerId) await prisma.partner.deleteMany({ where: { id: { in: [partnerId, otherPartnerId].filter((id): id is string => Boolean(id)) } } })
      await prisma.staffUser.deleteMany({ where: { email: { in: [superAdminEmail, partnerEmail] } } })
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await prisma.$disconnect()
  }
})
