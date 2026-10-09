# Fluxora Platform Product Requirements Document

**Status legend:** `[DONE]` = implemented in this repository or explicitly verified in the target environment; `[NOT DONE]` = missing, awaiting a decision, or awaiting verification. A feature marked done in code may still be unavailable to customers until its deployment and operational prerequisites are complete.

**Last reviewed:** 2026-10-10  
**Product owner:** Fluxora Studio  
**Source of truth for scope:** this document. Deployment and provider runbooks remain the source of truth for operational commands and environment-specific state.

## 1. Product summary

Fluxora is a digital product studio and software platform. This repository currently contains two connected product areas:

1. **Fluxora Studio website** — a public company profile and lead-generation site that introduces Fluxora and its services.
2. **Fluxora Tickets** — an online concert ticketing product with a customer storefront, organizer/staff workspaces, gate check-in, and a partner integration API.

The ticketing system lets event organizers publish performances, ticket categories, and bundles; lets customers discover events and purchase admissions; and lets venue staff validate ticket QR codes at entry. The backend is authoritative for catalogue data, price, inventory, order and payment state, ticket issuance, and admission validation.

The repository contains substantial implementation for the ticketing product, but it is not yet production-ready end to end. Production API deployment/readiness, a current production storefront build, provider-account verification, reliable email delivery, backups/restore, and live operational validation remain open. This PRD distinguishes implementation completion from launch completion.

## 2. Product vision and outcomes

### Vision

Give Fluxora and its event partners a dependable, auditable path from event setup to paid ticket and verified admission, while presenting Fluxora Studio clearly to prospective clients.

### Product outcomes

- Prospective clients can understand Fluxora Studio's work and contact the company.
- Customers can find upcoming concerts, understand ticket options, complete a safe QRIS checkout, retrieve issued tickets, and enter the event with a QR scan.
- Organizers can manage their own catalogue and team without seeing or changing another partner's data.
- Platform operators can manage partners and investigate operational issues with audit trails.
- Integrators can use a scoped, versioned API and receive signed event webhooks.
- Payment and ticket state remain trustworthy when requests are retried, callbacks are duplicated, inventory expires, or a provider response is delayed.

### Success measures (to establish at launch)

The repository does not yet define operational targets or analytics baselines. The following measures are required before a public launch; numeric targets need product/operations approval.

| Measure | Definition | Status |
|---|---|---|
| Catalogue availability | Successful customer catalogue requests / total requests | `[NOT DONE]` Target and monitoring not established |
| Checkout completion | Confirmed paid orders / checkout attempts | `[NOT DONE]` Funnel instrumentation and baseline not established |
| Payment reconciliation | Provider-confirmed payment and local order state agree within the agreed reconciliation window | `[NOT DONE]` Sandbox and production-account behavior not verified |
| Ticket delivery | Issued tickets retrievable by customer; email delivery measured separately | `[NOT DONE]` Provider sender and delivery walkthrough pending |
| Check-in reliability | At most one successful admission per ticket, with every scan auditable | `[DONE]` Atomic online check-in and scan audit are implemented; load/offline behavior remains unverified |
| Tenant isolation | No partner can read or mutate another partner's records through staff or partner API routes | `[DONE]` Tenant scoping is implemented and reviewed; production security exercise remains pending |
| Studio lead conversion | Qualified inquiries / website visits | `[NOT DONE]` No analytics or CRM conversion workflow is evidenced in this repository |

## 3. Users and permissions

### Customer / ticket buyer

- Browses public events without an account.
- Selects tickets and/or bundles for one event and one partner per order.
- Provides a required email; first name, last name, and phone are optional in the current contract.
- May optionally opt in to receive news and promotional emails from the event organizer during checkout. This consent must not be required to buy a ticket.
- May receive periodic email reminders about an event they purchased tickets for. Reminder frequency, timing, and preference controls need to be defined before launch.
- Pays by the configured QRIS provider when enabled.
- Retrieves payment status and issued QR tickets through a private order access token.

### Gate staff

- Signs in to the staff portal.
- Scans or submits a ticket QR value with event and gate context.
- Sees accepted, already used, void, wrong event, outside check-in window, or unknown results.
- Can validate only events assigned to their active partner membership.

### Partner owner / administrator

- Manages their partner's events, performances, ticket types, bundles, sales settings, capacity, and gate staff.
- Manages memberships and invitations according to role permissions.
- Reviews event orders and admission totals without buyer contact details or ticket QR bearer values.
- Creates and rotates partner API keys and manages outbound webhook subscriptions.

### Event manager

- Manages the partner event catalogue and event-scoped operations allowed to the role.
- Does not receive platform-wide partner management powers.

### Platform SuperAdmin

- Creates and updates partners, assigns owners, reviews platform audit events and API usage, and inspects operational queues/refund review.
- Uses platform administration routes separate from partner-scoped management.

### External partner integration

- Authenticates with a partner-bound API key and assigned scopes.
- Reads its own active partner catalogue and, when granted checkout scopes, creates quotes/orders and reads order status using the private quote token.
- Receives signed webhooks without customer contact data, provider secrets, or ticket QR bearer values.

### Prospective client

- Visits the Fluxora Studio company site to learn about the studio and initiate a business inquiry.
- The repository provides the company-profile website; a connected CRM, lead form processing, and conversion measurement are not confirmed as implemented.

## 4. Product boundaries and decisions

### In scope for current ticketing v1

- Indonesian event catalogue and IDR-denominated pricing.
- Multiple events in the catalogue; one event and one partner per order.
- General-admission inventory, multiple performances, ticket types, and fixed-component bundles.
- Temporary inventory reservations, quote expiry, idempotent order creation, QRIS payment session creation and server-side reconciliation.
- One independently checkable ticket per admission, with QR credential issued only after verified payment.
- Email delivery through an outbox when configured, plus private order retrieval.
- Online gate check-in, staff roles, event assignments, and audit records.
- Partner-scoped staff operations, API keys/quotas, and signed outbound webhooks.

### Explicitly out of scope or not established

- Assigned seating / seat maps.
- A cart spanning multiple events or partners, split settlement, or partial fulfillment.
- Customer accounts, customer login, a persistent ticket wallet, or cross-device order recovery.
- Ticket transfer, loyalty, promotions, coupons, and multi-currency.
- Automated provider refunds; late confirmed payments without a live inventory hold enter manual refund review.
- Pending payment cancellation until provider cancellation and reconciliation semantics are verified.
- Offline gate validation and conflict resolution between offline scanners.
- Partner settlement statements and revenue allocation.
- CRM integration and a defined lead qualification workflow for the Studio site.

## 5. Functional requirements and status

### 5.1 Fluxora Studio public website

| ID | Requirement | Status |
|---|---|---|
| WEB-01 | Serve the Fluxora Studio company profile on the studio development and production hostnames. | `[DONE]` React/Vite site and deployment workflows/configuration exist. |
| WEB-02 | Clearly communicate Fluxora's identity as a digital product studio working across commerce, AI, logistics, and ticketing. | `[DONE]` Current site/repository description identifies these areas. |
| WEB-03 | Provide a usable path for prospective clients to initiate contact. | `[NOT DONE]` A verified lead submission / CRM handling path is not documented in the supplied implementation notes; confirm the current rendered site and desired contact destination. |
| WEB-04 | Support responsive layouts, keyboard navigation, semantic content, and accessible contrast. | `[NOT DONE]` No complete accessibility audit or acceptance evidence for the marketing site is recorded. |
| WEB-05 | Measure visits and lead conversion against approved privacy and analytics requirements. | `[NOT DONE]` No analytics baseline or measurement integration is recorded. |

### 5.2 Public event catalogue and detail

| ID | Requirement | Status |
|---|---|---|
| CAT-01 | List only public, published, eligible events from active partners. | `[DONE]` Public catalogue endpoint and customer UI are implemented. |
| CAT-02 | Show event name, venue, city, date range, image/fallback, and available ticket/bundle price context. | `[DONE]` Catalogue cards and event detail are implemented. |
| CAT-03 | Search by event/city, filter by city/date, and sort results. | `[DONE]` Implemented in the customer catalogue. |
| CAT-04 | Provide loading, retryable error, empty, and sold-out/closed states. | `[DONE]` Implemented in the catalogue/storefront flow. |
| CAT-05 | Provide reloadable event deep links and page metadata/canonical behavior. | `[DONE]` `/event/:slug` and storefront routing are implemented. |
| CAT-06 | Keep displayed availability advisory and revalidate selection through quote creation. | `[DONE]` Quote creation is authoritative. |
| CAT-07 | Make the public customer storefront available at `e-ticket.fluxorastudio.id`. | `[NOT DONE]` Gateway/DNS/TLS are reported live, but production frontend serves an older build; current catalogue availability has not been verified live. |

### 5.3 Checkout, payment, order recovery, and tickets

| ID | Requirement | Status |
|---|---|---|
| PAY-01 | Select ticket types and bundles from one event; reject unsupported cross-partner orders. | `[DONE]` Frontend constrains selections; backend enforces one-partner checkout. |
| PAY-02 | Collect required buyer email and optional contact fields. | `[DONE]` Checkout contract and UI support these fields. |
| PAY-03 | Generate server-priced quotes with item snapshots, total, expiry, and atomic inventory holds. | `[DONE]` Implemented with transaction-backed reservations. |
| PAY-04 | Create orders idempotently using an idempotency key and private quote access token. | `[DONE]` Implemented in storefront and API. |
| PAY-05 | Never trust browser state, redirects, or callbacks as proof of payment. | `[DONE]` Backend performs authenticated provider status reconciliation before settlement. |
| PAY-06 | Show QRIS instructions and pending/paid/expired/failed/refund-review/provider-unavailable states. | `[DONE]` UI and backend status paths are implemented. |
| PAY-07 | Poll pending orders at a bounded interval and provide manual refresh. | `[DONE]` Current UI polls every 15 seconds and exposes refresh. Backoff/`Retry-After` handling remains a follow-up. |
| PAY-08 | Recover a checkout after refresh in the same browser tab without exposing tokens in URLs or persisting ticket QR credentials. | `[DONE]` Tab-scoped storage is implemented; tokens are bearer credentials and remain sensitive to same-origin script access. |
| PAY-09 | Issue one valid QR admission per paid ticket only after verified settlement. | `[DONE]` Backend settlement and ticket issuance are transactional and idempotent. |
| PAY-10 | Deliver tickets by email and retain private API retrieval if email is unavailable. | `[DONE]` Outbox and Brevo adapter are implemented; `[NOT DONE]` sender/domain and end-to-end delivery walkthrough are pending. |
| PAY-10a | Offer a separate, unchecked-by-default, optional opt-in checkbox at checkout for news and promotional email from the event organizer. | `[NOT DONE]` Checkout consent capture and storage are not implemented. |
| PAY-10b | Record auditable consent evidence per customer and organizer, including the choice, timestamp, source/context, and consent text/version shown. | `[NOT DONE]` No consent record or consent history is implemented. |
| PAY-10c | Allow organizers to send news and promotional emails only to customers who opted in to that organizer's communications; provide unsubscribe and suppression handling. | `[NOT DONE]` Organizer campaign tooling, unsubscribe workflow, and suppression list are not implemented. |
| PAY-10d | Allow organizers to send periodic, event-related reminders by email to ticket purchasers, with timing/frequency controls and safeguards against duplicate or stale reminders. | `[NOT DONE]` Reminder scheduling, audience selection, and delivery tracking are not implemented. Define reminder preferences and opt-out behavior. |
| PAY-10e | Keep transactional messages (order confirmation, payment status, ticket delivery, and necessary event changes) distinct from reminders and promotional campaigns in purpose, templates, audience rules, and reporting. | `[NOT DONE]` Ticket delivery exists, but message categories and campaign/reminder systems are not modeled. |
| PAY-11 | Validate RajaOngkir QRISLY sandbox creation, callback identifiers, amount, expiry, status transitions, duplicates, and late payment behavior. | `[NOT DONE]` Account-specific sandbox walkthrough is pending. Keep payment disabled until completed. |
| PAY-12 | Automate refunds or provide documented operator workflow for refunds. | `[NOT DONE]` External manual refund confirmation is supported; provider refund automation and complete policy remain open. |
| PAY-13 | Support customer account, cross-device recovery, and a durable ticket wallet. | `[NOT DONE]` Explicitly deferred; current recovery is limited to the current tab and private order token. |

### 5.4 Organizer and staff operations

| ID | Requirement | Status |
|---|---|---|
| OPS-01 | Authenticate staff with secure HttpOnly sessions and logout/session inspection. | `[DONE]` Implemented; password/session values are hashed at rest. |
| OPS-02 | Enforce platform and partner roles and tenant scope on staff routes. | `[DONE]` Role checks and partner-scoped routes are implemented. |
| OPS-03 | Manage partners, status, ownership, audit history, usage, queues, and refund review as SuperAdmin. | `[DONE]` Implemented in backend and platform portal. |
| OPS-04 | Create/edit/archive events and manage performances, ticket categories, bundle definitions, capacity, sales windows, and limits. | `[DONE]` Implemented. Capacity cannot be reduced below sold plus reserved inventory; bundle composition is fixed after creation. |
| OPS-05 | Manage memberships, gate assignments, and event-scoped order/admission views. | `[DONE]` Implemented; the displayed order view omits buyer contact details and QR credentials. |
| OPS-06 | Invite partner staff with single-use, expiring invitations and accept onboarding in the portal. | `[DONE]` Backend invitation lifecycle and migration exist. `[NOT DONE]` Frontend readme still says invitation onboarding is not implemented, and invitation email delivery is not configured; verify current UI and close this documentation/status discrepancy. |
| OPS-07 | Record administrative mutations and check-in scans in audit records. | `[DONE]` Implemented. |
| OPS-08 | Validate check-in within event/performance windows and accept each ticket only once. | `[DONE]` Online atomic validation and result states are implemented. |
| OPS-09 | Operate gate scanning without connectivity. | `[NOT DONE]` No offline scanner or synchronization behavior is implemented/documented. |
| OPS-10 | Provide operator dashboard for event revenue and partner settlement. | `[NOT DONE]` Revenue allocation and settlement model remain undecided. |

### 5.5 Partner integration API and webhooks

| ID | Requirement | Status |
|---|---|---|
| INT-01 | Expose versioned partner API under `/api/v1` with partner-bound bearer API keys. | `[DONE]` Implemented. |
| INT-02 | Enforce scopes for catalogue read, checkout creation, and order read. | `[DONE]` Implemented; order reads also require private quote access token. |
| INT-03 | Create, rotate, revoke, and expire API keys; reveal secrets once and store hashes. | `[DONE]` Implemented. |
| INT-04 | Apply shared database-backed per-key request quotas and expose safe usage metrics to SuperAdmins. | `[DONE]` Fixed-window quotas and usage endpoint implemented. |
| INT-05 | Send signed partner webhooks with stable delivery IDs, retries, and replay support. | `[DONE]` Implemented with encrypted endpoint secrets, HMAC signatures, SSRF protections, bounded retries, and admin replay. |
| INT-06 | Publish and verify the partner integration hostname and validate a real external integration. | `[NOT DONE]` Docs contain differing proposed hostnames (`api-ticket` vs `api-eticket`); DNS/TLS publication and external integration are pending. Confirm canonical hostname before launch. |
| INT-07 | Expose partner settlement reports and cross-partner checkout. | `[NOT DONE]` Out of current v1 scope. |

### 5.6 Security, privacy, and accessibility

| ID | Requirement | Status |
|---|---|---|
| SEC-01 | Keep payment secrets, API key secrets, signing keys, and DB credentials out of source control and browser bundles. | `[DONE]` Configuration is environment-based; secrets are hashed/encrypted where appropriate. Deployment secret configuration still needs completion. |
| SEC-02 | Avoid leaking customer contact information and QR bearer tokens in public catalogue, partner event order lists, logs, or webhooks. | `[DONE]` Documented response boundaries and private order access are implemented. |
| SEC-03 | Use HTTPS for hosted customer, staff, and API routes with scoped CORS origins. | `[DONE]` Gateway HTTPS for customer hostname is reported verified; `[NOT DONE]` production API and all staff portal hostnames require deployment verification. |
| SEC-04 | Protect outbound webhook delivery from SSRF and authenticate payloads with timestamped HMAC. | `[DONE]` Implemented. |
| SEC-05 | Apply accessible labels, focus behavior, live error announcements, responsive behavior, and contrast to ticket storefront. | `[DONE]` Code review and contrast measurements are documented. `[NOT DONE]` Manual mobile and screen-reader verification remains. |
| SEC-06 | Define customer data retention, privacy notice, consent requirements, and incident response ownership. | `[NOT DONE]` No approved policy or evidence is recorded in this repository. |

## 6. Core user journeys

### Customer purchase journey

1. Customer opens the storefront and browses/searches/filter events.
2. Customer opens an event deep link and chooses a performance, ticket quantities, or bundle quantities.
3. Customer enters email and optional contact details.
4. Storefront requests a quote. The server validates current prices/sales windows and reserves all underlying inventory for 15 minutes.
5. Storefront presents the server-returned line items, totals, and expiry. Customer confirms order creation.
6. Storefront submits the quote and stable idempotency key. Backend creates or replays the order.
7. When provider configuration is enabled, storefront requests QRIS instructions and displays pending payment state and expiry.
8. Backend reconciles status with RajaOngkir. Only verified settlement marks the order paid and issues tickets.
9. Customer refreshes/polls private order status. Paid ticket QR values are shown in memory and email delivery state is displayed accurately.
10. At the venue, gate staff validates each ticket online. A ticket can be accepted once only.

Failure paths must communicate expired quote, unavailable inventory, unavailable provider, payment expiry/failure, late payment/refund review, and email delivery failure without claiming success prematurely.

### Partner event setup journey

1. A platform operator creates a partner and assigns an owner.
2. Partner owner/admin signs in or accepts an invitation, then manages partner memberships.
3. Partner creates an event, performances, ticket categories, and optional bundles; sets capacities, sale periods, and per-order limits.
4. Partner publishes the event. It appears in public catalogue when otherwise eligible.
5. Partner assigns gate staff to relevant events and reviews orders/admission summaries.
6. Partner optionally provisions API keys and webhook endpoints for its own integration.

### Gate admission journey

1. Assigned gate staff signs in using the staff portal.
2. Staff submits/scans a ticket QR value with event and gate context.
3. Backend verifies token signature, event ownership/assignment, ticket state, and check-in window, then atomically records a successful scan or a rejection.
4. UI displays a clear result; all attempts are auditable. No offline mode is currently provided.

## 7. Business rules and invariants

- Backend is the sole authority for price, inventory, payment, ticket issuance, and check-in.
- Currency is IDR and amounts use integer rupiah values.
- A quote holds inventory for 15 minutes; the payment/provider lifecycle and reservation expiry must be reconciled safely.
- One checkout contains one partner's inventory and the storefront is scoped to one event.
- Order creation uses an idempotency key. Safe retries for the same attempt reuse the original key.
- Bundle components consume the underlying ticket inventory and order snapshots preserve the purchase-time definition.
- Capacity cannot be lowered below sold plus reserved inventory.
- Payment is confirmed by authenticated server-to-server provider status lookup, not browser state or an unauthenticated callback.
- Tickets are issued once after verified payment. A late-confirmed payment without an active inventory hold is sent to manual refund review and issues no tickets.
- Each admission has its own independently checkable QR credential.
- A ticket is accepted at most once. Gate check-in requires event assignment and observes the configured check-in window.
- Customer order access tokens and ticket QR values are bearer secrets. They must not be placed in public URLs, analytics, or ordinary logs.
- Promotional consent is optional, organizer-specific, explicit, and recorded separately from transactional order processing. A customer who declines promotional consent can still purchase and receive necessary order/ticket communications.
- Promotional sends must use the organizer's eligible audience and respect unsubscribe/suppression state. Organizers must not access or export another organizer's customer audience.
- Event reminders are limited to customers with a purchase for the relevant event. Their frequency, timing, and preference rules must be configured before enabling them.
- Partner API keys are scoped to one partner; partner webhooks omit contact details and ticket QR credentials.
- API quota is a shared fixed-window quota; it is not burst shaping.

## 8. Non-functional requirements

| Area | Requirement | Current status |
|---|---|---|
| Reliability | Idempotent checkout, atomic reservations/settlement/check-in, bounded retries, health/readiness checks. | `[DONE]` Implemented; production reliability targets and load evidence remain `[NOT DONE]`. |
| Security | Least privilege, tenant isolation, secret protection, safe webhook handling, HTTPS, private order retrieval. | `[DONE]` Core controls implemented; live security review and complete hostname deployment remain `[NOT DONE]`. |
| Performance | Public catalogue and staff views should remain responsive under expected event/checkout load. | `[NOT DONE]` No approved workload model, latency target, or load-test result is recorded. |
| Accessibility | Customer and staff workflows should support keyboard and assistive technology. | `[NOT DONE]` Storefront code review is complete, but manual browser/screen-reader checks are pending; marketing/staff audits are not recorded. |
| Observability | Track health, queue backlog, payment reconciliation, email/webhook failures, disk, database, backup status, and actionable alerts. | `[NOT DONE]` Operational queue inspection exists; host alerts and named responders are pending. |
| Recovery | Encrypted backups stored off-host, tested restores, known recovery time and point objectives. | `[NOT DONE]` Backup schedule, off-VM retention, and restore drills are pending. |
| Compatibility | Support current evergreen desktop/mobile browsers and reliable reloadable event links. | `[NOT DONE]` Browser support matrix and manual compatibility verification are not recorded. |
| Localization | Indonesian date/time and IDR display for the initial customer experience. | `[DONE]` Indonesian locale formatting is implemented. |
| Privacy | Collect only checkout contact data needed for delivery/operations and prevent public disclosure. | `[DONE]` API/UI data minimization is implemented; formal retention/privacy policy remains `[NOT DONE]`. |

## 9. Deployment and release requirements

The public topology separates the studio frontend, ticketing storefront, staff portals, and ticketing API. Frontend GitHub Actions deployment does not deploy the API or install public gateway configuration. Development and production use distinct backend services and databases.

| Release item | Status |
|---|---|
| Studio site development and production frontend deployment paths | `[DONE]` Workflows and routing are documented. |
| Ticketing dev/prod API services, Compose configuration, isolated databases, migrations, health/readiness | `[DONE]` Dev API and database were reported ready; production API container is absent/readiness was reported 503 in the 2026-10-09 rollout notes. |
| Customer storefront DNS/TLS/gateway route | `[DONE]` Public HTTPS and gateway checks are reported complete. |
| Current ticket storefront build on production host | `[NOT DONE]` Production is reported to serve an older frontend asset build. |
| Production ticketing API deployment and migration | `[NOT DONE]` Deploy service, back up DB, apply migrations, verify readiness. |
| Staff portal hostnames and API routes | `[NOT DONE]` Verify DNS/TLS/gateway publication for admin and partner portals in each environment. |
| Payment provider sandbox and production credentials | `[NOT DONE]` Merchant account behavior, callback configuration, and approvals are unverified; keep payment disabled. |
| Brevo sender/domain and ticket email walkthrough | `[NOT DONE]` Configure and verify delivery and retry behavior. |
| Database backups, off-host retention, restore drills, operational alerts | `[NOT DONE]` Required before production launch. |
| External partner API host and integration verification | `[NOT DONE]` Canonical hostname is unresolved in docs; verify DNS/TLS and a real client flow. |

## 10. Acceptance criteria for public ticketing launch

Launch is complete only when all of the following are true:

- `[DONE]` A customer can browse eligible events, open a reloadable event URL, and choose available ticket/bundle inventory.
- `[DONE]` Quote totals and expiry come from the API; conflicts lead to a clear reselection flow.
- `[DONE]` Retried order creation uses the same idempotency key and does not duplicate orders.
- `[DONE]` Browser state cannot mark an order paid; only reconciled provider state settles an order.
- `[DONE]` Tickets are issued only after payment verification and each admission can be checked once.
- `[DONE]` Private checkout recovery avoids public URLs and does not persist ticket QR credentials.
- `[DONE]` Partner and platform routes enforce roles and tenant ownership; mutations and scans are audited.
- `[NOT DONE]` Latest customer storefront build is deployed and verified against production API.
- `[NOT DONE]` Production API is deployed, migrated after backup, and passes readiness and smoke checks.
- `[NOT DONE]` End-to-end provider sandbox scenarios pass for success, expiry, duplicate/out-of-order callbacks, wrong amount, and late payment.
- `[NOT DONE]` Brevo ticket delivery, retry, and customer recovery are verified.
- `[NOT DONE]` Consent capture, organizer-scoped campaign audiences, unsubscribe/suppression, reminder scheduling, and transactional/promotional message separation are implemented and verified.
- `[NOT DONE]` Backups are scheduled/off-host and restore drills succeed; host, database, worker, and queue alerts have owners.
- `[NOT DONE]` Manual responsive, keyboard, and screen-reader checks are complete for customer and staff workflows.
- `[NOT DONE]` Production inventory/events exist, payment enablement is explicitly approved, and a live transaction is reconciled end to end.
- `[NOT DONE]` Privacy/retention and incident response policies are approved and published where required.

## 11. Known gaps, decisions, and follow-up

1. **Payment enablement:** Complete merchant-specific sandbox validation and document QRIS ID/history ID formats, callback configuration, settlement ownership, amount/expiry semantics, and duplicate/out-of-order handling. Keep dev/prod payment disabled until approved.
2. **Production rollout:** Deploy current storefront, production API, and migrations; verify live catalogue and readiness. Production storefront currently serves old assets and API readiness was recorded as 503.
3. **Email:** Verify Brevo credentials, sender/domain, sandbox delivery, privacy of links/QRs, retries, and operational requeue process.
4. **Organizer communications:** Add an optional checkout opt-in for organizer news/promotions; store auditable organizer-scoped consent; support unsubscribe and suppression; implement organizer campaign targeting; add periodic event reminders for purchasers; and separate transactional, reminder, and promotional templates/reporting. Decide reminder frequency/timing, preference controls, sender identity, campaign approval/abuse controls, and how bounces/complaints affect suppression before launch.
5. **Recovery and operations:** Establish off-host backup retention and successful restore drills; define monitoring, alerts, incident responders, and recovery targets.
6. **Refund policy:** Define who owns refunds, response times, customer communication, and whether provider-supported automation will be added.
7. **Staff invitations:** Reconcile the implemented backend invitation lifecycle with the frontend documentation that still reports onboarding as unimplemented; finish UI and secure invitation delivery.
8. **Hostnames:** Resolve the partner API hostname discrepancy between `api-ticket.fluxorastudio.id` and `api-eticket.fluxorastudio.id`; verify admin/partner host publication independently.
9. **Studio lead path:** Confirm the expected contact CTA/destination and whether lead submissions need CRM capture or measurement.
10. **Policies:** Approve privacy notice, data retention, customer support and incident response ownership, and customer email preference/consent policy.
11. **Operational targets:** Set availability, latency, payment reconciliation, email delivery, and recovery targets after expected event traffic is known.
12. **Browser and accessibility verification:** Complete manual mobile and screen-reader checks and record tested browsers/devices.
13. **Future product choices:** Decide whether customer accounts, ticket transfer, offline gate mode, assigned seating, partner settlements, multi-event checkout, and automated refunds are roadmap items.

## 12. Repository references

- [`readME.md`](../../../readME.md) — repository overview and frontend deployment.
- [`backend/readMe.md`](../../../backend/readMe.md) — backend setup, API operations, roles, payment, delivery, and integration behavior.
- [`docs/plans/frontend/customer_v1.md`](../plans/frontend/customer_v1.md) — customer storefront scope and implementation evidence.
- [`docs/plansBE/eticket.md`](../plansBE/eticket.md) — backend scope, rollout plan, provider validation, and operational gaps.
- [`docs/api/partner-v1.md`](../api/partner-v1.md) — partner API and webhook contract.
- [`docs/api/architecture.md`](../api/architecture.md) — service topology and host routing.
- [`docs/api/subdomains.md`](../api/subdomains.md) — hostname proposals.
- [`deploy/README.md`](../../../deploy/README.md) — deployment, database, gateway, backup, and rollout procedures.
