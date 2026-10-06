# Fluxora ticketing — Phase 2: multi-partner platform

**Status:** In progress — tenant foundation and partner API checkout slice  
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
- [ ] Verify ownership and membership backfills on a restored database, complete tenant-isolation acceptance coverage, and migrate/deploy the schema before onboarding any external partner. Partner-facing UI and production API quota controls remain pending.

## 1. Product brief

Fluxora will operate four distinct surfaces:

| Surface | Hostname | Main users | Main responsibilities |
|---|---|---|---|
| Fluxora SuperAdmin | `admin.fluxorastudio.id` | Fluxora platform operators | Create/suspend partners, invite partner admins, configure platform-wide controls, inspect audit and platform health. |
| Partner dashboard | `partner.fluxorastudio.id` | Event partners and their staff | Manage owned events, performances, ticket types, bundles, event staff, orders, and sales reports. |
| Customer ticket storefront | `ticket.fluxorastudio.id` | Ticket buyers | Discover events, select tickets or bundles, pay by QRIS, access tickets, and present QR codes at the event. |
| Partner/API integration | `api-ticket.fluxorastudio.id` | Partner systems and approved clients | Versioned, tenant-scoped API to publish/read event catalogues and create customer checkouts/orders. |

The required relationship is **one partner → many events → many performances and ticket types**. A partner can define bundles for an event. A bundle has one displayed price and contains one or more ticket-type quantities; a paid bundle issues a separate redeemable ticket for each admission in its saved bundle composition.

The Phase 1 backend already models events, performances, ticket types, bundles, checkout, QRIS, tickets, gate scans, staff accounts, and basic event administration. It does not yet model partners or tenant-scoped users, and its public API hostname was proposed as `api-eticket.fluxorastudio.id`. Phase 2 must add tenancy without breaking existing orders/tickets and should align the deployed API host with the requested `api-ticket.fluxorastudio.id` hostname.

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

- [ ] Confirm the requested hostnames, DNS/TLS owners, and dev/staging hostname pattern.
- [ ] Approve tenant/partner onboarding, partner roles, whether users can belong to multiple partners, and event-level gate assignments.
- [ ] Choose who is merchant of record and who receives QRIS settlement; define commissions, service fees, partner payouts, refunds, and chargebacks before adding a ledger.
- [ ] Confirm MVP policy: guest checkout, general admission, fixed same-event bundles, one QR per admission, no seating/transfers/partial redemption.
- [ ] Set partner data visibility, order/customer PII access, report/export, retention, and support-operator policy.

### Phase 1 — Tenant-safe data foundation

- [x] Add the Partner model, required Event ownership, partner-oriented event index, and a migration that backfills existing events to the Fluxora-owned partner.
- [x] Extend StaffUser with platform-role storage and add partner memberships, event-staff assignments, partner API key hashes/scopes, and partner-scoped audit records; backfill existing staff memberships without granting SuperAdmin.
- [x] Scope catalogue administration by partner membership, separate platform SuperAdmin access, require event assignment for gate scans, and derive checkout ownership on the server.
- [ ] Verify both backfills against a restored database containing existing events/orders/tickets and confirm there are no orphaned sales/tickets.
- [ ] Add and run the cross-tenant authorization acceptance suite before onboarding a second tenant.
- [ ] Add cross-tenant authorization tests before migrating existing event administration routes.

### Phase 2 — SuperAdmin and partner administration

- [ ] Build `admin.fluxorastudio.id` login/MFA, partner onboarding/suspension, owner invitations, and platform audit/search.
- [ ] Build `partner.fluxorastudio.id` tenant-scoped dashboard, staff invitations/account recovery, and membership UI; membership and gate-assignment APIs are available for existing staff accounts.
- [ ] Move event/performance/ticket-type/bundle CRUD into partner-scoped APIs and preserve immutable checkout snapshots.
- [ ] Build partner order/sales/check-in dashboard UI and attendee exports under approved PII rules; backend order/admission views and ticket/check-in counts are implemented. Event revenue reporting stays blocked on the merchant/settlement and fee allocation decisions.

### Phase 3 — Customer ticket storefront

- [ ] Build `ticket.fluxorastudio.id` event discovery, event pages, multi-performance ticket selection, bundle cart, and mobile-first checkout.
- [ ] Connect quote/order/payment/status flows; use idempotency and the existing private order access token.
- [ ] Build customer ticket wallet/detail view and resend/access-recovery flow without exposing ticket bearer QR values in analytics or public URLs.
- [ ] Complete accessibility, localization/currency formatting, order email, and purchase-to-gate acceptance walkthrough.

### Phase 4 — Partner API and webhooks

- [ ] Publish the complete versioned `/api/v1` contract and integration guide at `api-ticket.fluxorastudio.id`; initial read-only catalogue endpoints and key operations are implemented.
- [ ] Implement distributed quotas, production-grade key rotation/management and verify API idempotency and tenant isolation; current API supports `events:read`, `checkout:create`, `orders:read`, manual overlapping key rotation, expiry, revocation, audit, and a process-local rate limit.
- [ ] Add signed partner webhooks with delivery history, retries, dedupe IDs, secret rotation, and replay protection.
- [ ] Complete a sample external-organizer integration and verify tenant isolation under valid and invalid keys.

### Phase 5 — Settlement, deployment, and launch

- [ ] Implement only the approved settlement/payout/refund model and reconcile all partner balances against provider reports.
- [ ] Deploy dev/staging surfaces and APIs with isolated credentials, automated backups, monitoring, and rollback procedures.
- [ ] Complete cross-tenant security review, QRIS/Brevo sandbox flows, refund/manual-review operations, and support training.
- [ ] Launch production domains and onboard the first external partner only after approval gates pass.

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
