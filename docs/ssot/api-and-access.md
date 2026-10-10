# API surfaces and access model

**Reviewed:** 2026-10-10  
**Implementation source:** `backend/src/server.ts`, `backend/src/routes/`, and `backend/src/lib/`  
**Status:** Core route families are implemented. Production host rollout and real external integration verification remain incomplete.

## 1. API surface map

| Route family | Caller | Authentication | Main purpose | Status |
|---|---|---|---|---|
| `GET /healthz`, `GET /readyz` | Gateway/operator/orchestrator | None | Liveness and DB readiness | `[DONE]` |
| `/api/events` | Public storefront | None | Public event catalogue/details | `[DONE]` |
| `/api/checkout` | Customer storefront | Quote bearer token for private resources; idempotency key for order create | Quote, order, payment session, private order status | `[DONE]` |
| `/api/webhooks/rajaongkir` | Payment provider | Provider callback prompts server status verification | Payment reconciliation trigger | `[DONE]` Code exists; provider account callback behavior remains unverified. |
| `/api/staff/auth/*` | Staff portals | HttpOnly staff session cookie | Login, inspect session, logout | `[DONE]` |
| `/api/staff/check-ins/*` | Assigned gate staff | Staff session and event assignment | Validate ticket entry | `[DONE]` |
| `/api/staff/partners/:partnerId/admin/*` | Partner owner/admin/event manager as allowed | Staff session + active partner membership | Partner catalogue and operations | `[DONE]` |
| `/api/staff/admin/*` | Platform SuperAdmin | Staff session + platform role | Platform partner and operations administration | `[DONE]` |
| `/api/v1/*` | External partner integration | Partner API key + scopes; private quote token for order lookup | Partner catalogue and scoped checkout | `[DONE]` Code exists; hostname/integration validation pending. |

All API errors use JSON message responses. Unexpected errors include request IDs; application creates/propagates an `x-request-id`. CORS uses configured customer/staff origins and credential support for staff cookie sessions. Do not add the customer storefront origin to the narrower staff-origin allowlist unless specifically required.

## 2. Public customer API and checkout contract

### Catalogue

- `GET /api/events` returns eligible published future events with public catalogue data and availability hints.
- `GET /api/events/:slug` returns the corresponding event detail.
- Catalogue availability is advisory; quote creation is the final inventory and sale-window validation.
- Responses must never contain buyer contact details, private order tokens, payment credentials, or ticket QR values.

### Checkout lifecycle

- `POST /api/checkout/quotes` accepts required email, optional buyer fields, ticket selections and/or bundles; computes prices server-side and reserves inventory.
- `POST /api/checkout/orders` requires quote ID/access token and `Idempotency-Key`; same-attempt retries must reuse the same key.
- `POST /api/checkout/orders/:id/payment` requires the quote access token and creates/replays provider instructions.
- `GET /api/checkout/orders/:id` requires the quote access token and returns private order/payment/ticket delivery data.
- `POST /api/webhooks/rajaongkir` prompts provider status verification. Browser requests cannot settle orders.
- Checkout is limited to one partner and the customer UI limits cart to one event. Current constraints include at most 10 units per selection and 20 admissions per order; API validation remains authoritative.
- Never place quote/order bearer tokens or ticket QR credentials in query parameters, analytics, or public links.

### Error and retry behavior

- `400`: invalid request.
- `401`: missing/invalid/expired credential.
- `403`: insufficient scope or role.
- `404`: unavailable or out-of-scope resource.
- `409`: inventory/quote/idempotency conflict or serialization conflict.
- `429`: API key quota exceeded.
- `503`: QRIS provider unavailable/disabled.
- `5xx`: unexpected backend/provider issue; use request ID for diagnosis.

Timeouts do not prove that an operation failed. Reuse the same idempotency key for order-create retry; use the original quote access token for payment and status retrieval.

## 3. Partner API v1

Base path: `/api/v1`. API keys are partner-bound bearer credentials, shown only at creation/rotation, SHA-256 hashed at rest, and optionally expiring. Never put keys in URLs, browser bundles, or logs.

| Scope | Capability |
|---|---|
| `events:read` | Required; reads the key owner's eligible catalogue. |
| `checkout:create` | Creates quotes/orders and starts checkout for the key owner's events. |
| `orders:read` | Reads order/payment/ticket state with the private quote token; requires `checkout:create`. |

Partner owners/admins manage keys through partner staff endpoints. Rotation replaces a key atomically; optional grace is limited to seven days. Per-key fixed-window request quotas are shared through PostgreSQL, default 120 requests/minute, configurable from 1 to 600. Usage is visible to SuperAdmins without exposing key hashes/secrets. Fixed windows are not burst controls.

Partner checkout is scoped to the authenticated key's partner. Cross-partner orders are rejected. The documented detailed request/response contract is in [`../api/partner-v1.md`](../api/partner-v1.md); verify its stated hostname before publishing it externally.

## 4. Staff access and role boundaries

Staff auth uses the `fluxora_staff` HttpOnly cookie. Sessions last eight hours according to backend documentation; passwords and session tokens are hashed at rest. `npm run staff:create` provisions existing staff accounts/roles for operational bootstrap.

| Role | Scope |
|---|---|
| `GATE` | Assigned event check-in only; cannot manage partner catalogue. |
| `EVENT_MANAGER` | Partner event/catalogue operations granted to the role; no platform-wide access. |
| `ADMIN` | Partner administration such as membership/API/webhook management according to route policy. |
| `OWNER` | Partner ownership privileges. Final-owner protection applies. |
| `SUPERADMIN` | Platform-level partner management, audit, usage, queue and refund review. |

Authorization must verify both role and resource ownership on every request. An authenticated staff user is not automatically authorized for all partners. Gate staff must be active members of the event's partner and assigned to that event.

### Staff route capabilities (documented)

- Platform partner create/list/detail/status and owner assignment.
- Platform and partner audit queries; API usage and operational queue summaries.
- Partner event/performance/ticket/bundle creation and editing, archiving, sale windows, capacity and limits.
- Partner memberships and gate assignment management.
- Event-scoped order/admission views that intentionally omit buyer contact details and QR secrets.
- API key and webhook configuration/delivery retry.
- Manual refund-review completion after an external provider refund.
- Staff invitation create/resend/revoke API. Frontend implementation status is inconsistent across docs and must be verified; invitation email is not configured.

## 5. Partner outbound webhooks

- Endpoint registration requires HTTPS/publicly routable destinations; private/reserved destinations are rejected and resolved IPs are pinned to mitigate SSRF.
- Endpoint secret is returned once, encrypted at rest, and rotated explicitly.
- Requests include event type, stable delivery ID, timestamp, key version, and HMAC-SHA256 signature over timestamp plus raw request body.
- Receivers should verify signatures in constant time, enforce timestamp tolerance, and deduplicate delivery IDs.
- Retries use bounded backoff and stop after a bounded attempt count; failed deliveries can be manually replayed.
- Payloads omit customer contact data, provider secrets, and ticket QR bearer values.
- Webhook secret encryption key must be stable per environment and configured on every API instance.

## 6. API security expectations

- Separate customer quote bearer tokens, staff session cookies, partner API keys, webhook signing secrets, and ticket QR credentials.
- Hash stored staff passwords/session tokens, quote tokens, and partner API keys; encrypt webhook secrets needed for outbound signing.
- Keep order lookup private and protect it with the quote access token in authorization headers.
- Avoid logging credentials, payment data, raw QR tokens, or customer contact details.
- Scope CORS narrowly; staff cookie routes require explicit staff origins.
- Treat provider callbacks as untrusted prompts until server-side authenticated lookup confirms state and amount.
- Apply role, tenant, and event assignment checks before reads or mutations.

## 7. Gaps and follow-up

- `[NOT DONE]` Canonical production partner API hostname is unresolved (`api-ticket` in partner contract vs `api-eticket` in current deployment materials).
- `[NOT DONE]` Production API host and all staff portals need live DNS/TLS/gateway verification.
- `[NOT DONE]` A real external API integration has not been recorded as verified.
- `[NOT DONE]` Consent capture and organizer email campaign/reminder APIs do not exist; see [Email communications](email-communications.md).
- `[NOT DONE]` API rate limits exist for partner API keys, but comprehensive abuse controls and production load targets are not evidenced.

## 8. Related documents

- [Ticketing domain](ticketing-domain.md)
- [System architecture](architecture.md)
- [Platform PRD](PRD/fluxora-platform.md)
- [Partner API contract](../api/partner-v1.md)
- [Backend operations guide](../../backend/readMe.md)

