# Fluxora e-ticketing backend implementation plan

**Status:** In progress — vm01 dev/prod databases provisioned; dev API deployed privately and healthy with QRIS disabled; DNS/TLS and provider-account rollout pending
**Scope:** Build the backend under `backend/` for concert ticket sales, multiple ticket types, bundles, QRIS checkout, and admission validation. Use Nilam as the architectural reference, while keeping Fluxora's deployment hostnames and event-specific domain model.

### Progress

- [x] Backend scaffold, PostgreSQL/Prisma schema and migrations, sample event/bundle seed, health endpoints, and public event catalogue endpoints.
- [x] Checkout quotes, bundle expansion, serializable inventory reservations, idempotent order creation, private order lookup, payment-session claims, and expired-reservation release.
- [x] Provider-confirmed late payments without a live inventory reservation enter audited refund review and do not issue tickets; admin can record a manually completed provider refund.
- [x] RajaOngkir QRISLY adapter, authenticated status reconciliation, verified settlement, and QR ticket issuance; sandbox merchant validation remains pending.
- [x] Dev/prod API Compose services, API gateway vhost files, health checks, and environment-specific secret wiring staged in the repository.
- [x] Backend build and Prisma schema checks added to both branch workflows; API deployment remains manual and separate from frontend deployment.
- [x] Add and run unit coverage for ticket QR signing/tamper rejection, webhook SSRF URL validation, and RajaOngkir QR session amount/config parsing (4 passing); backend/frontend builds and type-checks pass. Full provider sandbox and DB-backed tenant scenarios remain open.
- [x] Migration-only Compose tasks and database backup, rollout, and rollback instructions documented. Automated backup scheduling and off-VM retention remain infrastructure work.
- [x] Nilam-style staff sessions, separate gate/admin roles, staff provisioning, rate-limited atomic check-in, scan audit, admin catalogue management, and a retried ticket-email outbox.
- [x] Provision isolated PostgreSQL 16 dev/prod databases on vm01 using ports 5438/5439, separate persistent volumes, and private credential storage.
- [x] Apply all 10 Prisma migrations to the fresh dev database and deploy the dev API on vm01 at `10.10.0.2:5102`; `/healthz`, `/readyz`, and Prisma migration status verified. QRIS remains disabled.
- [ ] Install DNS/TLS/API vhosts and configure provider and email credentials.
- [ ] Complete RajaOngkir/Brevo sandbox walkthrough and operational approval before production enablement. Automated provider refunds remain unimplemented pending a confirmed provider/policy contract; late-paid manual review is implemented.

## 1. Goal

Provide a reliable ticket purchase and entry system for concerts with multiple events, ticket categories, and purchasable bundles. A customer should be able to select tickets or a bundle, pay by QRIS, receive a ticket for every admission included in the purchase, and present each ticket's QR code at the venue.

The backend is the authority for prices, availability, payment state, ticket issuance, and check-in. The browser must never be able to mark an order paid, mint a valid ticket, or validate entry by itself.

## 2. Nilam reference and important provider status

Follow Nilam's backend organization and checkout safeguards:

- TypeScript with Express, Prisma, and PostgreSQL.
- Keep provider clients and configuration in `src/lib/`; keep HTTP endpoints in routes/server modules.
- Create immutable checkout quotes and order-item snapshots so later event or price edits cannot alter an existing order.
- Use an idempotency key for order creation and persist payment attempts separately from orders.
- Create a payment session through a provider adapter, persist its identifiers and QR/payment instructions, and replay the saved session on safe retries.
- Accept payment state only from a verified provider notification or a server-to-server status check. Make notification processing idempotent.
- Keep payment configuration in environment variables; never commit credentials.

Nilam's current checkout provider is Midtrans. Its `rajaongkir` payment option is only a disabled placeholder: `paymentProvider.ts` checks for RajaOngkir credentials, then intentionally rejects the request because the provider adapter is not implemented. Nilam's shipping rates use Biteship. Fluxora now has a QRISLY adapter following RajaOngkir's public [authentication](https://rajaongkir.com/docs/qrisly/getting-started/authentication), [QRIS generation and status endpoint](https://rajaongkir.com/docs/qrisly/getting-started/available-endpoints), and [webhook payload](https://rajaongkir.com/docs/qrisly/getting-started/webhook) documentation.

The documented flow uses `X-API-Key`, `POST /api/v1/qrisly/generate-qris`, and `GET /api/v1/qrisly/payment-status/{history_id}` with separate sandbox and production base URLs. QRIS generation accepts IDR 1,000–100,000,000 and costs IDR 100 per generated code; Fluxora sets `unique_amount: false` so the amount charged must exactly match the order. The QRISLY webhook guide documents success/expiry events but does not specify a webhook signature. Fluxora uses callbacks only as prompts and confirms status and amount through the authenticated status API before changing order state or issuing tickets. A network-ambiguous QR creation remains claimed temporarily to avoid immediately creating a second code and incurring another generation fee.

Sandbox validation is still required before production. The public examples are inconsistent about identifier shapes (`qris_id` and callback history IDs are shown as UUID strings in examples, while endpoint parameters are described as numbers/integers). Confirm the configured merchant QRIS ID, generated/callback history ID formats, dashboard callback setup, settlement ownership, and production access using the actual sandbox account. Keep live mode disabled until those checks and a complete sandbox purchase pass. Never fall back silently to another provider.

## 3. Fluxora deployment and hostnames

Fluxora currently deploys only the static frontend (`dev.fluxorastudio.id` at `10.10.0.2:8093` and `fluxorastudio.id` at `10.10.0.2:8094`). There is no backend service or API hostname in this repository yet. Nilam runs separate dev and prod frontend/backend containers and exposes API services on dedicated WireGuard-bound ports.

Proposed ticketing API hosts, following that pattern:

| Environment | Proposed API hostname | Proposed vm01 bind |
|---|---|---|
| Development | `dev-api-eticket.fluxorastudio.id` | `10.10.0.2:5102` |
| Production | `api-eticket.fluxorastudio.id` | `10.10.0.2:5103` |

Treat these as proposed names and confirm DNS/certificate ownership when the deployment is prepared. Keep the concert ticket API separate from Fluxora's studio marketing site and from Nilam's `api-topan` services. Configure frontend API origin and CORS per environment. Add distinct development and production PostgreSQL databases/credentials; do not share Nilam's database or payment credentials. Add public Nginx vhosts that proxy to the new API ports and preserve forwarded host/protocol/client IP headers. Add backend services to Fluxora's VM Compose stack without changing the existing frontend ports.

## 4. Backend structure

Start with the Nilam conventions and adapt names to Fluxora. Suggested modules:

```text
backend/
  src/server.ts
  src/routes/events.ts
  src/routes/checkout.ts
  src/routes/payments.ts
  src/routes/tickets.ts
  src/routes/admin.ts
  src/lib/prisma.ts
  src/lib/checkout.ts
  src/lib/paymentProvider.ts
  src/lib/rajaongkir.ts
  src/lib/ticketQr.ts
  src/lib/notifications.ts
  prisma/schema.prisma
  prisma/migrations/
```

The exact route split can follow the initial API surface, but payment-provider code, QR/ticket signing, and order logic should stay out of request handlers. Use input validation, rate limits on checkout/payment/check-in endpoints, structured request IDs/logging, and explicit error mapping like Nilam.

## 5. Ticketing data model

Design the schema around an event that may have one or more scheduled concerts/performances and multiple ticket categories. Proposed core records:

- **Event:** public slug, title, description, venue, event timezone, sale window, publication state, and event-level metadata.
- **Performance:** event date/time and admission/check-in window. Use explicit timezone-aware timestamps and store instants consistently.
- **TicketType:** category/section name, price in integer IDR, sales window, capacity, per-order limit, and active state. If seats are assigned, add a seat inventory model rather than representing seats as a quantity.
- **Bundle:** named offer with fixed price and a set of ticket-type/performance components and quantities. Define whether a bundle grants multiple admissions, has its own capacity, and how capacity is allocated across its components. Store the component definition as a versioned snapshot on order items.
- **InventoryReservation:** temporary reservation with expiry and state, acquired atomically during quote/order creation so simultaneous buyers cannot oversell. Release it on expiry, cancellation, or payment failure according to the agreed policy.
- **CheckoutQuote:** customer/contact data, selected event/performance, immutable item and bundle snapshots, computed totals, payment provider, expiry, and inventory reservation references.
- **Order / OrderItem:** immutable buyer, price, quantity, bundle composition, fees/discounts if supported, total, and lifecycle/payment states.
- **PaymentAttempt:** provider, unique provider order/payment IDs, amount, payment status/type, QR content or hosted payment instructions, expiry, session-creation claim timestamps, verified timestamp, and deduplication key/hash for notifications.
- **Ticket:** one record per admission, with an opaque unique ticket ID, order/order-item and event/performance/ticket-type references, current state, issued timestamp, and check-in state. A bundle that includes four admissions must issue four independently checkable tickets unless product policy explicitly defines a single group pass.
- **TicketScan / CheckInEvent:** immutable audit record for each validation attempt, including ticket ID, result, time, gate/device/staff actor, and request ID. Prevent duplicate admission with a conditional state transition/unique successful check-in.
- **OrderEvent / audit record:** append lifecycle events such as quote, order creation, reservation release, payment confirmation, issuance, cancellation, refund, and check-in.

Use integer rupiah amounts and server-calculated totals. Define whether the initial release has assigned seating, service fees, discounts, refunds, partial bundle redemption, ticket transfer, and attendee-name capture. Keep these out of the first release unless required, but settle them before schema/API freeze because they change inventory and ticket lifecycle behavior.

## 6. Purchase, reservation, and payment flow

1. Public event endpoints return only published events, active performances, sale-open ticket types, bundle definitions, and current availability.
2. Checkout accepts event/performance and ticket-type quantities or a bundle ID. The backend reloads the authoritative catalogue/prices, validates sale windows and quantity limits, expands bundle contents, computes the total, and creates an expiring quote with an atomic inventory reservation.
3. Order creation requires an `Idempotency-Key`, verifies that the quote belongs to the checkout session and has not expired, then persists the order and immutable item/bundle snapshots in a database transaction. It consumes/extends the reservation through a bounded payment window and creates a pending payment attempt. Repeated requests with the same key return the existing order; conflicting reuse is rejected.
4. Payment-session creation claims the pending attempt so retries or concurrent requests do not create duplicate provider transactions. It sends the exact server-computed order amount and stable provider order ID to the selected payment adapter, then persists the provider's response and returns only the customer-facing payment instructions.
5. The checkout page displays the QR code/content, amount, expiry, and pending state. It polls an authenticated order-status endpoint or refreshes status; a browser redirect or client callback is informational only.
6. A public payment webhook endpoint verifies the provider's documented authentication/signature, matches provider order ID and payment ID, validates amount/currency and allowed state transitions, and deduplicates notifications. If webhook authentication or the payload is ambiguous, query the provider's status API before changing the order.
7. On verified settlement, one transaction marks the payment and order paid, commits the inventory reservation, creates one ticket per admission, and records events. Ensure uniqueness/idempotency so duplicate notifications cannot issue extra tickets.
8. On confirmed expiry/failure, release reserved inventory and make the order/tickets non-redeemable. Handle late-paid notifications explicitly: reconcile with the provider and either restore inventory safely or place the order in a manual-review/refund state; never issue tickets against unavailable capacity without a defined policy.

The reservation duration must not exceed the provider QRIS payment expiry, and both values must be configurable/recorded. The cleanup worker reconciles an expired payment session with RajaOngkir before releasing held inventory. If status is uncertain, it retains the hold briefly and retries rather than releasing capacity while payment may be in flight.

## 7. QRIS adapter and secrets

Use the provider adapter contract for `createPaymentSession` and `getPaymentStatus`. The RajaOngkir QRISLY adapter is implemented against the public documentation and requires sandbox validation. It:

- Use the backend-only QRISLY API key and registered merchant QRIS ID; keep credentials separate between dev and prod.
- Use a stable, unique Fluxora order ID and exact integer IDR total for each attempt.
- Validate HTTPS destinations and response shape; apply timeouts and bounded retries only where retrying is safe.
- Persist the QRIS payload/URL, expiry, and provider IDs needed to render or reconcile the payment.
- Treat webhook payloads only as reconciliation prompts because QRISLY's public webhook guide does not document a signature. Confirm history ID, amount, and status through the authenticated status API before changing state; do not invent a signature formula.
- Reject wrong order, currency, amount, duplicate or invalid transitions. Log redacted provider metadata, never keys, complete QR payloads if sensitive, or customer secrets.
- Keep sandbox and production base URLs/config isolated, and fail closed when config or provider responses are invalid.

Add variable names to `backend/.env.example` and deployment Compose, with empty placeholders only, after confirming the provider's credential names. Store real values in ignored environment files or the deployment secret store with restrictive permissions. Keep Midtrans as an optional provider only if Fluxora chooses to support it; otherwise do not copy Nilam's Midtrans-specific assumptions into the product.

## 8. Ticket QR generation and gate validation

Generate ticket QR values from high-entropy opaque ticket identifiers or signed, versioned tokens. Do not encode buyer PII or expose sequential database IDs. Persist enough server-side state to revoke/cancel a ticket and prevent replay. QR images can be rendered client-side from a server-issued opaque value; the backend remains the validator.

Provide an authenticated staff check-in endpoint that validates ticket status, event/performance, check-in time window, and successful prior scans. Perform the check-in with an atomic conditional update and create an audit event in the same transaction. Return clear results for valid, already-used, cancelled/refunded, wrong-event, not-yet-valid, and unknown tickets. Require staff authentication and permissions, and retain an offline-mode policy as an explicit later decision (offline validation introduces replay and synchronization risks).

## 9. API outline

Initial public/customer endpoints:

- `GET /api/events` and `GET /api/events/:slug` — published event information, performances, ticket types, bundles, and sale status.
- `POST /api/checkout/quotes` — validate selection, reserve availability, and return quote totals/expiry.
- `POST /api/checkout/orders` — idempotently create a pending order from a valid quote.
- `POST /api/checkout/orders/:id/payment` — create or replay payment instructions.
- `GET /api/orders/:id` — return an appropriately authenticated or unguessable-access-token protected order/payment status.
- `POST /api/webhooks/rajaongkir` — notification prompt followed by authenticated provider status lookup; register this HTTPS route in RajaOngkir.
- `GET /api/tickets/:publicId` — customer ticket retrieval through authenticated ownership or a scoped, revocable access token.

Initial staff endpoints:

- Staff login/session and role/permission management appropriate to the launch scope.
- `POST /api/staff/check-ins/validate` — scan and consume a ticket exactly once.
- Admin event, performance, ticket type, bundle, capacity, order, and payment-reconciliation endpoints with audit logging and least-privilege permissions.

Finalize API names and the order lookup access model during implementation. Do not expose an order by database ID alone.

## 10. Delivery phases

### Phase A — Decisions and provider verification

- [x] Provision separate Fluxora dev/prod PostgreSQL databases and credentials on vm01; dev binds to `192.168.100.35:5438`, prod to `127.0.0.1:5439`.
- [ ] Confirm API hostname ownership and final mapping for dev and production.
- [ ] Create DNS records and TLS certificates for the approved API hosts; verify HTTPS renewal and reverse-proxy forwarding headers.
- [ ] Configure API vhosts to proxy to the dev/prod API ports and set frontend origins/CORS to the approved storefront hosts.
- [ ] Obtain and store RajaOngkir sandbox API credentials and merchant QRIS ID in the dev secret store; keep dev payment provider disabled until callback validation is ready.
- [ ] Generate a sandbox QR and record actual QRIS ID, history ID, amount, currency, expiry, and status response formats against the adapter contract.
- [ ] Register the dev HTTPS callback with RajaOngkir, inspect callback authentication/signature support, and confirm server-side status reconciliation handles duplicate and out-of-order events.
- [ ] Decide whether assigned seating is needed (current model is general admission) and whether offline check-in is a launch requirement.
- [ ] Decide cancellation/refund rules, required attendee details, ticket transfer policy, and bundle composition/discount rules before freezing customer workflows.
- [x] Tickets are issued only after confirmed payment settlement.

### Phase B — Backend and schema foundation

- [x] Scaffold TypeScript, Express, Prisma, PostgreSQL, request IDs, CORS, rate limits, health endpoints, and build/start documentation.
- [x] Add event/performance/ticket type/bundle models, immutable quote/order snapshots, inventory reservations, payment attempts, tickets, check-in audit, and migrations.
- [x] Add local demo seed fixtures without customer data or credentials.

### Phase C — Catalogue and safe checkout

- [x] Implement public event/catalogue reads and role-protected admin catalogue management.
- [x] Implement quote calculation, bundle expansion, capacity enforcement, atomic reservations, quote expiry, idempotent order creation, and private order status access.
- [x] Add expiry/reconciliation workers and order audit events.

### Phase D — QRIS payments and ticket delivery

- [x] Implement RajaOngkir QRISLY session creation, QR display data, status reconciliation, idempotent settlement, expiry/failure handling, inventory commit, and QR ticket issuance.
- [x] Reconcile later callbacks and customer status polls for closed payments; a subsequently confirmed payment without a live hold moves to manual refund review and issues no ticket.
- [ ] Complete a sandbox purchase and reconcile the exact order amount, generated QR, provider history ID, and status lookup.
- [ ] Exercise successful, expired, duplicate, late, wrong-amount, and out-of-order callback/status cases before enabling dev sales.
- [x] Issue tickets transactionally after verified settlement; private order retrieval and queued Brevo ticket-email delivery are implemented.
- [x] Route a provider-confirmed late payment with no live inventory hold to `REFUND_PENDING`; it never issues tickets. Admins can review the case and record a provider refund reference after handling the refund externally.
- [ ] Verify Brevo sender/domain, deliver a sandbox ticket message, inspect links/QR privacy, and confirm retry behavior.
- [ ] Keep production QRIS disabled until sandbox callback authentication, amount validation, duplicates/out-of-order updates, expiry, merchant ownership, and production credentials pass review.

### Phase E — Gate operations and deployment

- [x] Staff login/sessions, separate gate/admin roles, online atomic check-in, audited admin catalogue management, and staff provisioning are implemented.
- [x] Add backend dev/prod Compose services, API Nginx vhost files, health checks, secret wiring, backend CI verification, migration-only tasks, and backup/rollback runbook.
- [x] Inspect vm01 backup scheduling read-only: no Fluxora backup directory or database backup cron job exists; only host telemetry is scheduled. Off-VM storage and retention details are still required before configuring backups.
- [ ] Schedule encrypted dev/prod PostgreSQL backups and copy them off vm01 with separate environment paths and retention.
- [ ] Perform a restore drill for each environment and document recovery time, restore commands, and backup age checks.
- [ ] Configure host/container/database disk, health, backup-failure, and API-worker alerts with an assigned responder.
- [x] Deploy the dev API against the dedicated dev database; verify health/readiness and migration status. QRIS remains disabled.
- [ ] Walk through event setup, ticket/bundle purchase, QRIS confirmation, email delivery, and gate check-in in sandbox; record expected outcomes and operational steps.
- [ ] Review payment reconciliation, late-paid refund review, email/webhook retries, incident contacts, and rollback actions with operators.
- [ ] Enable production only after DNS/TLS, provider credentials and callbacks, backup restore, monitoring, security, and operational approvals pass.

## 11. Verification scenarios

During implementation, verify at minimum:

- Ticket-type price and bundle totals are calculated on the server; client-supplied prices are ignored.
- Two buyers competing for the final admission cannot oversell it; expired/failed reservations return capacity exactly once.
- Bundle purchases reserve every included ticket component and issue the correct number/type of tickets.
- Replayed idempotency keys do not create extra orders, payment sessions, inventory decrements, or tickets.
- Payment response must match the stored provider order ID, amount, and currency; invalid signatures, wrong amounts, duplicate callbacks, and out-of-order callbacks cannot mark an order paid twice.
- A paid order issues each admission exactly once; unconfirmed/failed/expired payment issues no usable ticket.
- QR values reveal no personal data; cancelled/refunded tickets are rejected at entry.
- Concurrent scans of one ticket result in at most one successful check-in; repeat scans are auditable and clearly rejected.
- Customer and staff endpoints enforce ownership/permissions, and logs contain no credentials or sensitive payment data.
- Dev and production use separate databases, hostnames, provider credentials, and frontend origins.

## 12. Open decisions and blockers

1. The RajaOngkir QRISLY adapter follows public docs, but account-specific sandbox access, QRIS ID and webhook history ID formats, settlement ownership, and live-mode approval remain unverified.
2. Confirm the proposed API subdomains or provide the desired Fluxora ticketing hostnames.
3. Decide whether tickets are general admission or assigned seats; the inventory model differs substantially.
4. Define bundle rules: fixed included ticket types/performances, capacity allocation, discount behavior, and whether each included admission receives its own QR.
5. Reservation and payment holds are 15 minutes. Late-paid orders move to manual refund review with no tickets; confirm the operational refund policy and provider-supported automated refund process before launch.
6. Confirm staff account/check-in workflow, gate connectivity, email delivery requirements, and whether customers must have accounts.

These decisions should be captured before the corresponding schema and provider behavior are frozen. Keep live payment disabled until the sandbox flow is confirmed with Fluxora's merchant account.
