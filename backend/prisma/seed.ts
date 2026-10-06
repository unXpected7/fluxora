import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const partner = await prisma.partner.upsert({
    where: { slug: 'fluxora' },
    update: {},
    create: { id: 'partner_fluxora', slug: 'fluxora', name: 'Fluxora', status: 'ACTIVE' },
  })
  const event = await prisma.event.upsert({
    where: { slug: 'fluxora-demo-live' },
    update: {},
    create: {
      partnerId: partner.id,
      slug: 'fluxora-demo-live',
      title: 'Fluxora Demo Live',
      summary: 'Development-only event data for the ticket catalogue.',
      description: 'A sample event used to exercise event, ticket type, and bundle catalogue behavior.',
      venueName: 'Demo Hall',
      city: 'Jakarta',
      timezone: 'Asia/Jakarta',
      startsAt: new Date('2030-01-10T12:00:00.000Z'),
      endsAt: new Date('2030-01-10T16:00:00.000Z'),
      status: 'PUBLISHED',
      performances: {
        create: {
          name: 'Evening show',
          startsAt: new Date('2030-01-10T12:00:00.000Z'),
          endsAt: new Date('2030-01-10T16:00:00.000Z'),
          checkInOpensAt: new Date('2030-01-10T10:00:00.000Z'),
          checkInClosesAt: new Date('2030-01-10T15:30:00.000Z'),
          status: 'ON_SALE',
          ticketTypes: {
            create: [
              { code: 'REG', name: 'Regular', description: 'General admission', price: 250000, capacity: 500, salesStartAt: new Date('2029-01-01T00:00:00.000Z'), perOrderLimit: 6 },
              { code: 'VIP', name: 'VIP', description: 'Priority entry', price: 500000, capacity: 100, salesStartAt: new Date('2029-01-01T00:00:00.000Z'), perOrderLimit: 4 },
            ],
          },
        },
      },
    },
    include: { performances: { include: { ticketTypes: true } } },
  })

  const performance = event.performances[0]
  const regular = performance?.ticketTypes.find(ticketType => ticketType.code === 'REG')
  const vip = performance?.ticketTypes.find(ticketType => ticketType.code === 'VIP')
  if (!performance || !regular || !vip) throw new Error('Demo event seed did not create its ticket types')

  await prisma.bundle.upsert({
    where: { eventId_code: { eventId: event.id, code: 'DUO' } },
    update: {},
    create: {
      eventId: event.id,
      code: 'DUO',
      name: 'Regular Duo',
      description: 'Two general admission tickets.',
      price: 450000,
      capacity: 200,
      perOrderLimit: 3,
      active: true,
      items: { create: { ticketTypeId: regular.id, quantity: 2 } },
    },
  })
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
