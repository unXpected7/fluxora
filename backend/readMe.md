# Fluxora ticketing API

TypeScript, Express, Prisma, and PostgreSQL API for Fluxora's concert ticketing product.

## Local development

Requirements: Node.js 22+, npm, and Docker (or PostgreSQL 16+).

```sh
cp .env.example .env
npm install
docker compose -f docker-compose.local.yml up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:4000`. `GET /healthz` is a database-independent liveness check. Public catalogue endpoints are under `/api/events`.

Checkout currently provides `POST /api/checkout/quotes`, `POST /api/checkout/orders`, private `GET /api/checkout/orders/:id`, `POST /api/checkout/orders/:id/payment`, and `POST /api/webhooks/rajaongkir` (send the quote access token as a Bearer token for private routes). Quotes atomically reserve general-admission inventory and bundle components; an expiry worker releases abandoned reservations. Payment state is confirmed through RajaOngkir's authenticated status API before settlement and ticket issuance. Paid tickets are returned by the private order endpoint and queued for email delivery.

Set `DATABASE_URL` to a local PostgreSQL database before using Prisma commands. Never use production credentials for local development.

## Current payment state

RajaOngkir QRISLY session creation and status lookup are implemented from the provider's public documentation. Set `CHECKOUT_PAYMENT_PROVIDER=rajaongkir`, `RAJAONGKIR_QRIS_API_KEY`, `RAJAONGKIR_QRIS_ID` for a QRIS registered in the merchant dashboard, and a stable `TICKET_QR_SIGNING_SECRET` (32+ bytes) to enable checkout. Local development defaults to sandbox; Compose explicitly assigns sandbox to dev and live to prod. The callback only prompts server-side status verification. A browser request cannot mark an order paid. See [`../docs/plansBE/eticket.md`](../docs/plansBE/eticket.md) for account-specific sandbox validation and remaining decisions.

## Commands

- `npm run dev` — watch the API in development.
- `npm run build` — compile TypeScript into `dist/`.
- `npm start` — run the compiled API.
- `npm run db:generate` — generate the Prisma client.
- `npm run db:migrate` — create/apply a development migration.
- `npm run db:seed` — create sample event and bundle data.
# Gate staff check-in

Apply database migrations, then provision a gate account from the backend directory. Supply the credentials through your local secret manager or shell environment; do not commit them:

```sh
npm run db:migrate
FLUXORA_STAFF_EMAIL=gate@example.com FLUXORA_STAFF_PASSWORD='use-a-long-unique-password' npm run staff:create
```

For a Fluxora partner administrator, set `FLUXORA_STAFF_ROLE=ADMIN`; use the partner-scoped routes under `/api/staff/partners/partner_fluxora/admin`. For a platform operator, set `FLUXORA_STAFF_ROLE=SUPERADMIN` and use `/api/staff/admin`.

Staff endpoints use the `fluxora_staff` HttpOnly cookie. Login at `POST /api/staff/auth/login`, inspect the current session at `GET /api/staff/auth/session`, and log out at `POST /api/staff/auth/logout`. Check-in uses `POST /api/staff/check-ins/validate` with `{ "qrToken": "...", "eventId": "event-id", "gate": "Gate A" }`. Results are `ACCEPTED`, `ALREADY_USED`, `VOID`, `WRONG_EVENT`, `OUTSIDE_WINDOW`, or `UNKNOWN`; each scan is audited, and a ticket can be accepted only once. Gate staff must be assigned to the event. Configure the performance check-in window to restrict when tickets are accepted.

Sessions last eight hours. Passwords and session tokens are stored as hashes. `npm run staff:create` supports `GATE`, `ADMIN`, and `SUPERADMIN`; gate/admin accounts are added to the Fluxora partner membership and SuperAdmin is stored as a platform role. SuperAdmin-only operations use `/api/staff/admin/*`; partner catalogue operations are scoped under `/api/staff/partners/:partnerId/admin/*`. Gate validation requires both `qrToken` and `eventId`; gate staff also need an event assignment. Admin changes write to `AdminAudit` with partner scope. Capacity cannot be reduced below sold plus reserved inventory. Confirmed payments received after the inventory hold ends enter `REFUND_PENDING` without issuing tickets; SuperAdmins can review them at `GET /api/staff/admin/refund-review`. After refunding through the provider dashboard, record its reference with `POST /api/staff/admin/orders/:orderId/refund-confirmed` to close the local order. Fluxora does not automate provider refunds.

Ticket email delivery uses a database outbox and the Brevo transactional email API. Configure `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` to enable it; optional values are shown in `.env.example` and deployed with environment-specific `FLUXORA_DEV_BREVO_*` / `FLUXORA_PROD_BREVO_*` variables. Until configured, delivery stays queued while tickets remain available through the private order endpoint. Retries use bounded exponential backoff; a SuperAdmin can requeue a failed delivery with `POST /api/staff/admin/orders/:orderId/ticket-delivery/retry`. QR values are bearer credentials, so recipients should keep the email private. Email is delivered at least once if the provider response is ambiguous, so rare duplicate delivery is possible.

Partner administrators can manage event gate assignments through `GET /api/staff/partners/:partnerId/admin/events/:eventId/gate-staff`, `POST` to the same path with `{ "staffId": "..." }`, and `DELETE /api/staff/partners/:partnerId/admin/events/:eventId/gate-staff/:staffId`. The account must be an active `GATE` member of that same partner. SuperAdmins can use the equivalent paths below `/api/staff/admin/events/:eventId/gate-staff`.

Partner membership management is available below `/api/staff/partners/:partnerId/admin/memberships`: `GET` lists memberships, `PUT /:staffId` upserts an existing staff account with `{ "role": "ADMIN|EVENT_MANAGER|GATE" }`, and `DELETE /:staffId` deactivates membership and removes that partner's event gate assignments. Only a SuperAdmin using a partner-scoped route may assign `OWNER`; deleting the final active owner returns `409`. This API does not create/invite staff accounts or reset passwords.

Event-scoped operations are also available below `/api/staff/partners/:partnerId/admin/events/:eventId`: `GET /orders` provides paginated order and admission status data without buyer email, phone, payment provider details, or QR tokens; `GET /check-in-summary` returns ticket status totals grouped by performance. These endpoints inherit the partner check from the event lookup. Revenue is intentionally not allocated per event because a same-partner order may include multiple events and the settlement/fee model remains undecided.

The initial versioned partner integration API is mounted at `/api/v1`. Authenticate with `Authorization: Bearer <key>`; `GET /api/v1/events` and `GET /api/v1/events/:slug` return only the active key's partner catalogue. Checkout integrations use `POST /api/v1/checkout/quotes`, `POST /api/v1/checkout/orders` with `Idempotency-Key`, `POST /api/v1/checkout/orders/:id/payment`, and `GET /api/v1/checkout/orders/:id` with the quote access token as Bearer authorization. Create keys with scopes `events:read`, optionally `checkout:create` and `orders:read` (the last requires checkout scope). Partner owners/admins manage credentials at `/api/staff/partners/:partnerId/admin/api-keys`: `GET` lists metadata, `POST` with `{ "name": "...", "scopes": ["events:read", "checkout:create", "orders:read"], "expiresAt": "optional ISO date" }` creates a key and returns its token once, and `DELETE /:keyId` revokes it. Create a replacement before revoking the old key to rotate. Keys are SHA-256 hashed at rest; a process-local limit of 120 requests per minute per key is applied. Distributed quotas and webhook signing remain unimplemented.
