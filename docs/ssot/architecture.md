# Fluxora system architecture

**Reviewed:** 2026-10-10  
**Status:** `[PARTIAL]` Architecture is implemented in code/configuration, while production deployment of the ticketing API and current storefront build is incomplete in recorded rollout evidence.

## 1. Product and service boundaries

Fluxora has a public Studio site and a ticketing product. They share one frontend codebase and deployment image, but the API is an independent backend service.

| Product surface | Implementation | Purpose | Status |
|---|---|---|---|
| Studio website | `frontend/` React + Vite | Company profile and lead generation | `[DONE]` Code and frontend deployment paths exist. Confirm contact conversion path separately. |
| Customer storefront | `frontend/` host/path-aware React app | Event discovery, event details, checkout and ticket display | `[DONE]` Code exists; `[NOT DONE]` latest production build is reported pending. |
| Staff portals | Same frontend, host-aware | Platform administration and partner operations | `[DONE]` UI and API routes exist; verify each staff hostname's live routing. |
| Ticketing API | `backend/` Express + Prisma | Catalogue, checkout, payment, staff, partner API and webhook handling | `[DONE]` API code exists; `[NOT DONE]` production API readiness/deployment remains pending in rollout notes. |
| PostgreSQL | Separate dev/prod databases | Persistent ticketing, partner, staff and audit state | `[DONE]` Separate DBs were provisioned for dev/prod in the backend rollout notes; restore readiness remains pending. |

## 2. Runtime traffic flow

1. Customer traffic reaches Cloudflare and the public Nginx gateway.
2. Nginx forwards frontend/API traffic to VM01 over its private network interface.
3. Frontend containers serve static Vite build files through Nginx.
4. The customer storefront calls the ticketing API over HTTPS using the configured API origin. The customer flow uses private quote access tokens for order resources and does not require session cookies.
5. Staff portals call staff routes with the backend's HttpOnly session cookie; staff CORS origins are configured separately from customer origins.
6. The API accesses its environment-specific PostgreSQL database through Prisma.
7. The API communicates with RajaOngkir for QRIS creation/status reconciliation, Brevo for ticket email when configured, and partner webhook destinations when subscriptions are configured.

The API sets a request ID, configures proxy trust, applies CORS, mounts raw JSON parsing for provider webhooks, and provides `/healthz` and database-backed `/readyz` checks. It starts reservation expiry, ticket delivery, and partner webhook workers inside the API process.

## 3. Repository responsibilities

### Frontend

- `frontend/src/App.tsx` contains host/path selection, storefront, staff sign-in, and management screens.
- `/tickets` and `/event/:slug` support the storefront on compatible studio/local hosts; the dedicated e-ticket hostname serves the catalogue at `/` when routing is configured.
- Staff portal UI distinguishes platform administration from partner workspace based on host and session role.
- `frontend/src/style.css` contains the shared site, storefront, and portal styling.
- Frontend build and tests are separate npm scripts; CI builds frontend and backend, while only the frontend is automatically deployed by the documented branch workflows.

### Backend

- `backend/src/server.ts` configures HTTP middleware, routers, error mapping, health checks, and workers.
- `backend/src/routes/` contains event, checkout, provider webhook, staff, and partner API routes.
- `backend/src/lib/` contains payment adapters/settlement, reservations, staff authentication, QR signing, ticket delivery, and partner webhook logic.
- `backend/prisma/schema.prisma` is the persistence model. Migrations are committed under `backend/prisma/migrations/`.
- `backend/prisma/seed.ts` provides local fixture data; it is not production event inventory.

## 4. Deployment topology

The intended VM01 service ports documented by the current Compose/deployment files are:

| Service | VM01 bind | Environment |
|---|---:|---|
| Studio frontend | `8093` | Development |
| Studio frontend | `8094` | Production |
| Ticket storefront | deployment notes list `8095` | Production customer storefront |
| Admin portal | deployment notes list `8096` | Production staff |
| Partner portal | deployment notes list `8097` | Production staff |
| Ticketing API | `5102` | Development |
| Ticketing API | `5103` | Production |

The deployment materials have evolved and some older architecture notes list different customer/staff upstreams or omit those portal services. Use `deploy/vm01/app/docker-compose.yml` and `deploy/README.md` as the current intended configuration. Verify the installed VM configuration before a rollout. Frontend ports are intended to bind to the private VM interface; public Nginx is the gateway.

Development and production PostgreSQL services are separate. Do not point Fluxora at another product's database. Secrets and database URLs belong in VM-only environment files or protected deployment secrets, not this repository.

## 5. Hostname inventory and unresolved names

Known intended host groups include:

| Surface | Development | Production |
|---|---|---|
| Studio | `dev.fluxorastudio.id` | `fluxorastudio.id`, `www.fluxorastudio.id` |
| Customer tickets | No dedicated development customer host is configured; `dev.fluxorastudio.id` is the shared dev frontend | `e-ticket.fluxorastudio.id` |
| Staff admin | `dev-admin-eticket.fluxorastudio.id` | `admin-eticket.fluxorastudio.id` |
| Partner workspace | `dev-partner-eticket.fluxorastudio.id` | `partner-eticket.fluxorastudio.id` |
| Ticketing API | `dev-api-eticket.fluxorastudio.id` | `api-eticket.fluxorastudio.id` |

The partner API contract uses `api-eticket.fluxorastudio.id`, matching `deploy/nginx-public/api-eticket.fluxorastudio.id`; development uses `dev-api-eticket.fluxorastudio.id`. The separate portal hosts map to frontend services as shown in `deploy/nginx-public/README.md`. Committed virtual hosts document intended routing and do not prove that DNS, TLS certificates, or the live gateway are operational.

## 6. CI/CD boundaries

- `main` is the documented development branch and deploys the development frontend after checks.
- `prod` is the documented production branch and deploys the production frontend after checks.
- Pull requests/pushes run frontend/backend validation in the workflows.
- Backend container rollout and Prisma migration are separate, manual operations.
- Public Nginx gateway installation/reload and certificate issuance are separate from GitHub Actions.
- Database backup must precede a production migration; migration rollback is described as restore-based rather than automatically reversible.

## 7. Architecture constraints

- Keep public storefront, staff session, partner API key, and private order token authentication models distinct.
- Never trust customer browser state to update payment/ticket lifecycle.
- Keep tenant ownership checks on every partner-scoped staff/API operation.
- Run migrations against the correct environment only; maintain different dev/prod credentials and provider secrets.
- Public catalogue output must not disclose customer data, payment secrets, or ticket QR bearer credentials.
- Background worker behavior currently relies on API process timers. Multi-instance deployment requires confirming worker coordination/claim behavior and avoiding duplicate side effects.

## 8. Related sources

- [Operations and release](operations.md)
- [API and access model](api-and-access.md)
- [Ticketing domain](ticketing-domain.md)
- [Architecture implementation notes](../api/architecture.md)
- [Deployment runbook](../../deploy/README.md)
- [Platform PRD](PRD/fluxora-platform.md)

