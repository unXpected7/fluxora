# Deployment

Fluxora is a static React/Vite site served by Nginx. It uses no database or backend service. The public Nginx gateway forwards HTTPS traffic over WireGuard to two frontend containers on vm01.

| Environment | Git branch | Hostnames | vm01 bind |
|---|---|---|---|
| Development | `main` | `dev.fluxorastudio.id` | `10.10.0.2:8093` |
| Production | `prod` | `fluxorastudio.id`, `www.fluxorastudio.id` | `10.10.0.2:8094` |

## vm01 setup

Place this checkout under `~/fluxora` on vm01. Configure the repository's self-hosted GitHub Actions runner on vm01 with Docker Compose access. The workflows target `self-hosted`. The application compose file does not join Nilam's database network and does not expose a public interface.

```sh
cd ~/fluxora
docker compose -f deploy/vm01/app/docker-compose.yml up --build -d dev-frontend
```

The GitHub Actions workflows deploy on pushes after frontend verification. Pull requests run verification only.

## Public gateway setup

Create the Cloudflare DNS records for `dev`, apex, and `www` pointing to the public gateway. The current hostname requests are reaching the gateway's default PMeme Handal API vhost, so the Fluxora vhosts below must be enabled before the domains will serve this frontend.

For the first certificate issuance, install a temporary HTTP-only vhost for all three hostnames that serves `/.well-known/acme-challenge/` from `/var/www/certbot` (create that directory first). Keep Cloudflare proxying enabled only if HTTP challenge traffic is allowed through; otherwise temporarily set the records to DNS-only while issuing. Then run:

```sh
sudo certbot certonly --webroot -w /var/www/certbot -d dev.fluxorastudio.id
sudo certbot certonly --webroot -w /var/www/certbot -d fluxorastudio.id -d www.fluxorastudio.id
```

Replace the temporary vhost with the matching file from `deploy/nginx-public/` in `/etc/nginx/sites-available/`, enable it under `sites-enabled`, run `nginx -t`, and reload Nginx. The HTTP vhost preserves the ACME challenge path so certificate renewal continues to work.

The production certificate shown in the vhost must cover both `fluxorastudio.id` and `www.fluxorastudio.id`. The certificate paths assume Certbot's standard `live/<certificate-name>` layout; update the paths if the certificate has a different name.

Public routing source files:

- `deploy/nginx-public/dev.fluxorastudio.id` → `10.10.0.2:8093`
- `deploy/nginx-public/fluxorastudio.id` → `10.10.0.2:8094`

The GitHub Actions workflows deploy only to vm01; they do not install gateway configuration or issue certificates. Those steps require root access to the public gateway.
