# Public Nginx routing

The public gateway proxies Fluxora hosts over WireGuard to vm01 (`10.10.0.2`).

| Hostname | vm01 upstream |
|---|---|
| `dev.fluxorastudio.id` | `10.10.0.2:8093` |
| `fluxorastudio.id` | `10.10.0.2:8094` |
| `www.fluxorastudio.id` | `10.10.0.2:8094` |
| `dev-api-eticket.fluxorastudio.id` | `10.10.0.2:5102` |
| `api-eticket.fluxorastudio.id` | `10.10.0.2:5103` |

Install the matching virtual host files on the public gateway, configure Cloudflare DNS, provision TLS certificates, test with `nginx -t`, and reload Nginx. See [deployment guide](../README.md).
