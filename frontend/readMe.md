# Frontend

React, TypeScript, and Vite frontend. The default routes serve the Fluxora Studio company profile. Host-aware staff portals render SuperAdmin and partner workspaces; SuperAdmins can inspect partner details, assign owners, and review partner audit records. The customer storefront supports event discovery, event details, a single-event ticket/bundle cart, server quotes, order creation, payment-session requests, and private-token manual order status refresh. The storefront uses the configured `VITE_BACKEND_URL` or the environment's ticketing API hostname and reports unavailable QRIS without marking an order paid. Order recovery after leaving the page and the ticket wallet remain pending.

Partner staff can create and edit events, performances, ticket types, and same-event bundles through tenant-scoped backend APIs. They can archive events, pause or close performances, configure ticket/bundle sales windows and per-order limits, configure performance check-in windows, and set nullable bundle capacity. Ticket capacity updates are bounded by sold plus reserved inventory; bundle composition stays fixed after creation to preserve order snapshots. The partner workspace also provides email-based staff lookup, membership controls, event gate assignments, a paginated order/admission list, and per-event check-in counts. Order views omit buyer contact information and QR credentials. Staff invitation onboarding is not implemented yet. The same static build is served by Nginx.

```sh
npm install
npm run dev
npm run build
```

The staff portals use the backend's HttpOnly session cookie and require the exact portal origins to be allowed by backend CORS. Current hostname proposals and their deployment state are tracked in [`../docs/api/subdomains.md`](../docs/api/subdomains.md) and [`../deploy/README.md`](../deploy/README.md). Domain publication and TLS setup remain a separate deployment step.
