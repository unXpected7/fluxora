import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const eventsRouter = Router()

function availableTickets<T extends { capacity: number; sold: number; reserved: number }>(ticketType: T) {
  return { ...ticketType, available: Math.max(0, ticketType.capacity - ticketType.sold - ticketType.reserved) }
}

eventsRouter.get('/', async (_request, response, next) => {
  try {
    const now = new Date()
    const events = await prisma.event.findMany({
      where: { status: 'PUBLISHED', endsAt: { gte: now }, partner: { is: { status: 'ACTIVE' } } },
      orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        coverImageUrl: true,
        venueName: true,
        city: true,
        timezone: true,
        startsAt: true,
        endsAt: true,
        performances: {
          where: { status: 'ON_SALE' },
          orderBy: { startsAt: 'asc' },
          select: {
            id: true,
            name: true,
            startsAt: true,
            endsAt: true,
            ticketTypes: {
              where: { active: true, AND: [{ OR: [{ salesStartAt: null }, { salesStartAt: { lte: now } }] }, { OR: [{ salesEndAt: null }, { salesEndAt: { gte: now } }] }] },
              orderBy: { price: 'asc' },
              select: { id: true, name: true, description: true, price: true, salesStartAt: true, salesEndAt: true, perOrderLimit: true, capacity: true, sold: true, reserved: true },
            },
          },
        },
        bundles: {
          where: { active: true, AND: [{ OR: [{ salesStartAt: null }, { salesStartAt: { lte: now } }] }, { OR: [{ salesEndAt: null }, { salesEndAt: { gte: now } }] }] },
          orderBy: { price: 'asc' },
          select: {
            id: true, code: true, name: true, description: true, price: true, perOrderLimit: true, capacity: true, sold: true, reserved: true,
            items: { select: { quantity: true, ticketType: { select: { id: true, name: true, performanceId: true, capacity: true, sold: true, reserved: true } } } },
          },
        },
      },
    })
    response.json({ items: events.map(event => ({
      ...event,
      performances: event.performances.map(performance => ({ ...performance, ticketTypes: performance.ticketTypes.map(availableTickets) })),
      bundles: event.bundles.map(bundle => {
        const componentAvailability = bundle.items.map(item => Math.floor(Math.max(0, item.ticketType.capacity - item.ticketType.sold - item.ticketType.reserved) / item.quantity))
        const capacityAvailability = bundle.capacity === null ? Number.POSITIVE_INFINITY : Math.max(0, bundle.capacity - bundle.sold - bundle.reserved)
        return {
          id: bundle.id, code: bundle.code, name: bundle.name, description: bundle.description,
          price: bundle.price, perOrderLimit: bundle.perOrderLimit,
          items: bundle.items.map(item => ({ quantity: item.quantity, ticketType: { id: item.ticketType.id, name: item.ticketType.name, performanceId: item.ticketType.performanceId } })),
          available: Math.max(0, Math.min(capacityAvailability, ...componentAvailability)),
        }
      }),
    })) })
  } catch (error) {
    next(error)
  }
})

eventsRouter.get('/:slug', async (request, response, next) => {
  try {
    const now = new Date()
    const event = await prisma.event.findFirst({
      where: { slug: request.params.slug, status: 'PUBLISHED', endsAt: { gte: now }, partner: { is: { status: 'ACTIVE' } } },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        description: true,
        coverImageUrl: true,
        venueName: true,
        venueAddress: true,
        city: true,
        timezone: true,
        startsAt: true,
        endsAt: true,
        performances: {
          where: { status: 'ON_SALE' },
          orderBy: { startsAt: 'asc' },
          select: {
            id: true,
            name: true,
            startsAt: true,
            endsAt: true,
            checkInOpensAt: true,
            checkInClosesAt: true,
            ticketTypes: {
              where: { active: true, AND: [{ OR: [{ salesStartAt: null }, { salesStartAt: { lte: now } }] }, { OR: [{ salesEndAt: null }, { salesEndAt: { gte: now } }] }] },
              orderBy: { price: 'asc' },
              select: { id: true, name: true, description: true, price: true, salesStartAt: true, salesEndAt: true, perOrderLimit: true, capacity: true, sold: true, reserved: true },
            },
          },
        },
        bundles: {
          where: { active: true, AND: [{ OR: [{ salesStartAt: null }, { salesStartAt: { lte: now } }] }, { OR: [{ salesEndAt: null }, { salesEndAt: { gte: now } }] }] },
          orderBy: { price: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            price: true,
            perOrderLimit: true,
            capacity: true,
            sold: true,
            reserved: true,
            items: { select: { quantity: true, ticketType: { select: { id: true, name: true, performanceId: true, capacity: true, sold: true, reserved: true } } } },
          },
        },
      },
    })
    if (!event) {
      response.status(404).json({ message: 'Event not found' })
      return
    }
    response.json({
      ...event,
      performances: event.performances.map(performance => ({ ...performance, ticketTypes: performance.ticketTypes.map(availableTickets) })),
      bundles: event.bundles.map(bundle => {
        const componentAvailability = bundle.items.map(item => Math.floor(Math.max(0, item.ticketType.capacity - item.ticketType.sold - item.ticketType.reserved) / item.quantity))
        const capacityAvailability = bundle.capacity === null ? Number.POSITIVE_INFINITY : Math.max(0, bundle.capacity - bundle.sold - bundle.reserved)
        return {
          id: bundle.id, code: bundle.code, name: bundle.name, description: bundle.description,
          price: bundle.price, perOrderLimit: bundle.perOrderLimit,
          items: bundle.items.map(item => ({ quantity: item.quantity, ticketType: { id: item.ticketType.id, name: item.ticketType.name, performanceId: item.ticketType.performanceId } })),
          available: Math.max(0, Math.min(capacityAvailability, ...componentAvailability)),
        }
      }),
    })
  } catch (error) {
    next(error)
  }
})
