# Fluxora ticketing — Phase 2: multi-partner platform

**Status:** In progress — tenant foundation and partner API checkout slice; dev API deployed with quota reporting, QRIS disabled
**Owner:** Fluxora platform  
**Purpose:** Extend Fluxora from a single-platform concert ticket backend into a multi-tenant ticketing platform with platform administration, partner event management, customer ticket sales, and a reusable API for other event organizers.

### Current progress

- [x] Add the initial Fluxora-owned partner and required event ownership with a forward migration.
- [x] Add partner memberships, platform-role storage, event-staff assignments, hashed partner API-key storage, and partner-scoped audit fields. Existing staff are backfilled as Fluxora partner members; no existing account is granted SuperAdmin by the migration.
- [x] Enforce platform SuperAdmin vs partner membership on staff catalogue routes, restrict gate scans to assigned events, scope audits by partner, exclude inactive partners from public catalogues and checkout, and limit each checkout to one partner.
- [x] Add partner-scoped gate assignment list/create/remove endpoints; assignments require an active gate member belonging to the event's partner and are audited.
- [x] Add partner-scoped membership list/upsert/deactivate endpoints for existing staff accounts, including owner safeguards and cleanup of gate assignments on deactivation.
- [x] Add event-scoped paginated order/admission views and per-performance ticket/check-in counts with buyer contact, payment-provider details, and QR credentials excluded.
- [x] Add `/api/v1` partner-key authentication for tenant-scoped event catalogue and checkout/order/payment routes; add scoped one-time key creation, metadata listing, revocation, expiry, audit records, and a basic per-key rate limit.
- [x] Document the implemented partner API v1 authentication, scopes, catalogue, checkout, idempotency, response, and error contract in `docs/api/partner-v1.md`.
- [x] Replace the in-process partner API throttle with a per-key PostgreSQL fixed-window quota shared across API instances; allow partner admins to configure 1–600 requests/minute per key.
- [x] Add partner webhook subscription management, encrypted secret storage/rotation, transactional event fan-out, signed deliveries, stable dedupe IDs, bounded retries, delivery history, and manual replay; document receiver signature/replay checks.
- [x] Add atomic partner API-key rotation with immediate revocation or bounded overlap, preserve scopes/quota/expiry by default, and return replacement secrets once.
- [x] Provide partner-scoped staff API CRUD for events, performances, ticket types, and bundles; quote/order item snapshots preserve the purchased names, prices, and bundle composition.
- [x] Add SuperAdmin APIs to list/create/inspect partners, update partner status, assign existing staff as owners, and search platform audit records.
- [x] Add SuperAdmin API quota visibility with per-key current-minute and prior-hour usage, rate-limit estimates, partner/key status, pagination, and 24-hour request-window retention.
- [x] Add a redacted SuperAdmin operational queue snapshot for email/webhook deliveries, refund-review orders, overdue payments, and expired reservations.
- [x] Implement and compile host-aware staff sign-in/session/logout screens with HttpOnly-cookie requests for the admin and partner portal hosts.
- [x] Implement the initial SuperAdmin workspace: partner list/create/activate/suspend, partner counts, API quota summary, and operational queue cards.
- [x] Implement the initial partner workspace: active manager membership selection and read-only event/performance/ticket-type/bundle catalogue summary.
- [x] Add partner-scoped event, performance, ticket-type, and bundle creation forms; event dates retain the operator's IANA timezone and bundle components are constrained to the selected event catalogue.
- [x] Add partner-scoped edit forms for event details/status, performance schedule/status, ticket price/capacity/active state, and bundle name/code/price/active state; ticket capacity cannot be lowered below sold plus reserved inventory and server conflicts appear in the portal. Bundle composition stays fixed to preserve saved order snapshots. Frontend production build succeeds.
- [x] Add partner member list, role assignment/deactivation, and event gate assignment/removal controls; restrict membership changes to owners/admins in both UI and API, keep OWNER assignment SuperAdmin-only, and scope gate assignments to active partner GATE members. Frontend and backend builds succeed.
- [x] Add owner/admin-only partner-scoped staff account search by partial email match, limited to 20 active accounts and returning only assignment-relevant fields.
- [x] Build the first public customer storefront slice: published event discovery/detail, single-event ticket/bundle selection, server quote and reservation, idempotent order creation, and payment-session request. Pending QRIS is presented as pending; full wallet/recovery and payment refresh remain open.
- [x] Add SuperAdmin partner detail view, existing-staff owner assignment, and partner-filtered audit search using the existing protected APIs; frontend production build succeeds.
- [x] Add seven-day single-use staff invitations with hashed token storage, concurrent-safe create/resend/accept/revoke, first-account password setup, audited acceptance, and one-time manual delivery links; keep invitation tokens out of server request URLs. Invitation preview also explains that a PENDING partner must be activated before workspace access.
- [ ] Verify both workspaces using provisioned SuperAdmin and partner accounts; a SuperAdmin session and partner accounts are not yet available in the fresh dev database.
- [x] Apply all 10 Prisma migrations to the fresh vm01 dev database and deploy the dev API privately at `10.10.0.2:5102`; `/healthz`, `/readyz`, and migration status are healthy/current. A restricted pre-migration dev dump is stored on vm01. QRIS remains disabled.
- [x] Deploy the quota reporting revision to dev; health/readiness are healthy and the endpoint requires staff authentication (`401` without a session).
- [x] Deploy the operational queue snapshot to dev; readiness is healthy and both SuperAdmin monitoring endpoints reject requests without staff authentication (`401`).
- [x] Add and run backend unit tests for ticket QR signature/tamper checks, webhook SSRF target validation, and RajaOngkir QR session/amount/config validation (4 passing). Backend and frontend builds/type-checks and Prisma schema validation pass. The local `localhost:5439` database is unavailable, so database-backed tenant acceptance tests remain pending.
- [x] Recheck the deployed dev API from vm01: `/readyz` returns `200 ready` and unauthenticated SuperAdmin partner listing returns `401`.
- [ ] Verify quota report fields and SuperAdmin authorization with a provisioned authorized dev account; no SuperAdmin session is currently available in the fresh dev database.
- [ ] Verify operational queue counts and SuperAdmin authorization with a provisioned authorized dev account; no SuperAdmin session is currently available in the fresh dev database.
- [ ] Verify tenant backfills against a restored database containing existing sales data and complete the authorization review before onboarding an external partner; fresh dev has no legacy rows.

## 1. Product brief

Fluxora will operate four distinct surfaces:

| Surface | Hostname | Main users | Main responsibilities |
|---|---|---|---|
| Fluxora SuperAdmin | `admin.fluxorastudio.id` | Fluxora platform operators | Create/suspend partners, invite partner admins, configure platform-wide controls, inspect audit and platform health. |
| Partner dashboard | `partner.fluxorastudio.id` | Event partners and their staff | Manage owned events, performances, ticket types, bundles, event staff, orders, and sales reports. |
| Customer ticket storefront | `ticket.fluxorastudio.id` | Ticket buyers | Discover events, select tickets or bundles, pay by QRIS, access tickets, and present QR codes at the event. |
| Partner/API integration | `api-ticket.fluxorastudio.id` | Partner systems and approved clients | Versioned, tenant-scoped API to publish/read event catalogues and create customer checkouts/orders. |

The required relationship is **one partner → many events → many performances and ticket types**. A partner can define bundles for an event. A bundle has one displayed price and contains one or more ticket-type quantities; a paid bundle issues a separate redeemable ticket for each admission in its saved bundle composition.

The Phase 1 backend models events, performances, ticket types, bundles, checkout, QRIS, tickets, gate scans, staff accounts, and event administration. Phase 2 has added partner ownership and scoped staff/API access while preserving existing order and ticket snapshots. The deployed development API still uses a staged `dev-api-eticket` hostname; the production API must align with the requested `api-ticket.fluxorastudio.id` after hostname ownership, DNS, and TLS are confirmed.

## 2. Architecture and tenant boundaries

### Tenant model

- **Partner:** a tenant/organizer record with legal/display name, contact details, status (`PENDING`, `ACTIVE`, `SUSPENDED`), configurable branding, and timestamps.
- **User:** a person who can sign in to platform or partner administration. Avoid a separate login system per partner.
- **PartnerMembership:** joins users to partners and assigns partner-scoped roles. A user may belong to more than one partner if the product supports agencies or shared operators.
- **PlatformRole:** grants Fluxora-only SuperAdmin privileges. Platform roles are global and must never be inferred from a partner membership.
- **Event.partnerId:** each event has exactly one owning partner. Performances, ticket types, bundles, orders, tickets, and reports inherit tenant ownership through their parent event/order.
- **API credential:** an integration key belongs to exactly one partner and contains explicit scopes, creation/last-used/expiry/revocation metadata, and a stored hash. Never store or return a plaintext key after creation.
- **AdminAudit:** include the acting user and partner/platform scope on every administrative mutation. Keep payment/provider secrets and customer QR values out of audit payloads.

All partner API requests must be authorized against the authenticated membership/key's `partnerId`; a client-supplied partner ID, event ID, slug, or header is never proof of tenant access. Apply tenant filters in the database query itself, including nested relation reads and writes. Avoid loading an object by ID and relying only on a later UI check. Public event reads may expose published catalogue data, but private order, attendee, payout, staff, and scan information stays tenant-scoped.

### Roles

- **Fluxora SuperAdmin:** manage partners, partner administrators, platform settings, account suspensions, integration controls, platform-level audit, and support escalations.
- **Partner Owner/Admin:** manage that partner's organization membership and all of its events/catalogue/orders.
- **Partner Event Manager:** manage assigned event details, performances, ticket inventory, bundles, and sales information.
- **Gate Staff:** validate/check in tickets for explicitly assigned event(s); cannot administer events, users, payment settings, or other partners.
- **Integration API key:** machine identity with partner scope and explicit read/checkout scopes; it cannot access a dashboard session or gate operations.
- **Customer:** guest checkout by default using the current high-entropy quote/order access token. Customer accounts are optional and require a separate product decision.

Replace the Phase 1 global `StaffRole` assumption with a migration that preserves existing accounts and assigns them deliberately. Do not promote all existing staff to SuperAdmin. Establish the initial Fluxora SuperAdmin through a one-time, audited bootstrap command or controlled migration, then disable the bootstrap path.

## 3. Hostnames and applications

Keep the three browser applications separate at the routing/configuration level, even if a shared frontend component package is used:

```text
apps/
  superadmin/     # admin.fluxorastudio.id
  partner/        # partner.fluxorastudio.id
  customer/       # ticket.fluxorastudio.id
backend/          # API and workers; api-ticket.fluxorastudio.id
```

Each dashboard calls the API over HTTPS with credentialed requests and a narrowly configured CORS allowlist. Staff session cookies remain HttpOnly, Secure in production, SameSite=Lax, and host-only to the API host; never broaden cookie scope to `.fluxorastudio.id` merely to share a session across dashboards. Verify browser CORS/CSRF behavior for the actual dashboard origins.

Use `/api/v1` for partner integrations and stable customer-facing API contracts. Keep dashboard-only operations under `/api/platform/v1` and `/api/partner/v1` (or an equivalently clear route split). Public discovery and checkout can remain under `/api/v1`. Do not rely on different hostnames alone for authorization: every route still checks identity, scope, and tenant ownership.

Update DNS, certificates, public Nginx vhosts, frontend build origins, API CORS configuration, monitoring, and deployment documentation for all four hosts. Keep dev/staging equivalents separate from production, for example `dev-admin`, `dev-partner`, `dev-ticket`, and `dev-api-ticket`, after confirming DNS conventions.

## 4. Partner event and ticket management

Partner users can:

1. Create and edit events owned by their partner, including slug, descriptions, artwork, venue, timezone, and publication status.
2. Add multiple performances/sessions to an event with sale and check-in windows.
3. Create multiple ticket categories for each performance with integer IDR pricing, capacity, sale window, per-order limits, and active state.
4. Create bundles for an event with a single price and a fixed list of ticket types and quantities. Validate that all components belong to that same partner and event.
5. Pause sales or archive an event without altering saved quote/order snapshots, existing paid tickets, or inventory counters.
6. View their own order/sales summaries and event check-in totals. Restrict buyer PII and detailed payment references to authorized roles.

Bundle rules for the proposed MVP:

- Bundle composition is fixed at purchase and copied to immutable quote/order snapshots.
- One bundle purchase reserves its bundle capacity (if configured) and every included ticket-type capacity atomically.
- Component availability caps how many bundles can be sold; no overselling either the bundle cap or a component category.
- One paid bundle issues an independent QR ticket for each included admission; each ticket is checked in exactly once.
- Do not allow cross-partner or cross-event bundles in the MVP.
- Price is a single server-controlled bundle price. Define whether price may be above or below the sum of component prices and how partner revenue is reported.
- Until the merchant/settlement decision is approved, a cart/order may include events from only one partner. Cross-partner checkout needs an explicitly approved settlement and refund model.

Assigned seating, seat maps, partial bundle redemption, attendee-name allocation, transfers, coupons, and partner-specific refund execution are not included in the first multi-partner milestone unless explicitly prioritized.

## 5. SuperAdmin platform operations

The SuperAdmin dashboard should provide:

- Partner onboarding: create partner, invite the first owner/admin, activate/suspend the tenant, and retain a reason/audit entry for state changes.
- Partner overview: event counts/status, order/sales totals, active integrations, recent security/audit events, and operational health.
- Platform controls: allowed payment methods/providers, platform-wide limits, fee configuration (only after commercial/legal approval), email/provider health, and incident state.
- Support tools: search by partner/event/order number and inspect redacted payment/order state. Any exceptional action (such as manual payment/refund reconciliation) requires a reason, privileged role, request ID, and immutable audit record.
- No silent impersonation. If support impersonation is later required, show a persistent banner, require a reason, expire it quickly, record both the operator and the partner identity, and disable sensitive financial actions.

SuperAdmin must not use a normal partner membership to acquire global access. Require MFA for platform administrators before production launch; partner MFA can be phased according to risk and partner onboarding needs.

## 6. Reusable API for other event organizers

The `api-ticket.fluxorastudio.id` API lets an approved external event organizer use Fluxora's catalogue, checkout, QRIS, and ticket issuance instead of building those systems itself. A key is issued to one partner, carries limited scopes, can be rotated/revoked, and is rate-limited per partner and per key.

Proposed initial API surface:

- `GET /api/v1/events` and `GET /api/v1/events/:slug` — published event data only.
- Partner-scoped management endpoints to create/update the partner's events, performances, ticket types, and bundles.
- `POST /api/v1/checkout/quotes`, `POST /api/v1/checkout/orders`, and payment/status routes — customer checkout, with request idempotency and tenant-derived ownership.
- Signed partner webhook subscriptions for order paid, expired, refund-review, and ticket-issued events; retry with bounded backoff and event IDs for deduplication.
- API key create/list/revoke/rotate for partner owners through the partner dashboard, with a one-time display of the new secret.

API rules:

- Authenticate server-to-server integrations using hashed, revocable keys. Do not accept API keys in query strings or browser code.
- Require a stable `Idempotency-Key` on order/payment creation. Scope uniqueness to the partner as well as the key, and reject cross-tenant replay.
- Apply per-key/per-partner quotas, burst limits, payload limits, request IDs, and redacted audit logs.
- Version the API; document error codes, pagination, rate limits, webhook signing/rotation, retry semantics, and deprecation windows before issuing external credentials.
- Do not expose internal database IDs as authorization. Resource identifiers are references only; tenant authorization is checked every time.
- External partner payment collection and settlement ownership must be explicitly configured. Do not let an API client provide an arbitrary merchant QRIS ID or payment provider credential.

## 7. Payment, fees, and partner settlement decisions

The current Phase 1 QRIS adapter assumes Fluxora configures the RajaOngkir account and QRIS merchant identifier. Multi-partner operation must define who owns the QRIS merchant account and receives the funds before enabling partner sales.

Decision points before finalizing payment schema/API:

1. **Platform merchant:** all funds settle to Fluxora and Fluxora pays partners later; this needs an auditable partner ledger, payout lifecycle, reconciliation, commission/fee rules, and a legal/accounting review.
2. **Partner merchant:** each partner supplies approved merchant/QRIS configuration; secret storage, merchant onboarding, provider ownership, refund behavior, and status reconciliation are partner-scoped.
3. **Provider marketplace/split settlement:** use only if RajaOngkir/provider contract supports the required split and the merchant agreement permits it.

Never assume that a platform QRIS can legally or operationally collect for every partner. Until the settlement model is decided and provider-tested, Phase 2 should support one clearly identified platform merchant and keep partner payouts out of scope. Do not calculate or expose platform commissions as a payable balance until approved.

## 8. Proposed schema changes

Plan a forward migration with a data-preserving ownership strategy:

```text
Partner
User (or a phased extension of StaffUser)
PartnerMembership (userId, partnerId, role, event scope if needed)
PlatformRole / platform privilege assignment
PartnerApiKey (partnerId, keyHash, prefix, scopes, lastUsedAt, expiresAt, revokedAt)
PartnerWebhookEndpoint + WebhookDelivery
Event.partnerId
EventStaffAssignment (if gate staff need event-specific scope)
AdminAudit.actorUserId + partnerId/platform scope
```

Update event slug uniqueness to the agreed public URL rule (global slug or partner-prefixed route), and add tenant-oriented indexes. Add partner scope to every future financial/operational ledger row that cannot safely infer ownership through immutable parent relations. Keep existing `Order`, `OrderItem`, `Ticket`, and provider history immutable and traceable through their owning event/partner.

Migration/backfill sequence:

1. Create one explicit `Fluxora` platform-owned partner for existing Phase 1 events.
2. Add nullable `Event.partnerId`, backfill every existing event/order/ticket chain to that partner, and check for orphan records.
3. Add the foreign key and make `partnerId` required after validation.
4. Convert existing gate/admin users into explicit memberships or inactive legacy accounts; create the first platform SuperAdmin by controlled bootstrap.
5. Add tenant-safe indexes/unique constraints and verify every order/ticket resolves to exactly one partner.
6. Deploy compatibility code, migrate, verify row counts/ownership, then remove temporary legacy authorization paths in a later release.

Take a restorable backup before each production migration. Do not run tenant backfills directly against production until they have been exercised on a restored copy of production data.

## 9. Security and operational requirements

- Enforce partner scope in query/service-layer helpers, not only Express route middleware.
- Add automated cross-tenant denial coverage for every resource family: event, performance, ticket type, bundle, order, payment, ticket, staff, API key, webhook, and report.
- Require strong authentication and MFA for SuperAdmin, role-scoped staff sessions, session revocation on suspension/password change, and an auditable invite/reset flow.
- Protect cookie-authenticated mutations with strict Origin checks and CSRF defenses appropriate to the final browser/app origins.
- Keep API secrets, QR tokens, buyer PII, and payment instructions out of logs and analytics. Encrypt provider credentials at rest if partner-scoped secrets are introduced.
- Add API and worker health/metrics, per-partner rate-limit dashboards, provider/mail error alerts, payment reconciliation queue visibility, and outbox/webhook retry administration.
- Define data export/deletion/retention, partner contract termination, chargeback/refund, fraud review, incident response, and customer support procedures.
- Separate dev/staging/prod databases, hostnames, payment accounts/keys, email settings, and API key issuers.

## 10. Delivery phases and status

### Phase 0 — Product and money-flow decisions

- [ ] Confirm hostnames and ownership: DNS administrator, TLS/certificate automation, API proxy owner, dev/staging naming, and the `api-eticket` to `api-ticket` transition.
- [ ] Confirm tenant operations: partner onboarding evidence, approval/activation steps, suspension reason and recovery, and who can assign a partner owner.
- [ ] Confirm identity rules: whether staff can join multiple partners, role grants, event-scoped manager/gate assignments, invitations, password recovery, and SuperAdmin MFA.
- [ ] Choose merchant of record and settlement owner; document QRIS account ownership, partner payout cadence, reconciliation source, and provider reporting.
- [ ] Decide commercial rules before ledger work: commissions, platform/service fees, tax display, refunds, chargebacks, cancellation policy, and financial approval roles.
- [ ] Confirm MVP ticket rules: guest checkout, general admission, fixed same-event bundle composition, one QR per admission, no transfers or partial redemption.
- [ ] Confirm attendee data and support policy: required attendee fields, who sees buyer PII, export permissions, retention/deletion, support lookup, and exceptional-action audit requirements.

### Phase 1 — Tenant-safe data foundation

- [x] Add the Partner model, required Event ownership, partner-oriented event index, and a migration that backfills existing events to the Fluxora-owned partner.
- [x] Extend StaffUser with platform-role storage and add partner memberships, event-staff assignments, partner API key hashes/scopes, and partner-scoped audit records; backfill existing staff memberships without granting SuperAdmin.
- [x] Scope catalogue administration by partner membership, separate platform SuperAdmin access, require event assignment for gate scans, and derive checkout ownership on the server.
- [ ] Restore a representative database backup to an isolated verification database; record source backup, restore time, and row counts.
- [ ] Verify every existing event resolves to exactly one partner, every order resolves through its event items, and every ticket resolves to its paid order/event; report and resolve orphan rows.
- [ ] Verify existing staff membership backfill and gate assignments without granting SuperAdmin; review inactive and duplicate membership cases.
- [x] Complete a static tenant-scope source review for event, performance, ticket type, bundle, order, payment, ticket, membership, API key, webhook, gate assignment, and report routes; record the reviewed access checks and verification boundaries in `docs/reviews/tenant-scope.md`.
- [ ] Add and run cross-tenant denial acceptance coverage for ID substitution, slug substitution, inactive partner/key, wrong scopes, and unauthorized staff roles before onboarding a second tenant.

### Phase 2 — SuperAdmin and partner administration

- [x] Build the first SuperAdmin portal slice: staff login/session/logout, partner list/create/activate/suspend, partner event/member counts, quota usage summary, and operations cards. Local frontend build succeeds.
- [x] Add SuperAdmin partner detail, existing-staff owner assignment, and partner-filtered audit search; frontend production build succeeds.
- [ ] Add MFA enrollment/recovery and review portal accessibility/loading/error states; validate the SuperAdmin workflows with an authorized account.
- [x] Build partner onboarding/account setup: invitation token lifecycle, expiry/replay protection, concurrent-safe first-owner password setup, invitation resend/revoke, audited acceptance, and clear pending-activation guidance.
- [ ] Configure automated invitation email delivery and the production partner-portal invitation origin; until then an administrator must deliver the one-time link securely.
- [x] Build the first partner portal slice: staff login/session/logout, active management-partner selector, and event/performance/ticket-type/bundle catalogue summary.
- [x] Add create forms for events, performances, ticket types, and fixed-composition bundles, posting only to the selected partner's scoped routes. Frontend production build succeeds.
- [x] Add edit forms and lifecycle controls for events, performances, ticket types, and bundles using tenant-scoped PATCH routes; event archive, performance pause/close, and ticket/bundle pause are available. Ticket capacity edits respect sold/reserved inventory, and server conflict messages are surfaced. Bundle composition remains fixed. Frontend production build succeeds.
- [x] Add sales-window and per-order-limit controls for ticket types and bundles, check-in window controls for performances, and nullable bundle capacity editing through the existing scoped PATCH routes; API chronology and inventory checks remain authoritative. Frontend and backend builds succeed.
- [x] Add partner membership/role management and event gate assignment UI with role-aware controls; membership edits require owner/admin, OWNER assignment requires SuperAdmin, event managers can assign gate staff, and gate choices are limited to active GATE memberships.
- [x] Add partner-scoped active staff account search by email for owners/admins; return at most 20 minimal account records and show partner membership state in the assignment selector.
- [x] Add invitation-based onboarding so SuperAdmins can provision a partner account without an existing staff login or account ID; new users set a password when accepting the invitation.
- [ ] Verify create/edit flows against provisioned partner accounts, including cross-tenant denial and bundle component validation.
- [x] Add single-use expiring staff invitation tokens, rate-limited preview/accept endpoints, neutral invalid-token responses, atomic acceptance, concurrent-safe admin lifecycle operations, and session creation after acceptance.
- [ ] Add password recovery/change with session revocation, shared production rate limits, and automatic Brevo invitation delivery.
- [x] Move event/performance/ticket-type/bundle CRUD into partner-scoped APIs and preserve immutable checkout snapshots. Partner portal create/edit controls, partner member/gate assignment UI, and invitation token lifecycle are implemented; automated invite email and password recovery remain pending.
- [x] Build a paginated partner event order/admission view and check-in summary using existing scoped APIs; omit QR bearer credentials and buyer contact fields. Frontend production build succeeds.
- [ ] Add buyer PII to order details only after approved role/field policy; provide a restricted, audited detail view if approved.
- [ ] Add attendee export with explicit fields, permission check, audit record, and documented retention; block financial/revenue totals until settlement and fee rules are approved.

### Phase 3 — Customer ticket storefront

- [x] Build host/path-aware customer event discovery and event detail pages from the public catalogue API, showing published events, on-sale performances/ticket types, bundles, availability, and IDR pricing. Frontend production build succeeds.
- [x] Add a responsive single-event cart for multiple ticket types and fixed bundles; show bundle admission quantities, per-order limits, and server-calculated quote totals. Each cart is limited to one event and therefore one partner.
- [x] Connect quote creation, inventory reservation, order creation with a stable per-quote idempotency key, initial order status, and payment-session request. Quote, sold-out, and unavailable-provider errors are shown; a pending order is never presented as paid.
- [x] Add private-token order status refresh and payment-expiry display; status is retrieved from the backend and bearer credentials are kept out of URLs.
- [x] Add automatic order-status polling while an order is pending and a live payment-expiry countdown; frontend production build succeeds.
- [ ] Add secure checkout recovery across reloads without exposing buyer access tokens, then complete a verified purchase walkthrough.
- [ ] Build private order access and a ticket wallet with no bearer QR in query strings, analytics, or public URLs; add a controlled resend/access recovery flow.
- [ ] Complete keyboard/screen-reader checks, Indonesian/English copy, IDR formatting, email delivery, and a purchase-to-gate walkthrough.

### Phase 4 — Partner API and webhooks

- [ ] Decide and publish the development API hostname; configure its DNS, TLS, reverse proxy, CORS origin, and API health monitoring.
- [x] Document the `/api/v1` contract, limits, errors, idempotency, key lifecycle, and webhook receiver guidance in `docs/api/partner-v1.md`; correct docs to match implemented webhooks and usage reporting.
- [ ] Publish the API contract on `api-ticket.fluxorastudio.id` after hostname ownership, DNS, and TLS are confirmed.
- [ ] Exercise key creation, one-time display, scope denial, quota `429`, expiry, revocation, immediate rotation, and bounded overlap from a separate organizer client.
- [ ] Exercise quote/order idempotency and partner isolation using valid, wrong-partner, expired, revoked, and insufficient-scope keys.
- [ ] Validate webhook HMAC/timestamp verification, event deduplication, secret rotation, retry schedule, dead-letter visibility, and manual replay with a receiver.
- [ ] Complete and document one organizer sandbox integration from event catalogue through checkout status and webhook receipt.

### Phase 5 — Settlement, deployment, and launch

- [ ] After merchant/fee decisions, implement the approved settlement/payout/refund ledger with immutable entries, idempotent provider references, and role-scoped adjustments.
- [ ] Reconcile ledger totals against provider settlement reports and document mismatches, chargeback handling, and refund evidence before partner payouts.
- [x] Apply the current migrations to the fresh dev database and deploy the dev API with isolated credentials; health/readiness verified. Separate dev/prod PostgreSQL containers and credentials are provisioned on vm01.
- [x] Implement SuperAdmin API quota usage and retain database request windows for 24 hours.
- [x] Implement SuperAdmin operational queue counts and oldest due email/webhook timestamps without exposing buyer or secret data.
- [x] Implement and build the initial SuperAdmin and partner portal UI against the existing staff session/admin APIs.
- [x] Deploy the quota-observability revision to dev and confirm the unauthenticated request is denied.
- [x] Deploy operational queue visibility to dev; readiness is healthy and unauthenticated access is denied.
- [ ] Verify the SuperAdmin-only report response with a provisioned authorized dev account.
- [ ] Verify queue counts and oldest-due timestamps with a provisioned SuperAdmin account.
- [ ] Configure dev database backup schedule and off-VM copy/retention; document restore commands and perform a restore drill.
- [x] Inspect vm01 backup scheduling read-only: no Fluxora backup directory or database backup cron job exists; host telemetry is the only user cron entry. The off-VM target and retention policy are still needed before scheduling copies.
- [ ] Configure API/worker/database/host alerts, define quota threshold review and responder, and document deployment rollback steps.
- [ ] Reconcile the staged `*-eticket` dashboard/API hostnames with the requested `admin`, `partner`, `ticket`, and `api-ticket` domains; confirm DNS/TLS ownership and CORS origins.
- [x] Deploy and verify the dev storefront/dashboard frontend at `10.10.0.2:8093` and API at `10.10.0.2:5102`; frontend responds `200`, API `/readyz` responds `200`, and unauthenticated SuperAdmin access responds `401`. API uses the isolated dev database and provider remains disabled.
- [ ] Install and verify the approved public dashboard/storefront/API hostnames; production migration and API deployment remain pending.
- [ ] Complete provider sandbox purchase, callback reconciliation, ticket email, late-payment refund-review, and end-to-end gate validation.
- [ ] Complete cross-tenant security review, operational runbooks, incident/refund support training, and production readiness review.
- [ ] Launch production domains and onboard the first external partner only after product, provider, security, backup, and operational gates pass.

## 11. Phase 2 acceptance criteria

- A partner can own multiple events; each event can have multiple performances, ticket categories, and fixed-price bundles.
- Partner A cannot read, update, sell, scan, export, or infer Partner B's private resources by changing IDs, slugs, headers, or API keys.
- A SuperAdmin can onboard/suspend a partner; a partner admin cannot access platform controls or another partner.
- A partner API key is shown once, stored only as a hash, scoped to one partner, rate-limited, rotatable, revocable, and unusable for dashboard/gate login.
- A bundle reserves every component and bundle cap atomically; successful payment creates the exact number/type of independent QR tickets from the immutable order snapshot.
- Customer checkout can buy multiple ticket types and bundles for one partner without trusting client prices or tenant IDs. Cross-partner checkout stays disabled until the settlement model supports it.
- Payment collection, settlement ownership, fees, and refunds are visible and auditable according to the approved merchant model; no ticket is issued from unverified provider state.
- Partner webhook receivers can validate signatures, deduplicate events, observe retries, and rotate secrets without exposing credentials.
- All four production hosts use HTTPS, correct CORS/origins, separate environment secrets, healthy deployment checks, and tested backup/restore/rollback runbooks.

## 12. Dependencies and open blockers

1. **Merchant/settlement model:** platform collection vs partner merchant accounts vs split settlement. This blocks multi-partner paid sales and payout schema.
2. **Tenant/user model:** confirm whether one user may belong to multiple partners and whether event managers/gate staff can be assigned per event.
3. **Public event URL:** choose global event slugs or partner-specific paths and determine whether partners need custom domains/branding.
4. **MVP commerce rules:** confirm fees, partner commission, bundle discount semantics, attendee assignment, customer accounts, refunds, transfers, seating, and partial redemption.
5. **Hostname/deployment ownership:** DNS/TLS for `admin`, `partner`, `ticket`, and `api-ticket`; decide migration/alias timing from Phase 1's proposed `api-eticket` hosts.
6. **Provider readiness:** RajaOngkir merchant settlement and refund support, callback identifier behavior, and Brevo sender verification still need real-account validation.
7. **Data migration:** confirm which Phase 1 seed/demo or real event data should belong to the initial Fluxora partner before tenant backfill.

Do not enable cross-partner paid sales or partner payouts while blockers 1 and 4 are unresolved. Do not issue partner API keys until tenant isolation, scopes, throttling, and audit coverage are implemented and reviewed.
