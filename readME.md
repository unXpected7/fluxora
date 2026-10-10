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



====
cd backend
FLUXORA_STAFF_EMAIL=you@example.com \
FLUXORA_STAFF_PASSWORD='your-own-password-of-at-least-12-characters' \
FLUXORA_STAFF_ROLE=SUPERADMIN \
npm run staff:create

curl -i -X POST http://localhost:4000/api/staff/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-own-password-of-at-least-12-characters"}'

====
FLUXORA_STAFF_EMAIL=you@example.com FLUXORA_STAFF_PASSWORD='choose-a-password-at-least-12-chars' FLUXORA_STAFF_ROLE=SUPERADMIN npm run staff:create


====
Prerequisites: Docker Desktop running, and Node.js 22+ with npm.

1. In a VS Code terminal, start the database and prepare the backend:

cd backend
cp .env.example .env
npm ci
docker compose -f docker-compose.local.yml up -d
npm run db:generate
npm run db:migrate
npm run db:seed

The database is available at localhost:5439. The local .env points Prisma there.

2. Start the API in that terminal:

npm run dev

The API runs at http://localhost:4000; you can check it at http://localhost:4000/healthz.

3. Open another VS Code terminal and start the frontend:

cd frontend
npm ci
npm run dev

Open http://localhost:5173/tickets for the ticket storefront. The frontend uses the local API on localhost:4000 when accessed on localhost.

To stop the database later, run this from backend:

docker compose -f docker-compose.local.yml down

That keeps the database data volume. For a first admin login, create a local staff account from backend in another terminal:

FLUXORA_STAFF_EMAIL=you@example.com FLUXORA_STAFF_PASSWORD='choose-a-password-at-least-12-chars' FLUXORA_STAFF_ROLE=SUPERADMIN npm run staff:create

Then visit http://localhost:5173/ and sign in. The local database uses development-only credentials from .env.example; don’t replace them with production credentials.
  Worked for 20s • 23:06

how to access the page fronted admin,customer,partner, and api

With the frontend and API running locally:

| Page | URL |
|---|---|
| Admin portal | http://localhost:5173/ |
| Partner workspace | http://partner.localhost:5173/ |
| Customer storefront | http://localhost:5173/tickets |
| API | http://localhost:4000 |
| API health check | http://localhost:4000/healthz |

Sign in to admin and partner with the staff account you created using npm run staff:create. partner.localhost selects the partner workspace; if your browser doesn’t resolve that hostname, use the customer and admin URLs above and tell me what browser you’re using.

The API has no browsable page at its root. You can try an endpoint such as http://localhost:4000/api/events to see the event catalogue.
  Worked for 4s • 23:07