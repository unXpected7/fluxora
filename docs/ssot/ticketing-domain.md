# Ticketing domain and lifecycle

**Reviewed:** 2026-10-10  
**Schema source:** `backend/prisma/schema.prisma`  
**Status:** Core ticketing lifecycle is implemented. Payment-provider acceptance, operational policies, and new organizer email-consent records remain incomplete.

## 1. Domain overview

The ticketing domain is organized around a partner-owned event catalogue, temporary inventory reservations, private checkout quotes, orders, payment attempts, admissions (tickets), and auditable check-in. Prisma models and enums are authoritative for persisted state; this page explains their product meaning.

### Catalogue hierarchy

```text
Partner
└── Event
    ├── Performance
    │   └── TicketType
    └── Bundle
        └── BundleItem → TicketType(s)
```

- A **Partner** is an organizer tenant with a lifecycle status (`PENDING`, `ACTIVE`, `SUSPENDED`).
- An **Event** belongs to one partner and carries public metadata, slug, venue, city, timezone, dates, and publication status (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
- A **Performance** is a scheduled occurrence of an event. It owns ticket categories and optional check-in opening/closing instants.
- A **TicketType** is general-admission inventory for a performance. It has integer-IDR price, capacity, sold and reserved counters, sale window, per-order limit, and active state.
- A **Bundle** belongs to an event and contains one or more fixed ticket-type components through `BundleItem`; it has a price, optional bundle capacity, counters, sale window, and per-order limit.
- Bundle composition is kept fixed after creation so already-quoted/ordered bundle contents are not silently changed.

Assigned seating is not represented. A bundle consumes its component ticket inventory; the purchase must issue one checkable ticket per admission.

## 2. Checkout aggregate

```text
CheckoutQuote ── CheckoutQuoteItem
      │                  │
      ├── InventoryReservation(s)
      │       ├── reserved ticket type quantities
      │       └── reserved bundle quantities
      └── Order (zero or one)
            ├── OrderItem snapshots
            ├── PaymentAttempt(s)
            ├── Ticket(s)
            ├── lifecycle/audit events
            └── ticket-delivery outbox state
```

### Quote

- Captures customer email and optional first/last name and phone.
- Stores a hash of the private quote access token; the raw token is returned to the customer and is a bearer credential.
- Stores server-calculated subtotal, fees, total, payment provider selection, expiry, item selections, and reservation links.
- Current quote duration is 15 minutes.
- Checkout is scoped to one partner; storefront selection is one event per order.
- **Not implemented yet:** customer marketing consent, organizer-specific opt-in evidence, and communication preference state. These are separate from transactional checkout identity and require a schema/API/UI design.

### Inventory reservation

- Ticket-type and bundle reservations are tracked separately and linked to quote/checkout state.
- Reservation acquisition is transactional and protects against overselling under concurrent purchases.
- Expired reservations are released by a periodic worker; held stock is not released solely because a browser disappeared.
- Reservation state includes `ACTIVE`, `CONSUMED`, `RELEASED`, and `EXPIRED`.
- Capacity must never be reduced below sold plus reserved inventory.

### Order and immutable snapshots

- Order status includes `PENDING`, `PAID`, `CANCELLED`, `REFUND_PENDING`, and `REFUNDED`.
- Order items preserve purchase-time price and product composition; later catalogue changes must not rewrite what the buyer purchased.
- Order creation requires an idempotency key. Replaying the same key for the same checkout returns the existing order; conflicting reuse is rejected.
- Customer order reads require the private quote access token, not a guessable database ID alone.

## 3. Payment lifecycle

1. Customer requests a quote; backend validates current catalogue, sale windows, limits, and availability, then atomically reserves inventory.
2. Customer creates an order with quote ID/access token and an idempotency key.
3. Customer requests payment instructions. Backend claims/reuses a payment attempt and creates QRIS instructions through the configured provider adapter.
4. Provider callback is only a reconciliation prompt. Backend performs authenticated provider status lookup and checks provider order/payment identity and amount before state changes.
5. Verified success settles the order, consumes the reservation, and issues tickets transactionally and idempotently.
6. Confirmed expiry/failure releases inventory according to reservation state.
7. A late-confirmed payment without a live inventory hold enters `REFUND_PENDING`; it does not issue tickets. An operator handles refund externally and records the provider reference to close the local review.

Payment statuses include `PENDING`, `PAID`, `FAILED`, `EXPIRED`, and `REFUNDED`. Provider account validation is still required; production/live payment must stay disabled until sandbox behavior and operational approval are verified.

## 4. Ticket and check-in lifecycle

- A ticket represents one admission and has a signed QR bearer value that must not contain personal data.
- Tickets are created only after backend-confirmed settlement.
- Ticket status includes `ACTIVE`, `CHECKED_IN`, `VOID`, and `REFUNDED`.
- Check-in is an online, atomic state transition. Duplicate concurrent scans must not create multiple successful admissions.
- Scan result values include `ACCEPTED`, `ALREADY_USED`, `VOID`, `WRONG_EVENT`, `OUTSIDE_WINDOW`, and `UNKNOWN`.
- Validation checks the event, staff authorization/assignment, ticket state, QR signature, and performance check-in window.
- Each scan attempt is audited. Offline scanning/synchronization is not implemented.

## 5. Staff, partner, and audit entities

The schema also stores:

- Staff accounts, platform role, partner membership/role, staff sessions, invitation tokens (hash-only), and event gate assignments.
- Partner API keys (hash-only), key scopes, expiry/rotation metadata, and database-backed request quota windows.
- Partner webhook endpoint configuration, encrypted signing secret, delivery state, retry attempts, and audit data.
- Partner/platform admin audits for administrative mutations.
- Ticket delivery outbox records and delivery status/retry metadata.

Partner roles are `OWNER`, `ADMIN`, `EVENT_MANAGER`, and `GATE`; platform role includes `SUPERADMIN`. Membership and role are tenant-scoped, except platform-level operations.

## 6. Email domain status and proposed extensions

### Implemented transactional path

- Ticket email is queued through a database outbox after successful payment/ticket issuance.
- A worker processes queued messages with bounded retry behavior using Brevo when configured.
- If email delivery is not configured or fails, issued tickets remain available through the private order endpoint.
- Email sender/domain and full end-to-end delivery validation remain pending.

### Proposed organizer communications (not implemented)

1. Checkout must show an optional, unchecked-by-default opt-in for organizer news/promotional messages. Declining must not prevent purchase or necessary order/ticket emails.
2. Store consent by organizer/customer (and appropriate order/contact linkage), with affirmative/negative choice, timestamp, source, and the text/version presented. Do not infer consent from purchase.
3. Organizer campaign audiences must be limited to eligible purchasers who opted in to that organizer; never expose another organizer's audience.
4. Provide unsubscribe and suppression state; future marketing sends must honor it. Define handling for hard bounces, complaints, and resubscription.
5. Provide event-specific reminders to ticket purchasers with schedule/frequency controls and deduplication. Decide whether/how customers can opt out of reminders.
6. Keep transactional mail, event reminders, and promotional campaigns distinguishable in message category, templates, audience rules, and delivery reporting.
7. Add organizer authorization, campaign preview/approval, send limits, audit trail, failure reporting, and abuse controls before broad campaign capability.

Current state: `[NOT DONE]` No consent schema, opt-in checkout control, organizer campaign UI/API, unsubscribe endpoint, suppression list, or scheduled reminder worker is present in the schema or documented implementation.

## 7. Invariants and data safety

- Use integer rupiah values and server-calculated totals.
- Never decrement capacity twice on retry; never issue tickets twice on duplicate settlement.
- Do not mutate order snapshots when event/ticket/bundle catalogue data changes.
- Do not accept a customer-supplied price or payment result as authoritative.
- Do not expose order tokens, ticket QR values, API keys, webhook signing secrets, or buyer contact details to public catalogue or unauthorized partner users.
- Use tenant checks at every partner resource boundary.
- Use audit trails for administrative changes, payment review, and scan attempts.
- Avoid deleting domain records needed to explain orders, payments, tickets, or audit history; state transitions should preserve history.

## 8. Related documents

- [Platform PRD](PRD/fluxora-platform.md)
- [API and access model](api-and-access.md)
- [Email communications](email-communications.md)
- [Backend Prisma schema](../../backend/prisma/schema.prisma)
- [Backend implementation plan](../plansBE/eticket.md)

