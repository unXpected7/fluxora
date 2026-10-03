# Deployment

Fluxora is a static React/Vite site served by Nginx. It uses no database or backend service. The public Nginx gateway forwards HTTPS traffic over WireGuard to two frontend containers on vm01.

| Environment | Git branch | Hostnames | vm01 bind |
|---|---|---|---|
| Development | `main` | `dev.fluxorastudio.id` | `10.10.0.2:8093` |
| Production | `prod` | `fluxorastudio.id`, `www.fluxorastudio.id` | `10.10.0.2:8094` |

## vm01 setup

Place this checkout under `~/fluxora` on vm01. The Actions runner must be able to run Docker Compose and use the existing `nilam` self-hosted runner label. The application compose file does not join Nilam's database network and does not expose a public interface.

```sh
cd ~/fluxora
docker compose -f deploy/vm01/app/docker-compose.yml up --build -d dev-frontend
```

The GitHub Actions workflows deploy on pushes after frontend verification. Pull requests run verification only.

## Public gateway setup

Create the Cloudflare DNS records for `dev`, apex, and `www` pointing to the public gateway. Provision the certificates on the gateway before installing these TLS vhosts, for example with Certbot standalone while ports 80/443 are available:

```sh
sudo certbot certonly --standalone -d dev.fluxorastudio.id
sudo certbot certonly --standalone -d fluxorastudio.id -d www.fluxorastudio.id
```

Then copy the matching file from `deploy/nginx-public/` to the gateway's `/etc/nginx/sites-available/`, enable it under `sites-enabled`, run `nginx -t`, and reload Nginx. Use the certificate's actual directory name in the vhost if it differs from the host shown there.

The production certificate shown in the vhost must cover both `fluxorastudio.id` and `www.fluxorastudio.id`. The certificate paths assume Certbot's standard `live/<certificate-name>` layout; update the paths if the certificate has a different name.

Public routing source files:

- `deploy/nginx-public/dev.fluxorastudio.id` → `10.10.0.2:8093`
- `deploy/nginx-public/fluxorastudio.id` → `10.10.0.2:8094`

Neither installing gateway configuration, issuing TLS certificates, setting up DNS, nor deploying remotely is performed by this repository workflow.
