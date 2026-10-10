# Fluxora application architecture

## Services and traffic flow

Fluxora runs a static React/Vite studio site and a separate Express ticketing API. Public requests terminate at Cloudflare and the Nginx gateway at `171.22.173.4` (`10.10.0.1` on WireGuard). Nginx forwards application traffic to VM01 (`10.10.0.2`).

| Hostname | Service | VM01 upstream | Deployment status |
| --- | --- | --- | --- |
| `dev.fluxorastudio.id` | Development studio frontend | `10.10.0.2:8093` | Deployed by the `main` workflow |
| `fluxorastudio.id`, `www.fluxorastudio.id` | Production studio frontend | `10.10.0.2:8094` | Deployed by the `prod` workflow |
| `dev-admin-eticket.fluxorastudio.id`, `dev-partner-eticket.fluxorastudio.id` | Development admin and partner portals | `10.10.0.2:8093` | Shared development frontend |
| `e-ticket.fluxorastudio.id` | Production customer storefront | `10.10.0.2:8095` | Dedicated production frontend |
| `admin-eticket.fluxorastudio.id` | Production admin portal | `10.10.0.2:8096` | Dedicated production frontend |
| `partner-eticket.fluxorastudio.id` | Production partner portal | `10.10.0.2:8097` | Dedicated production frontend |
| `dev-api-eticket.fluxorastudio.id` | Development ticketing API | `10.10.0.2:5102` | Manual rollout after database setup and migrations |
| `api-eticket.fluxorastudio.id` | Production ticketing API | `10.10.0.2:5103` | Manual rollout after database setup and migrations |

There is no dedicated customer e-ticket development virtual host in `deploy/nginx-public/`; `dev.fluxorastudio.id` is the configured development frontend host. The three development portal aliases route to that same frontend upstream. Production customer, admin, and partner portals use separate frontend upstreams. These mappings describe committed Nginx configuration, not verified DNS or live TLS state.

The frontend containers serve the Vite build through Nginx. The ticketing API is a separate Express service with Prisma and isolated Fluxora development and production PostgreSQL databases. The API is not deployed by the frontend CI workflows.

## Containers and port ownership

The app Compose file is `deploy/vm01/app/docker-compose.yml`. Frontend ports bind to the WireGuard interface only; they are not public listeners. The public Nginx gateway is the only internet-facing route to these services.

| Container | VM01 port | Purpose |
| --- | --- | --- |
| `fluxora-dev-frontend` | `8093` | Development studio site |
| `fluxora-prod-frontend` | `8094` | Production studio site |
| `fluxora-dev-eticket-backend` | `5102` | Development ticketing API |
| `fluxora-prod-eticket-backend` | `5103` | Production ticketing API |

Nilam owns separate storefront ports `8091`/`8092` and API ports `5100`/`5101`. Keep Nginx upstreams aligned with the matching service and hostname: `dev-topan.fluxorastudio.id` is Nilam and uses port `8091`; `dev.fluxorastudio.id` is Fluxora and uses port `8093`.

## Compose project isolation

Both repositories keep their app Compose file under a directory named `app`. Without an explicit Compose project name, Compose derives the same project name, `app`, for both deployments. Their shared service names such as `dev-frontend` can then cause one repository's deployment to replace the other's container, even when the host ports differ.

Nilam's app stack now uses the explicit project name `nilam`. Fluxora currently retains its inferred project name `app`; those names are separate, so future Nilam deploys will no longer collide with Fluxora. Do not use `docker compose down` against the old shared `app` project: it can affect containers belonging to both repositories. Database Compose stacks are separate and use their own project/network configuration.

## CI/CD boundaries

- `.github/workflows/development.yml` verifies the frontend and backend on pull requests and pushes to `main`; a successful push deploys the development frontend.
- `.github/workflows/production.yml` verifies the frontend and backend on pull requests and pushes to `prod`; a successful push deploys the production frontend.
- API migrations and API container rollouts are manual, documented in `deploy/README.md`.
- The workflows do not install or reload public gateway Nginx. Gateway configuration is maintained under `deploy/nginx-public/` and must be applied separately.

Database URLs and provider credentials belong in VM-only environment files or protected GitHub environments, never in this document or source control.
