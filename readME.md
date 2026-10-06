# Fluxora Studio

Company profile and lead-generation site for Fluxora Studio, a digital product studio building commerce, AI, logistics, and ticketing software.

The concert ticketing API is being developed in [`backend/`](backend/readMe.md). Its current scope and rollout status are tracked in [`docs/plansBE/eticket.md`](docs/plansBE/eticket.md).

## Local development

Requirements: Node.js 22+ and npm.

```sh
cd frontend
npm install
npm run dev
```

The Vite server runs at http://localhost:5173.

## Production build

```sh
cd frontend
npm ci
npm run build
```

## Deployment

See [deployment guide](deploy/README.md). The site is a static React/Vite frontend served by Nginx in Docker. GitHub Actions validates pushes to `main` and deploys it to dev; pushes to `prod` deploy production. Runtime DNS/TLS and the public Nginx gateway are managed outside this repository.

| Environment | Hostnames | vm01 port |
|---|---|---:|
| Development | `dev.fluxorastudio.id` | 8093 |
| Production | `fluxorastudio.id`, `www.fluxorastudio.id` | 8094 |

Git remote: `git@github-personal:unxpected7/fluxora.git`.
