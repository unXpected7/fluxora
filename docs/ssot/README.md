# Fluxora source of truth

This folder is the curated reference for what Fluxora contains, how its products behave, and what remains before launch. It describes the repository and recorded deployment evidence; it does not replace route implementations, Prisma schema, provider documentation, or deployment runbooks.

## Documents

| Document | Purpose |
|---|---|
| [Platform PRD](PRD/fluxora-platform.md) | Product scope, users, requirements, launch criteria, and open decisions. |
| [System architecture](architecture.md) | Products, services, traffic routing, deployment boundaries, and architecture status. |
| [Ticketing domain](ticketing-domain.md) | Core entities, inventory/order/payment/ticket lifecycle, and invariants. |
| [API and access model](api-and-access.md) | Public/customer, partner integration, staff, and platform API surfaces and permissions. |
| [Operations and release](operations.md) | Environments, deployment responsibilities, operational workers, readiness, and launch checklist. |
| [Email communications](email-communications.md) | Transactional ticket email, proposed organizer promotions/reminders, consent rules, and implementation gaps. |
| [Existing architecture note](api/architecture.md) | Earlier service-routing and CI/CD notes; check this against the newer [system architecture](architecture.md) and current deploy files. |
| [Partner API contract](api/partner-v1.md) | Detailed integration request/response contract and webhook verification. |
| [Hostname notes](api/subdomains.md) | Short hostname proposal list; host ownership and canonical API hostname still need reconciliation. |

## Status notation

- `[DONE]` means repository implementation or a dated environment check supports the statement. It does not imply every environment is deployed or launch-ready.
- `[PARTIAL]` means some layers are implemented but important behavior, UI, delivery, or verification remains.
- `[NOT DONE]` means the feature is absent, a decision is open, or evidence is missing.
- A status with a date refers to the date in its linked source. Recheck it before treating it as current operational state.

## Evidence hierarchy

1. Current source code and Prisma schema establish implemented behavior.
2. Current deployment files establish intended container and gateway configuration, not proof that a host has that configuration installed.
3. Dated rollout notes establish only the checks recorded on that date.
4. Plans and older architecture documents are useful context but can be stale. Where they conflict, this index or the focused SSOT page should identify the conflict rather than silently choosing one.

## Repository map

| Path | Responsibility |
|---|---|
| `frontend/` | React, TypeScript, Vite marketing site, customer ticket storefront, and host-aware staff portals. |
| `backend/` | Express/TypeScript API, Prisma/PostgreSQL persistence, checkout, payment, staff, partner API, and workers. |
| `deploy/` | VM Compose files, public Nginx virtual hosts, deployment and database runbooks. |
| `docs/api/` | API contract, host and architecture notes. |
| `docs/plans/`, `docs/plansBE/` | Implementation plans and status notes; some may be historical. |
| `marketing/` | Draft marketing content. |

## Maintenance

Update these pages when product boundaries, API permissions, schema lifecycle, deployment topology, or release status changes. Keep secrets, customer data, live credentials, and unredacted operational output out of SSOT. Link to a runbook for commands rather than copying secrets or environment-specific credentials here.

