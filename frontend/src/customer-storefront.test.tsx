// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { CustomerEventCatalogue, isCustomerStorefrontRoute, safeCustomerOrder, ticketingApiUrl, type StoreEvent } from './App.js'

afterEach(cleanup)

function eventFixture({ slug, title, city, daysAhead, price }: { slug: string; title: string; city: string; daysAhead: number; price: number }) {
  const startsAt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString()
  return {
    id: slug,
    slug,
    title,
    summary: null,
    coverImageUrl: null,
    venueName: `${city} Hall`,
    city,
    timezone: 'Asia/Jakarta',
    startsAt,
    endsAt: startsAt,
    performances: [{ id: `${slug}-performance`, name: 'Main show', startsAt, endsAt: startsAt, ticketTypes: [{ id: `${slug}-ticket`, name: 'General admission', description: null, price, available: 20, perOrderLimit: 4 }] }],
    bundles: [],
  }
}

const money = (amount: number) => `IDR ${amount}`
const lowestPrice = (event: StoreEvent) => Math.min(...event.performances.flatMap(performance => performance.ticketTypes.map(ticket => ticket.price)))

describe('customer storefront routing', () => {
  it('routes the e-ticket root and event links to the storefront, not the studio homepage', () => {
    expect(isCustomerStorefrontRoute('e-ticket.fluxorastudio.id', '/')).toBe(true)
    expect(isCustomerStorefrontRoute('fluxorastudio.id', '/')).toBe(false)
    expect(isCustomerStorefrontRoute('fluxorastudio.id', '/event/jazz-night')).toBe(true)
  })

  it('selects the matching ticket API and honors a configured override', () => {
    expect(ticketingApiUrl('dev-admin-eticket.fluxorastudio.id')).toBe('https://dev-api-eticket.fluxorastudio.id')
    expect(ticketingApiUrl('e-ticket.fluxorastudio.id')).toBe('https://api-eticket.fluxorastudio.id')
    expect(ticketingApiUrl('localhost')).toBe('http://localhost:4000')
    expect(ticketingApiUrl('e-ticket.fluxorastudio.id', 'https://preview-api.example.test')).toBe('https://preview-api.example.test')
  })
})

describe('customer order recovery', () => {
  it('removes bearer ticket QR values before storing order data', () => {
    const safeOrder = safeCustomerOrder({
      id: 'order-1', orderNumber: 'FLX-1', status: 'PAID', paymentStatus: 'PAID', total: 1000, payment: null,
      tickets: [{ publicId: 'ticket-1', qrToken: 'signed-bearer-value', status: 'ACTIVE', issuedAt: new Date().toISOString() }],
    })
    expect(safeOrder.tickets?.[0]?.publicId).toBe('ticket-1')
    expect(safeOrder.tickets?.[0] && 'qrToken' in safeOrder.tickets[0]).toBe(false)
  })
})

describe('event catalogue', () => {
  const events = [
    eventFixture({ slug: 'jazz-night', title: 'Jazz Night', city: 'Jakarta', daysAhead: 10, price: 80000 }),
    eventFixture({ slug: 'pop-show', title: 'Pop Show', city: 'Bandung', daysAhead: 60, price: 35000 }),
  ]

  it('shows event cards, starting prices, and accessible artwork fallbacks', () => {
    render(<CustomerEventCatalogue events={events} money={money} lowestPrice={lowestPrice} />)
    const jazzLink = screen.getByRole('link', { name: /Jazz Night/ })
    expect(jazzLink.getAttribute('href')).toBe('/event/jazz-night')
    expect(screen.getByText('From IDR 80000')).toBeTruthy()
    expect(jazzLink.querySelector('.ticket-event-card-image-fallback')).toBeTruthy()
  })

  it('filters by text and city and sorts prices', async () => {
    const user = userEvent.setup()
    render(<CustomerEventCatalogue events={events} money={money} lowestPrice={lowestPrice} />)
    await user.type(screen.getByRole('searchbox', { name: 'Search events' }), 'Jazz')
    expect(screen.getByRole('link', { name: /Jazz Night/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Pop Show/ })).toBeNull()
    await user.clear(screen.getByRole('searchbox', { name: 'Search events' }))
    await user.selectOptions(screen.getByLabelText('City'), 'Bandung')
    expect(screen.getByRole('link', { name: /Pop Show/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Jazz Night/ })).toBeNull()
    await user.selectOptions(screen.getByLabelText('City'), '')
    await user.selectOptions(screen.getByLabelText('Sort by'), 'price')
    expect(screen.getAllByRole('link')[0]?.getAttribute('href')).toBe('/event/pop-show')
  })

  it('exposes named catalogue controls in keyboard tab order', async () => {
    const user = userEvent.setup()
    render(<CustomerEventCatalogue events={events} money={money} lowestPrice={lowestPrice} />)
    const search = screen.getByRole('searchbox', { name: 'Search events' })
    const city = screen.getByRole('combobox', { name: 'City' })
    const date = screen.getByRole('combobox', { name: 'Date' })
    const sort = screen.getByRole('combobox', { name: 'Sort by' })
    const firstEvent = screen.getByRole('link', { name: /Jazz Night/ })

    await user.tab()
    expect(document.activeElement).toBe(search)
    await user.tab()
    expect(document.activeElement).toBe(city)
    await user.tab()
    expect(document.activeElement).toBe(date)
    await user.tab()
    expect(document.activeElement).toBe(sort)
    await user.tab()
    expect(document.activeElement).toBe(firstEvent)
  })

  it('limits events to the selected upcoming date window', async () => {
    const user = userEvent.setup()
    render(<CustomerEventCatalogue events={events} money={money} lowestPrice={lowestPrice} />)
    await user.selectOptions(screen.getByLabelText('Date'), '30')
    expect(screen.getByRole('link', { name: /Jazz Night/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Pop Show/ })).toBeNull()
  })
})
