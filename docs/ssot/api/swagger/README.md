# Fluxora API specifications

These OpenAPI 3.1 JSON files document the backend routes implemented in `backend/src/server.ts` and `backend/src/routes/`. They are source-controlled API contracts; generate or update them alongside route changes.

| File | Surface | Development host | Production host |
|---|---|---|---|
| [`client.json`](client.json) | Customer event catalogue and checkout | Customer portal host is not finalized in the PRD. Backend API: `dev-api-eticket.fluxorastudio.id` | Customer portal: `e-ticket.fluxorastudio.id`. Backend API: `api-eticket.fluxorastudio.id` |
| [`admin.json`](admin.json) | Staff authentication, platform administration, and partner-scoped staff operations | `dev-admin-eticket.fluxorastudio.id` | `admin-eticket.fluxorastudio.id` |
| [`partner.json`](partner.json) | Partner API key integrations and partner workspace operations | `dev-partner-eticket.fluxorastudio.id` | `partner-eticket.fluxorastudio.id` |
| [`ticketing.json`](ticketing.json) | Complete ticketing backend API, including customer, staff, partner, and payment callback routes | `dev-api-eticket.fluxorastudio.id` | `api-eticket.fluxorastudio.id` |

The customer, staff admin, and partner hostnames serve web portals, not separate backend services. Those portals call the ticketing API. The OpenAPI `servers` entries therefore point to the API host, while each document's `info.description` records the related portal host. Portal backend mapping is described in [`../subdomains.md`](../subdomains.md) and deployment configuration under `deploy/nginx-public/`.

## Authentication and sensitive values

- Customer quote and private order operations use the quote `accessToken` as a bearer token. Keep it private and out of URLs, logs, and analytics.
- Staff endpoints use the HttpOnly `fluxora_staff` cookie. Role and partner/event ownership checks remain enforced by the backend.
- `/api/v1` partner integration uses a partner API key bearer token and the scopes listed on each operation. Order reads also require the quote token.
- Payment callbacks prompt server-side reconciliation; callback payload fields do not establish a paid state.

## Contract notes

- Errors generally return `{ "message": "..." }`; unexpected server errors also include `requestId`. Requests and responses propagate `x-request-id`.
- Checkout prices are computed server-side. Quote creation reserves inventory; order creation requires an `Idempotency-Key`.
- These specifications describe the implemented backend. They do not imply that production DNS, TLS, external payment callbacks, email delivery, or third-party integration have been verified.
- The canonical host for partner integrations in older prose documents may differ; current deployment configuration uses `api-eticket.fluxorastudio.id`.
