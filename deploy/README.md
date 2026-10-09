# Deployment

Fluxora's studio website is a static React/Vite site served by Nginx. The concert ticketing API is a separate TypeScript/Express service with PostgreSQL and Prisma. The public Nginx gateway forwards HTTPS traffic over WireGuard to frontend and API containers on vm01.

| Environment | Git branch | Hostnames | vm01 bind |
|---|---|---|---|
| Development | `main` | `dev.fluxorastudio.id` | `10.10.0.2:8093` |
| Production | `prod` | `fluxorastudio.id`, `www.fluxorastudio.id` | `10.10.0.2:8094` |
| Development ticketing portals | `main` | `dev-admin-eticket.fluxorastudio.id`, `dev-partner-eticket.fluxorastudio.id` | `10.10.0.2:8093` |
| Production ticketing portals | `prod` | `admin-eticket.fluxorastudio.id`, `partner-eticket.fluxorastudio.id` | `10.10.0.2:8094` |
| Production customer ticket storefront | `prod` | `e-ticket.fluxorastudio.id` | `10.10.0.2:8094` |
| Development API | manual rollout | `dev-api-eticket.fluxorastudio.id` | `10.10.0.2:5102` |
| Production API | manual rollout | `api-eticket.fluxorastudio.id` | `10.10.0.2:5103` |

## vm01 setup

Place this checkout under `~/fluxora` on vm01. Configure the repository's self-hosted GitHub Actions runner on vm01 with Docker Compose access. The workflows target `self-hosted`. The application compose file does not join Nilam's database network and does not expose a public interface.

```sh
cd ~/fluxora
docker compose -f deploy/vm01/app/docker-compose.yml up --build -d dev-frontend
```

The current GitHub Actions workflows deploy the frontend on pushes after frontend verification. Pull requests and pushes also build the backend and validate its Prisma schema; they do not deploy the ticketing API. The isolated Fluxora dev/prod PostgreSQL containers have been provisioned on vm01; migrations and API deployment remain separate manual steps.

The API Compose services join `postgres_default` and require the untracked vm01 environment file to define `FLUXORA_DEV_DATABASE_URL` and `FLUXORA_PROD_DATABASE_URL`. A dedicated PostgreSQL Compose stack is in `deploy/vm01/postgres/docker-compose.yml`: dev binds to `192.168.100.35:5438`, prod binds to `127.0.0.1:5439`, and each has an independent named volume on `postgres_default`. Keep its `.env` on vm01 only. Payment defaults to disabled in both environments; the RajaOngkir QRISLY adapter is implemented, but live payment must remain disabled until sandbox and merchant-account validation is complete.

The API's `CLIENT_ORIGIN` list includes the customer e-ticket origin for public catalogue and checkout requests. `STAFF_CLIENT_ORIGIN` is a separate, narrower list for staff routes and excludes `e-ticket.fluxorastudio.id`; keep these lists distinct when adding frontend hosts.

## Nginx Proxy Manager on vm01

The Nginx Proxy Manager admin UI runs in Docker on vm01 and binds only to the WireGuard address `10.10.0.2:81`. The public VPS Nginx serves `manage-nginx.faizrasyid.my.id` over HTTPS and proxies the admin UI to vm01. This UI manages proxy hosts created inside Nginx Proxy Manager; it does not edit the existing public VPS Nginx configuration.

Create `/home/vm01/nginx-proxy-manager/.env` with `INITIAL_ADMIN_EMAIL` and a unique `INITIAL_ADMIN_PASSWORD`, restrict it to the vm01 operator (`chmod 600`), copy `deploy/vm01/nginx-proxy-manager/docker-compose.yml` into that directory, and start it with `docker compose up -d`. The admin port is intentionally not published on vm01's public interface. Configure the matching public vhost from `deploy/nginx-public/manage-nginx.faizrasyid.my.id` on the VPS, issue its TLS certificate, then reload Nginx.

## Ticketing API release procedure

### Provision the Fluxora ticketing databases

On vm01, create `/home/vm01/fluxora/postgres/.env` from `deploy/vm01/postgres/.env.example`, set independent random dev/prod passwords, and restrict the file to the vm01 operator (`chmod 600`). Keep the database stack and its environment file outside the ephemeral GitHub Actions checkout. Start the isolated database services:

```sh
cd /home/vm01/fluxora/postgres
docker compose --env-file .env -p fluxora-eticket-db -f docker-compose.yml up -d
docker compose --env-file .env -p fluxora-eticket-db -f docker-compose.yml ps
```

Use the internal hosts `fluxora-eticket-postgres-dev:5432` and `fluxora-eticket-postgres-prod:5432` for services on `postgres_default`. The example environment file includes `FLUXORA_DEV_DATABASE_URL` and `FLUXORA_PROD_DATABASE_URL` for the API migration/deployment Compose commands. The development database binds to the private VM interface on 5438; production binds only to localhost on 5439. Do not point either URL at Nilam's databases.

The API has explicit migration-only Compose services. They use the backend build stage, which includes the Prisma CLI, and are excluded from normal `docker compose up` by the `migrations` profile. Back up the target database before applying migrations. On vm01, load the private environment file and apply development migrations before starting the API:

```sh
cd /home/vm01/fluxora-actions-runner/_work/fluxora/fluxora
docker compose --env-file /home/vm01/fluxora/postgres/.env -f deploy/vm01/app/docker-compose.yml --profile migrations run --rm dev-eticket-migrate
docker compose --env-file /home/vm01/fluxora/postgres/.env -f deploy/vm01/app/docker-compose.yml up --build -d dev-eticket-backend
docker compose --env-file /home/vm01/fluxora/postgres/.env -f deploy/vm01/app/docker-compose.yml ps dev-eticket-backend
curl -fsS http://10.10.0.2:5102/readyz
```

Repeat with `prod-eticket-migrate`, `prod-eticket-backend`, and port `5103` only after the dev rollout and production approval. Add provider, email, and webhook encryption credentials to `/home/vm01/fluxora/postgres/.env` only when those features are approved; use independent 32-byte webhook encryption keys per environment. Dev Brevo sandbox mode defaults to true.

## Database backup and rollback

Keep database URLs in the vm01-only `.env`, never in shell history or this repository. Install the backup directory with restrictive permissions, then run a custom-format PostgreSQL dump before every migration and on a scheduled basis. Store copies away from vm01 and periodically rehearse restoring into a separate database.

```sh
sudo install -d -m 0700 -o "$USER" -g "$(id -gn)" /var/backups/fluxora
docker run --rm --network postgres_default -e DATABASE_URL="$FLUXORA_DEV_DATABASE_URL" postgres:16-alpine sh -c 'pg_dump --format=custom "$DATABASE_URL"' > "/var/backups/fluxora/dev-$(date +%Y%m%d-%H%M%S).dump"
```

Use the production database URL and a `prod-` filename for production. A successful command creates a non-empty dump; retain it under the organization's backup and retention policy. Before a release, record the deployed Git commit and image ID with `git rev-parse HEAD` and `docker inspect fluxora-dev-eticket-backend --format '{{.Image}}'` (use the prod container for production).

Migrations are forward-only. For an application-only rollback, check out the recorded prior commit and rebuild/restart the matching API service. If a migration must also be undone, stop the API, restore the pre-release database dump into the corresponding database, then restart the previous application version. Treat restore as destructive and verify the database target before running `pg_restore`; never restore dev data over production or vice versa. Inspect `docker compose logs --since=15m <service>` and `/readyz` during rollout. The container healthcheck covers liveness; configure host-level alerts and backup scheduling as part of VM operations.

## Public gateway setup

Create Cloudflare DNS records for the frontend, ticketing portal, and API hostnames in the table above, pointing to the public gateway. The current hostname requests are reaching the gateway's default PMeme Handal API vhost, so the Fluxora vhosts below must be enabled before the domains will serve this frontend.

For the first certificate issuance, install temporary HTTP-only vhosts for the frontend hostnames and the two API hostnames that serve `/.well-known/acme-challenge/` from `/var/www/certbot` (create that directory first). Keep Cloudflare proxying enabled only if HTTP challenge traffic is allowed through; otherwise temporarily set the records to DNS-only while issuing. Then run:

```sh
sudo certbot certonly --webroot -w /var/www/certbot -d dev.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d dev-admin-eticket.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d dev-partner-eticket.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d fluxorastudio.id -d www.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d admin-eticket.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d partner-eticket.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d e-ticket.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d dev-api-eticket.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d api-eticket.fluxorastudio.id
```

Replace the temporary vhost with the matching file from `deploy/nginx-public/` in `/etc/nginx/sites-available/`, enable it under `sites-enabled`, run `nginx -t`, and reload Nginx. The HTTP vhost preserves the ACME challenge path so certificate renewal continues to work.

The production frontend certificate shown in the vhost must cover both `fluxorastudio.id` and `www.fluxorastudio.id`. API vhosts use one certificate per API hostname. The certificate paths assume Certbot's standard `live/<certificate-name>` layout; update the paths if the certificate has a different name.

Public routing source files:

- `deploy/nginx-public/dev.fluxorastudio.id` → `10.10.0.2:8093`
- `deploy/nginx-public/dev-admin-eticket.fluxorastudio.id` → `10.10.0.2:8093`
- `deploy/nginx-public/dev-partner-eticket.fluxorastudio.id` → `10.10.0.2:8093`
- `deploy/nginx-public/fluxorastudio.id` → `10.10.0.2:8094`
- `deploy/nginx-public/admin-eticket.fluxorastudio.id` → `10.10.0.2:8094`
- `deploy/nginx-public/partner-eticket.fluxorastudio.id` → `10.10.0.2:8094`
- `deploy/nginx-public/e-ticket.fluxorastudio.id` → `10.10.0.2:8094`
- `deploy/nginx-public/dev-api-eticket.fluxorastudio.id` → `10.10.0.2:5102`
- `deploy/nginx-public/api-eticket.fluxorastudio.id` → `10.10.0.2:5103`

The GitHub Actions workflows deploy only to vm01; they do not install gateway configuration or issue certificates. Those steps require root access to the public gateway.
# Ticketing API rollout

The ticketing backend runs as separate dev and production services on vm01 and
uses API hostnames `dev-api-eticket.fluxorastudio.id` and
`api-eticket.fluxorastudio.id`. The VM Compose file expects
`FLUXORA_DEV_DATABASE_URL` and `FLUXORA_PROD_DATABASE_URL` in its untracked
deployment environment file and joins the existing `postgres_default` network.
Provision separate Fluxora dev/prod databases before starting the API services;
do not point either URL at Nilam's database.

Before bringing up a backend service, apply migrations with `npx prisma migrate deploy`
from a release image/one-off backend container using that environment's
`DATABASE_URL`. Do not run `migrate dev` against a deployed database.

Provider variables are environment-specific. Keep
`FLUXORA_*_CHECKOUT_PAYMENT_PROVIDER=disabled` until the sandbox QRIS ID and
callback identifiers have been validated. Set the QRIS API key, QRIS ID, and
stable ticket QR signing secret in the VM-only environment file. Do not place
credentials in this repository. Install the API Nginx vhosts only after DNS
and TLS certificates for the proposed API names are ready.
