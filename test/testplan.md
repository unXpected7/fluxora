# Fluxora e-Ticketing Test Plan

## 1. Purpose and scope

This document defines the test strategy for the Fluxora e-ticketing application. It covers the customer storefront, staff administration, partner workspace and API, ticketing API, database, background workers, and public deployment routing. The goal is to catch regressions in ticket sales, tenant and role boundaries, payment handling, ticket delivery, and check-in before release.

The plan distinguishes **existing automated coverage** from **planned coverage**. A test listed below is not considered implemented until it exists in the repository and passes in CI.

### Product surfaces

| Surface | Local example | Main concerns |
| --- | --- | --- |
| Customer storefront | `http://localhost:5173` | Event discovery, checkout, order lookup, ticket access |
| Staff admin | `http://admin.localhost:5173` | Staff login, platform/partner administration, permissions |
| Partner workspace | `http://partner.localhost:5173` | Partner-scoped operations and API credentials |
| Ticketing API | `http://localhost:4000` | Public checkout, staff routes, partner API, webhooks |
| Database | Docker PostgreSQL, local port `5439` | Migrations, constraints, transaction/race behavior |

Use the actual local ports and hostnames from the current compose, Vite, and environment configuration when they differ. Public production host routing is defined by `deploy/nginx-public` and should be smoke-tested against that configuration.

## 2. Test principles and priorities

- Keep most business rules in fast unit tests; use integration tests for persistence, authentication, and HTTP boundaries; reserve browser E2E for critical user journeys.
- Use isolated test records and a dedicated local/test database. Never point test commands at production data.
- Treat all client input, payment callbacks, webhooks, and partner API requests as untrusted.
- Assert both the successful result and the absence of unauthorized side effects (for example, no order/inventory change after a rejected request).
- Tests must be deterministic: freeze time where practical, control external provider responses, and clean up test data.
- Keep secrets, QR bearer values, payment data, and unnecessary personal information out of test logs and snapshots.

Priority definitions:

- **P0:** Sales integrity, authentication/authorization, payment verification, ticket validity, tenant isolation, or data loss. Blocks release.
- **P1:** Core workflows, admin operations, partner API/webhooks, and deployment behavior. Blocks release unless explicitly accepted.
- **P2:** Secondary UI behavior, usability, edge cases, and non-critical operational polish.

## 3. Current test setup and known coverage

### Commands currently available

Run commands from the indicated package directory:

```sh
cd backend
npm test
npm run lint
npm run build
npm run db:generate
npx prisma validate
```

```sh
cd frontend
npm test
npm run lint
npm run build
```

Backend tests use Node's built-in test runner with `tsx`. Frontend tests use Vitest and Testing Library. No Playwright/Cypress browser E2E runner is configured; this run used Chrome headless through the DevTools protocol for critical browser journeys. The CI workflows run both package test commands, lint/type checks, builds, and Prisma generation/validation. They use a self-hosted PostgreSQL URL but do not create a fresh database or run the manual integration scenarios described below.

### Existing tests

Backend unit tests currently check:

- Staff origin allowlisting accepts configured staff portal origins and rejects the customer storefront origin.
- Staff session cookies support the portal/API host split and clear with matching cookie attributes.
- Prisma transaction conflict classification handles serialization and deadlock SQLSTATEs; recent unpaid status cache can be bypassed by a provider callback.
- Signed ticket QR values validate when unchanged and fail after tampering.
- Partner webhook URL validation accepts public HTTPS endpoints and rejects private/non-HTTPS targets; webhook signatures bind the timestamp and exact payload bytes.
- RajaOngkir payment session and status parsing validate exact amounts, references, known statuses, and approved API origins.

`frontend/src/customer-storefront.test.tsx` currently checks:

- Customer route handling and API URL selection/override.
- Recovery data removes QR bearer values before local storage.
- Event card rendering, starting price, and art fallback.
- Text/city filtering and price sorting.
- Keyboard order for accessible catalogue controls.
- Upcoming date-window filtering.

These tests are a baseline only. They do not yet constitute full API integration or browser E2E coverage.

## 4. Test layers

### 4.1 Unit tests (P0/P1)

Test pure logic without a database or network. Keep tests close to the module or in the package's existing test directory.

Backend unit targets:

- Input schema and validation: required fields, malformed IDs/slugs, limits, unknown fields, and boundary values.
- Quote calculations: ticket prices, quantities, fees, discounts/bundles, currency rounding, and total amount consistency.
- Inventory logic: available/sold/reserved counts, reservation deadlines, release, and over-capacity prevention.
- Idempotency: same key and same request returns the same outcome; same key with materially different request is rejected safely.
- QR/signature logic: valid token, tampered token, invalid signature, expired/revoked ticket, and replayed check-in.
- Authorization policy: role, partner ownership, event assignment, and operation permissions.
- CORS/origin policy: allowed customer and staff origins are distinct and environment-configurable.
- Partner API key parsing, scope checks, fixed-window quota calculation, rotation/revocation, and safe error responses.
- Webhook payload signing and verification helpers, key version handling, and delivery state transitions.
- Payment provider adapter: status normalization and exact currency/amount/reference matching.
- URL validation against SSRF, including localhost, private/link-local IPv4 and IPv6, redirects, and non-HTTPS schemes.

Frontend unit/component targets:

- Route and API base URL selection for customer, admin, and partner hosts.
- Form validation, disabled/loading/error/success states, and prevention of duplicate submissions.
- Accessible event search/filter/sort/date controls and keyboard behavior.
- Ticket/order recovery storage sanitization; bearer QR values must never be persisted in browser storage.
- Permission-aware navigation and clear handling of 401, 403, 404, and API unavailable states.

### 4.2 Integration tests (P0/P1)

Run backend integration tests against a dedicated PostgreSQL database started with the local Docker compose configuration (or an isolated CI PostgreSQL service). Apply migrations before tests; do not use the developer's ordinary data volume unless the test harness creates and cleans a separate database/schema.

Integration tests should exercise the real Prisma repository and HTTP middleware. Prefer an ephemeral HTTP server and `fetch` unless a test client dependency is deliberately added. Stub payment providers and outbound HTTP; do not call live provider endpoints.

Required integration targets:

- Migration from an empty database and migration upgrade from the previous supported schema.
- Seed is repeatable and creates the expected local demo data without duplicating rows.
- Health and readiness endpoints report process health separately from database readiness.
- API validation, status codes, response shapes, cookies, CORS, and error mapping.
- Transactions for quote reservation, order creation, payment state changes, and check-in.
- Database uniqueness/foreign-key constraints and rollback on partial failure.
- Worker processing for expired reservations, ticket delivery, and partner webhook delivery.

### 4.3 API contract tests (P0/P1)

Check the current OpenAPI/Swagger documents against live route behavior. For every documented operation verify method, path, auth requirement, request/response schema, status codes, and error format. Add contract checks whenever a route or schema changes. Keep the generated `swagger.json` files and detailed API docs aligned with actual route behavior and nginx routing.

Do not interpret a `403` as a CORS failure automatically. Verify the response body and server logs: a rejected origin, absent/invalid session, missing role, wrong tenant, or CSRF/security policy can have different causes. Test each case with an explicit expected status and message class.

### 4.4 Browser E2E tests (P0/P1)

Add a browser runner such as Playwright when the E2E suite is implemented. Run against local frontend and backend services with a disposable database and deterministic provider stubs. Use separate browser contexts for customer, staff, and partner sessions. Do not depend on public DNS or production services in routine CI.

Critical customer journey:

1. Open storefront and load published events.
2. Open event details, select a performance and ticket type, and request a quote.
3. Confirm quantities and totals; reject over-limit or unavailable selections.
4. Create an order with an idempotency key and verify a repeat submission does not create a second order or reserve inventory twice.
5. Verify private order lookup requires the intended secure access mechanism and does not expose another customer's order.
6. Complete payment in provider sandbox/stub when configured; verify pending/failed/success states and ticket delivery.
7. Open the issued ticket and scan/check in once; a second use must be rejected.

Staff journey:

1. Log in using a seeded test staff account; check session, logout, expiry, and rejected credentials.
2. Create/update an event, performance, ticket type, or bundle as an authorized role.
3. Confirm unauthorized roles cannot perform those operations and cannot access another partner's records.
4. Review orders/check-in summary and assign/remove gate staff where permitted.
5. Validate a ticket at the gate; confirm a successful scan consumes the ticket exactly once.

Partner journey:

1. Log in to partner workspace and load only that partner's events, orders, and settings.
2. Exercise partner API key creation/rotation/revocation and confirm old keys stop working after rotation/revocation.
3. Call `/api/v1` with valid and invalid keys/scopes; check quota enforcement and response headers where defined.
4. Configure a public HTTPS webhook endpoint, receive a signed event, verify signature/timestamp/key version, and retry a failed delivery.
5. Confirm private, loopback, link-local, redirect-to-private, and non-HTTPS webhook URLs are blocked.

### 4.5 Regression tests

Every fixed defect should add a regression test at the narrowest layer that reliably reproduces it. For example, a staff-origin/session `403` should have policy/middleware coverage and an integration test proving the intended origin and credentials succeed while an untrusted origin or missing session fails. Include the issue or bug reference in the test name/description when available.

Before release, run all existing tests plus the P0 regression set: checkout totals and inventory, order idempotency, staff authentication/authorization, partner tenant isolation, payment verification, QR tampering/replay, and webhook SSRF/signature checks.

## 5. Detailed test case matrix

| ID | Priority | Area | Scenario and expected result |
| --- | --- | --- | --- |
| CAT-001 | P1 | Catalogue | Published events are listed; draft/archived events are hidden from public endpoints. |
| CAT-002 | P1 | Event detail | Existing slug returns correct event/performance/ticket data; unknown or unpublished slug is not exposed. |
| CAT-003 | P2 | Storefront UI | Search, city/date filters, price sort, empty state, and keyboard navigation work together. |
| CHK-001 | P0 | Quote | Valid selection returns a quote whose line totals and grand total match configured prices and fees. |
| CHK-002 | P0 | Quote | Reject zero/negative/too-large quantities, invalid event/performance combinations, and unsupported ticket types without reserving inventory. |
| CHK-003 | P0 | Inventory | Concurrent quotes/orders at the capacity boundary never oversell; counts remain consistent. |
| CHK-004 | P0 | Reservation | Expired quote reservation releases inventory after the deadline; a still-valid reservation remains held. |
| CHK-005 | P0 | Order | Valid order consumes/holds the quoted inventory exactly once and returns a stable order reference. |
| CHK-006 | P0 | Idempotency | Retry with the same key and same body returns the original result; retry with conflicting body is rejected safely. |
| CHK-007 | P0 | Order privacy | Lookup of a guessed/foreign order ID does not reveal customer or ticket information. |
| PAY-001 | P0 | Payment | With provider disabled, payment initiation returns the documented unavailable response and creates no paid order/ticket. |
| PAY-002 | P0 | Payment | Provider success is accepted only for matching reference, amount, currency, and verified provider status. |
| PAY-003 | P0 | Payment | Forged, stale, duplicate, wrong-amount, or wrong-reference callback cannot mark an order paid. |
| PAY-004 | P1 | Payment | Provider timeout/failure leaves a recoverable pending/failed state and does not issue a valid ticket. |
| TKT-001 | P0 | Ticket | Issued ticket QR validates only for the correct ticket and signature; tampering/expired token fails. |
| TKT-002 | P0 | Check-in | First authorized scan succeeds; duplicate scan is rejected and records no second admission. |
| TKT-003 | P0 | Check-in | Invalid, refunded, cancelled, wrong-event, and unassigned-gate scans are rejected with safe messages. |
| AUTH-001 | P0 | Staff auth | Valid credentials create a secure HttpOnly session; invalid credentials do not create a session. |
| AUTH-002 | P0 | Session | Session endpoint succeeds only with a valid session; logout clears it; expired/revoked sessions fail. |
| AUTH-003 | P0 | Origin/CORS | Approved staff origin works with credentials; customer/untrusted origin cannot call staff routes with credentials. |
| AUTH-004 | P0 | Roles | GATE, EVENT_MANAGER, ADMIN, OWNER, and SUPERADMIN receive only their allowed operations. |
| AUTH-005 | P0 | Tenant isolation | Partner staff cannot read or mutate another partner's events, orders, users, keys, or webhook settings, even by changing IDs. |
| AUTH-006 | P1 | Invitation | Preview/accept validates token, expiry, email/account constraints, and single use; revoked/expired tokens fail. |
| ADM-001 | P1 | Admin | Event, performance, ticket type, and bundle create/update persist valid data and reject invalid relationships. |
| ADM-002 | P0 | Admin | Owner/last-admin protection and partner membership changes cannot leave a tenant without an authorized owner. |
| ADM-003 | P1 | Admin | Refund review and refund-confirmed flows enforce permission and prevent duplicate/reforged transitions. |
| PAR-001 | P0 | Partner API | Missing, malformed, revoked, or expired API key is rejected; valid key requires the operation's scope. |
| PAR-002 | P1 | Partner API | Fixed-window quota is enforced and resets at the expected boundary without cross-key/tenant leakage. |
| PAR-003 | P1 | Partner API | Key rotation invalidates the old secret; secret is shown only at creation and never returned later. |
| WH-001 | P0 | Webhook | Reject loopback, private, link-local, IPv6 local, non-HTTPS, and redirect-based SSRF targets. |
| WH-002 | P0 | Webhook | Delivery signature matches exact payload bytes and supported key version; altered payload fails verification. |
| WH-003 | P1 | Webhook | Failed delivery records safe error metadata; retry is bounded/authorized and stable delivery ID is retained. |
| WH-004 | P1 | Webhook | Payload excludes secrets and unnecessary PII; timeout does not block API request handling. |
| OPS-001 | P1 | Health | `/healthz` and `/readyz` have distinct semantics; readiness fails when required dependencies are unavailable. |
| OPS-002 | P1 | Workers | Reservation expiry, ticket delivery, and webhook workers process eligible work once and recover after restart. |
| OPS-003 | P1 | Nginx | Public hostnames route to the correct customer, admin, partner, and API services; TLS/forwarded headers and API paths work as configured. |
| OPS-004 | P1 | Errors | Unhandled failures return a stable safe error shape and do not leak stack traces, secrets, or SQL details. |

## 6. Security and abuse regression checklist

- Enforce authorization on the server for every staff/partner operation; hiding UI controls is not authorization.
- Test CSRF/session-cookie settings and credentialed CORS behavior for each configured origin.
- Check input validation, SQL/ORM safety, mass assignment, path/ID manipulation, and oversized request limits.
- Verify authentication throttling and that responses do not reveal whether an account exists.
- Verify API keys, invitation tokens, session cookies, QR bearer tokens, webhook secrets, and payment credentials are redacted from logs and never committed.
- Verify ticket QR signatures cannot be forged and QR bearer values are not persisted in customer recovery storage.
- Verify payment status is based on server-to-server verification, not a browser redirect or untrusted callback body.
- Verify webhook URL validation handles DNS changes and redirects safely at connection time, not only when a URL is saved.
- Verify webhook signature comparison is timing-safe where supported and timestamps/replay behavior follow the documented contract.
- Check dependency audit and secret scanning in CI according to the repository's chosen tooling.

## 7. Data, fixtures, and environment management

- Use clearly named test partners/events/orders and unique suffixes to allow parallel runs.
- Keep fixtures minimal and deterministic: at least one published and one unpublished event, capacity-limited ticket types, each staff role, two partner tenants, valid/invalid API keys, and payment/webhook stubs.
- Seed local demo data only in local development. Automated tests should own their fixtures and cleanup.
- Reset only the isolated test database. Never run destructive cleanup against a shared or production database.
- Stub all external payment, email/ticket delivery, and webhook destinations. Sandbox integration tests may run separately with explicit test credentials and opt-in configuration.
- Freeze/inject clocks for quote expiry, invitations, payment callback age, quota windows, and webhook timestamps.

## 8. CI and release gates

Recommended CI sequence for pull requests:

1. Install dependencies with lockfile enforcement (`npm ci`).
2. Backend: Prisma generate and validate, backend unit tests, high-severity dependency audit, TypeScript lint/typecheck, build.
3. Frontend: Vitest tests, high-severity dependency audit, TypeScript lint/typecheck, production build.
4. Backend integration tests against a fresh PostgreSQL service and applied migrations.
5. On relevant changes, run API contract checks and browser E2E critical journeys.
6. Publish test reports and fail the job on any P0/P1 regression.

The development and production workflows now run both package test commands and `npm audit --audit-level=high`. They still use the self-hosted runner's PostgreSQL URL rather than creating a fresh database for migrations/integration tests. No secret-scanning tool is configured in this repository; select and add one separately if required by release policy. Do not make CI depend on public third-party availability.

Release smoke checks should verify configured nginx host routing, `/healthz`, `/readyz`, public event read, staff login/session/logout, partner API auth, and a provider sandbox checkout when enabled. Use a non-production test event/account and confirm cleanup afterward.

## 9. Definition of done

A change is ready when:

- New behavior has unit tests, and persistence/auth/HTTP behavior has integration coverage where applicable.
- Every fixed defect has a regression test that fails before the fix and passes after it.
- Relevant frontend tests, backend tests, lint/typechecks, and builds pass locally or in CI.
- API docs and Swagger schemas match route behavior; nginx public host routing remains correct.
- P0/P1 cases affected by the change pass, and no test relies on live production data or services.
- Test data, credentials, and logs contain no production secrets or unnecessary customer information.

## 10. Test run record

Record release or manual verification runs here or link the CI run:

| Date | Commit/branch | Environment | Suites and result | Issues/follow-up |
| --- | --- | --- | --- | --- |
| 2026-10-11 | Local development API | Docker PostgreSQL / `localhost:4000` | 18 API E2E assertions passed; backend unit suite (5 tests), typecheck, and build passed | Payment provider is disabled locally, so verified the expected `503`; browser E2E and real provider settlement were not run. Fixtures use the `e2e-20261010175027-a18086` prefix. |
| 2026-10-11 | Local development workspace | Docker PostgreSQL / local API `localhost:4000`; disposable migrated databases and isolated API/frontend ports for integration and browser runs | Backend unit tests (12), frontend tests (7), both packages' lint and builds passed. Prisma 6.19.3 client generation and schema validation passed; the local DB has all 12 migrations applied. Fresh DB migration and repeatable seed checks passed again after the Prisma update. API E2E covered origin/session, partner/event/performance/ticket/bundle operations, published/draft visibility, invalid inputs, ownership protection, membership and invitation preview/accept/revoke/expiry, tenant boundaries, API key auth/scopes/quota/rotation, webhook SSRF rejection, and catalogue. Isolated HTTP checks passed last-seat concurrency (one `201`, one `409`, one reservation), order idempotency/privacy, disabled provider response, all documented check-in outcomes (accepted, duplicate, tampered, wrong event, unassigned gate, void/refunded/unpaid, and outside window), reservation expiry, refund review/confirmation, and duplicate refund rejection. Provider stubs verified forged callback handling, amount mismatch rejection, correct settlement, duplicate callback idempotency, expiry/cancellation release, and late payment refund review without ticket issuance. HTTPS webhook delivery was stubbed at the transport boundary to verify exact-payload signature/key-version headers, safe failure metadata, retry, and stable delivery ID; email delivery was stubbed to verify sandbox headers, retry, QR content, and single sent event. Chrome headless completed customer search/event/quote/order flow and admin/partner sign-in/dashboard flows; local health/readiness passed both healthy and database-unavailable states. Dev API/admin/partner and production API/customer hosts returned expected content; vm01 services on frontend ports `8093`/`8095`/`8096`/`8097` and API ports `5102`/`5103` returned expected content/health. Backend and frontend `npm audit` reported zero vulnerabilities after updating Prisma packages and overriding `deepmerge-ts` to its patched 8.x line. | Fixed four application defects found during execution: local staff CORS origins, cross-host staff session cookies (`SameSite=None; Secure`, verified in Chrome), PostgreSQL serialization/deadlock conflicts returning `409`, and forced provider callbacks bypassing the recent-unpaid cache. Also resolved the backend high-severity Prisma toolchain audit findings. **Deployment blocker:** production `admin-eticket.fluxorastudio.id` and `partner-eticket.fluxorastudio.id` return `{"message":"PMeme Handal API","docs":"/docs"}` (HTTP 200) instead of Fluxora portals, while the corresponding vm01 services work. The repository Nginx files/Compose mappings specify `8096`/`8097`, so the live public gateway's installed vhosts or routing need correction and a retest. Deploy README specifies that gateway vhost changes require root access to the public gateway. Actual external payment provider, mail, and webhook services were not contacted; all were exercised with local stubs. Disposable DBs were dropped and the existing local demo DB was not mutated. |
