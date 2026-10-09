# Customer e-ticket storefront v1

**Status:** Implementation complete for the code changes; DNS/TLS, gateway installation, provider approval, and live production verification are pending  
**Implementation progress (2026-10-09):**

| Phase | Status | Notes |
|---|---|---|
| 0. Contract and ownership | In progress | Single-event/single-partner v1, IDR, and required email are reflected in implementation; provider validation and dev-hostname decision remain open. |
| 1. Host and deployment routing | Gateway deployed; app pending | Proxied Cloudflare DNS, Let's Encrypt certificate, and full HTTPS gateway proxy are live and verified. Production still serves an older frontend build, and its ticketing API returns 503. |
| 2. Event discovery | Code complete | Catalogue is a separate component with search, city/date filters, sorting, loading/error/empty states, image fallback, metadata, starting prices, and canonical deep links. |
| 3. Purchase flow | Code complete | Single-event checkout uses API quote/order/payment flow; session recovery retains idempotency and quote access in tab storage, polls every 15 seconds, and renders issued ticket QR codes from signed values fetched through the private API. Pending-order cancellation requires backend/provider cancellation semantics. |
| 4. Readiness | Partially complete | Frontend/backend builds, Compose validation, 7 frontend tests, and 5 backend tests pass. DNS/TLS/gateway are live; production frontend/API deployment, event inventory, provider validation, and manual visual/screen-reader checks remain. |


**Target hostname:** `e-ticket.fluxorastudio.id`  
**Frontend:** existing React/Vite app in `frontend/`  
**API:** existing ticketing backend in `backend/`

## Goal

Add a customer-facing e-ticket site at `https://e-ticket.fluxorastudio.id`. Its home page lists all currently published events that are available for public sale. A customer can open an event, choose a performance and ticket types or bundles, provide contact details, reserve inventory, create an order, and pay with the configured QRIS provider. The page must make clear when payment is unavailable and must never imply that an order is paid until the backend confirms it.

The v1 shopping flow is **browse many events, purchase one event per order**. The backend currently rejects a quote containing events from more than one partner, and the existing storefront model is built around a single selected event. Keep that boundary in v1; a cross-event cart would require explicit multi-partner order, settlement, refund, and fulfillment decisions.

## Existing implementation to build on

- `frontend/src/App.tsx` already contains `TicketStorefront`, event list/detail rendering, ticket and bundle quantity selection, quote creation, order creation, QRIS payment display, and private order-status refresh.
- The frontend currently selects the storefront for `ticket-eticket` hostnames, `/tickets`, and `/event/:slug`. `e-ticket.fluxorastudio.id` does not match that hostname check, so host routing must be added.
- `GET /api/events` returns published future events from active partners, with on-sale performances, ticket types, bundles, and calculated availability. `GET /api/events/:slug` returns one event's public details.
- `POST /api/checkout/quotes` validates current prices and sale windows and reserves stock for 15 minutes. It accepts one partner's inventory only and limits an order to 20 admissions.
- `POST /api/checkout/orders` requires the quote ID/access token and an `Idempotency-Key`. `POST /api/checkout/orders/:id/payment` creates/replays payment instructions; `GET /api/checkout/orders/:id` requires the quote access token as Bearer authorization.
- Payment provider configuration defaults to disabled in deployment. The UI should continue to handle a backend `503` as unavailable and must not mark an order paid from browser state.
- The current event detail route uses `/event/:slug`; the new host can keep that route and share existing components instead of making a second checkout implementation.

## Customer experience

### Storefront home (`/`)

- Show Fluxora Tickets branding, a short explanation, and a clear event catalogue.
- List upcoming published events as cards with cover image (when present), event title, city, venue, date range, and a useful starting price when ticket inventory exists.
- Offer simple search by event name/city and filter/sort controls only if they can be implemented cleanly with the catalogue data (recommended v1 filters: city and upcoming date; default order: soonest first).
- Show an explicit empty state when no events are on sale, a retryable error state when the API is unavailable, and loading placeholders while the catalogue loads.
- Hide or label events that have no currently purchasable ticket/bundle inventory; do not show stale availability as a guarantee.

### Event detail (`/event/:slug`)

- Show event description, venue/address, city, localized event dates, and available performances.
- Group ticket types under each performance and show price, description, availability, and per-order maximum.
- Show bundles with included ticket categories, total admissions, price, availability, and per-order maximum.
- Allow quantities to be selected for ticket types and bundles belonging to this event only. Validate user input for usability, while treating API validation as authoritative.
- Keep selected quantities when navigating between the event detail and checkout step where practical; do not claim inventory is reserved until quote creation succeeds.
- Handle sold-out, closed-sales, event-not-found, and event-edited-during-checkout responses with a clear refresh/reselect path.

### Checkout and order status

- Collect required email and optional first name, last name, and phone. State where the order confirmation/tickets will be delivered when ticket email delivery is enabled; also explain how to keep the private order link/token safe.
- Request a quote before order creation and show the server-returned line items, subtotal/fees/total, and quote expiry. The displayed amount must come from the API response.
- Create the order with a cryptographically random, persisted-for-retry idempotency key per checkout attempt. Keep quote access token and order ID in session storage (or equivalent short-lived browser storage) so refresh/retry works in the same browser session; never put the token in analytics, logs, or a public URL.
- Request payment instructions and show QR image/content, amount, expiry, and pending state when available. Poll or refresh status at a bounded interval while the order is pending, with a visible manual refresh action and a stop condition at terminal states/expiry.
- Show success only after the server reports paid and issued/available tickets. Show pending, expired, failed, refund review, and provider-unavailable states separately. Never trust a return URL or client-side timer as proof of payment.
- On confirmed payment, show order number and issued ticket/admission information returned by the private order endpoint. Preserve a safe recovery path within the same browser session if the customer reloads.

## Implementation phases

### Phase 0 — Confirm contract and deployment ownership

- [x] Confirm product decisions: Indonesian rupiah formatting, required contact fields, ticket email expectations, event image fallback, and v1 one-event-per-order / one-partner limitation.
- [ ] Confirm provider status per environment. Keep payment disabled until sandbox QRIS generation, status reconciliation, expiry, and ticket issuance have passed an end-to-end purchase.
- [x] Create a proxied Cloudflare A record for `e-ticket.fluxorastudio.id` pointing to public gateway `171.22.173.4`; public resolvers return proxied Cloudflare addresses. Decide separately whether a development customer hostname is needed.
- [x] Include `https://e-ticket.fluxorastudio.id` in production `CLIENT_ORIGIN` for public cross-origin catalogue/checkout calls, while keeping it out of the narrower `STAFF_CLIENT_ORIGIN`. Customer checkout uses bearer quote tokens and does not send cookies.

### Phase 1 — Route the hostname to the existing storefront

- [x] Update host detection in `frontend/src/App.tsx` so `e-ticket.fluxorastudio.id` at `/` renders the ticket catalogue, while the studio domains continue rendering the marketing site.
- [x] Keep `/tickets` and `/event/:slug` working on the existing studio host for local development/backward compatibility.
- [x] Ensure the frontend API base URL selects the production ticketing API on `e-ticket.fluxorastudio.id` and can be overridden with `VITE_BACKEND_URL` for local/dev builds.
- [x] Add a production public gateway Nginx vhost under `deploy/nginx-public/` forwarding to vm01 `10.10.0.2:8094`, and add the hostname to `deploy/nginx-public/README.md` and `deploy/README.md`.
- [x] Document DNS, TLS issuance/renewal, gateway installation/reload, and the fact that GitHub Actions only deploys the frontend to vm01. Do not treat a checked-in vhost as live deployment.
- [x] Install a temporary HTTP-only ACME challenge vhost on the public gateway. `nginx -t` and reload passed; a temporary challenge file was fetched through the gateway and removed. After issuance, this vhost was replaced by the full HTTPS proxy config.
- [x] Issue the Let's Encrypt certificate and replace the temporary vhost with the checked-in HTTPS proxy config. `nginx -t` and reload passed; HTTP redirects to HTTPS, direct-origin and public Cloudflare HTTPS return 200 with valid certificates, and Certbot renewal is scheduled.

### Phase 2 — Build a focused event discovery page

- [x] Extract the event catalogue into a focused `CustomerEventCatalogue` component and keep event detail/checkout in the shared `TicketStorefront` flow; no duplicate checkout implementation was added.
- [x] Use `GET /api/events` for the catalogue and `GET /api/events/:slug` for event detail with the existing typed responses and error mapping. Consolidating duplicate URL selection logic into a shared client remains follow-up work.
- [x] Implement event cards, search/filter/sort, responsive layout, empty/loading/error states, image fallback/alt text, and keyboard/focus behavior. Date and city filters, sort options, skeleton loading, retry, empty states, image alt text/fallback, and visible focus styling are in place.
- [x] Use the API's `available` counts and returned sale-eligible data as display hints and rely on quote creation for final inventory validation. The quote API is the final availability check.
- [x] Keep `/event/:slug` deep links reloadable through Nginx's SPA fallback. Add page title/description metadata per event and canonical URL behavior for the new hostname.

### Phase 3 — Complete the single-event purchase flow

- [x] Reuse quote/order/payment endpoints and current server-authoritative amount behavior.
- [x] Keep the cart scoped to one selected event. The current event detail page can only submit its own ticket and bundle IDs; no cross-event cart is presented.
- [x] Add robust request states: disable duplicate submits while in flight; reuse the same idempotency key after ambiguous order-create failures; refresh quote after expiration; explain sold-out/conflict responses.
- [x] Preserve quote access token, order ID, and idempotency key in tab-scoped sessionStorage for reload recovery; do not store buyer data or use localStorage.
- [x] Poll pending order status every 15 seconds and cancel the interval when the order changes state or the component unmounts. A backoff policy and `Retry-After` support remain future improvements.
- [x] Render each paid ticket QR code and identifier from the private order response, and show email delivery status without promising delivery when it is unavailable. QR values stay in memory and are stripped from session storage.
- [x] Defer pending-order cancellation until the backend can safely cancel/reconcile provider payments; hiding recovery while a payment can still settle would risk losing access to a paid ticket.

### Phase 4 — Security, accessibility, and operational readiness

- [x] Verify public API responses expose no buyer data, QR credential, provider secret, or internal partner information.
- [x] Review browser storage and production security behavior. Quote access data is tab-scoped and absent from URLs; bearer ticket QR values are removed before order data is stored. sessionStorage remains readable by same-origin scripts and requires the usual XSS protections.
- [x] Ensure API calls use HTTPS in hosted environments and CORS permits the customer origin only where needed. Confirm credential use is not enabled unnecessarily for public catalogue/quote calls.
- [x] Review responsive styles, keyboard focus treatment, semantic labels/live regions, form validation/error announcements, color contrast, and localized date/currency formatting in code. Mobile cards collapse to one column; form controls have visible focus; errors/notices use live regions; event dates and IDR amounts use Indonesian locale formatting. Measured storefront text pairs exceed WCAG AA normal-text contrast: ink/page 13.81:1, muted/page 5.29:1, blue/white 5.37:1, error/error-background 6.79:1, and success/success-background 5.53:1.
- [ ] Complete manual browser checks on mobile widths and screen-reader announcements. Automated tests verify catalogue keyboard tab order and accessible control names, but no browser binary or screen-reader is available in this workspace to verify rendered layouts and assistive-technology behavior.
- [x] Add frontend behavior tests for host routing, API environment selection, catalogue filtering/sorting, keyboard tab order/accessibly named controls, and keeping bearer ticket QR values out of session recovery. `npm run build` and `npm test` pass (7 tests).
- [ ] Validate remaining production readiness: deploy the current frontend, deploy and migrate the production API, validate `/readyz`, create or identify production events with available inventory, and run an approved provider transaction. Keep QRIS disabled until sandbox and operational approval are complete. Verified 2026-10-09: proxied DNS resolves; a public certificate is issued and Certbot renewal is scheduled; the full gateway vhost passed `nginx -t` and reload; direct-origin HTTPS returns 200 with a valid certificate; public Cloudflare HTTPS returns 200 with a valid certificate; HTTP redirects to HTTPS. vm01 production frontend responds but serves an older asset build. The production API `/readyz` returns 503 and its container is absent. The dev API is ready but has zero events with available inventory. Manual mobile and screen-reader checks remain because no browser or screen reader is available in this workspace.
## API contract and likely backend follow-up

The existing endpoints are sufficient for a first catalogue and one-event purchase. Before implementation, verify these details against live API responses and address gaps only where required:

- Catalogue price summary: API currently gives ticket/bundle prices and availability nested by event; frontend can derive the lowest available price. Do not add a separate summary endpoint unless performance or UX needs it.
- Event availability: check whether events with no on-sale performances/bundles should be omitted from `GET /api/events`; the frontend should not present such an event as purchasable.
- Order status response: confirm it returns paid ticket details and payment terminal states needed for the result page. Add only safe customer-facing fields; continue requiring the quote access token.
- Payment disabled/expired behavior: surface backend statuses and `503` accurately; never use client-side state to infer settlement.
- Multi-partner checkout: explicitly out of scope for v1. Current quote code rejects cross-partner orders. Supporting that later needs a business decision for one payment across partners, split settlement, cancellations/refunds, and partial fulfillment, then schema/API changes and dedicated migration/testing.

## Acceptance criteria

- [ ] Visiting `https://e-ticket.fluxorastudio.id/` reaches the gateway over valid HTTPS, but vm01 serves an older frontend asset build. Deploy the current build, then verify the live event catalogue.
- [x] Customer can browse multiple published events, open an event by a shareable deep link, see performances/ticket types/bundles, and begin checkout for one event.
- [x] Quote total and expiry shown to the customer come from the API; stale/sold-out selections show API errors and offer ticket reselection.
- [x] Repeated order creation after a timeout reuses the same tab-persisted idempotency key.
- [x] The customer sees pending/paid/failed/expired/refund-review/provider-unavailable states; issued QR tickets appear only after backend-confirmed payment.
- [x] Reload during checkout can recover the order in the same tab session without placing private tokens or QR credentials in the URL.
- [x] The current studio marketing site, staff portals, `/tickets`, and `/event/:slug` routes remain available in host/path routing.
- [x] Cloudflare DNS, TLS certificate, full HTTPS proxy vhost, HTTP redirect, and live gateway checks are complete.
- [ ] Deploy the current frontend and production API, apply production migrations after backup and approval, and run live catalogue/checkout verification.

## Out of scope for v1

- A single order containing events from multiple partners.
- Seat maps/assigned seating, promo codes, loyalty accounts, customer login, ticket transfer, automated refunds, and multi-currency.
- A custom CMS for customer-facing landing page content beyond event fields already managed by partner staff.
- Production payment enablement before provider sandbox and merchant operations have been validated.
- Cancellation of an active pending payment; the backend/provider need a verified cancellation and settlement-reconciliation contract first.
