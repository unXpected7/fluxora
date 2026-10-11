# Fluxora Partner API v1

Versioned HTTPS API for approved concert organizers. The production base URL in the current Nginx configuration is `https://api-eticket.fluxorastudio.id`; development uses `https://dev-api-eticket.fluxorastudio.id`. These API hosts proxy to the ticketing backend. The partner workspace portal is `https://partner-eticket.fluxorastudio.id` in production and `https://dev-partner-eticket.fluxorastudio.id` in development.

## Authentication and scopes

Send the partner API key in every API request:

```http
Authorization: Bearer flx_live_<secret>
```

Create keys from the authenticated partner admin API at `/api/staff/partners/:partnerId/admin/api-keys`. A key is bound to one partner, returned only once, stored as a SHA-256 hash, and may have an expiry. The supported scopes are:

| Scope | Allows |
|---|---|
| `events:read` | Read the key owner's published event catalogue. Required on every key. |
| `checkout:create` | Create quotes/orders and start payment for the key owner's events. |
| `orders:read` | Read order/payment/ticket status using the private quote access token. Requires `checkout:create`. |

Partner owners/admins may list key metadata, create a key, rotate a key, and revoke a key. Key creation accepts optional `rateLimitPerMinute` (integer 1–600, default 120). `POST /api/staff/partners/:partnerId/admin/api-keys/:keyId/rotate` creates a replacement atomically and returns its token once. By default it revokes the old key immediately. Set `rotationGraceMinutes` from 1 to 10,080 (7 days) to let the old key expire after a short overlap; the old key's existing expiry, if earlier, is retained. The new key inherits scopes, quota, and expiry unless replacement values are supplied in the request. `DELETE /api/staff/partners/:partnerId/admin/api-keys/:keyId` revokes a key immediately. Never put a key in a URL, browser bundle, or log. Staff session credentials are separate from API keys.

The API applies a database-backed fixed-window quota shared between API instances. The default is 120 requests per minute per key; key creation can set a limit from 1 to 600 requests per minute. Windows are retained for 24 hours and then pruned. SuperAdmins can inspect paginated usage at `GET /api/staff/admin/api-usage`: current-minute requests, total requests and estimated rate-limited requests for the prior hour, key/partner status, and last-use time. The estimate counts requests above the configured fixed-window limit in each minute. This endpoint does not expose key hashes or secrets. Fixed windows do not provide burst shaping.

## Catalogue

### `GET /api/v1/events`

Returns published, not-ended events owned by the key's active partner, with on-sale performances, active ticket types, and active bundles.

```json
{
  "items": [
    {
      "id": "event-id",
      "slug": "summer-concert",
      "title": "Summer Concert",
      "summary": "...",
      "coverImageUrl": null,
      "venueName": "Venue",
      "venueAddress": "...",
      "city": "Jakarta",
      "timezone": "Asia/Jakarta",
      "startsAt": "2026-12-01T12:00:00.000Z",
      "endsAt": "2026-12-01T16:00:00.000Z",
      "performances": [],
      "bundles": []
    }
  ]
}
```

Catalogue responses include ticket and bundle prices, capacities, sold/reserved counts, and bundle component quantities. Availability and sale-window calculations are not included in this partner API response; use checkout quote creation as the authoritative availability check.

### `GET /api/v1/events/:slug`

Returns the same event shape for one published event belonging to the key's partner. Returns `404` if it is absent, not published, ended, or owned by another partner.

## Checkout lifecycle

All checkout requests require `checkout:create`. Selection IDs and prices are validated server-side against the API key's partner. A checkout can contain products from one partner only. The existing checkout limits apply: at most 10 units of a selection and 20 admissions in an order; each quote holds inventory for 15 minutes.

### 1. Create a quote — `POST /api/v1/checkout/quotes`

Request:

```json
{
  "email": "buyer@example.com",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "phone": "+628123456789",
  "tickets": [{ "id": "ticket-type-id", "quantity": 2 }],
  "bundles": [{ "id": "bundle-id", "quantity": 1 }]
}
```

At least one ticket or bundle is required. `firstName`, `lastName`, and `phone` are optional. The server ignores client price fields and reserves inventory transactionally.

Response (`201`):

```json
{
  "id": "quote-id",
  "accessToken": "private-quote-token",
  "email": "buyer@example.com",
  "subtotal": 100000,
  "fees": 0,
  "total": 100000,
  "expiresAt": "2026-12-01T12:15:00.000Z",
  "items": []
}
```

Keep `accessToken` private. Customer API order/payment calls use it as a bearer credential; partner API calls send it in `X-Order-Access-Token` alongside the partner key in `Authorization`.

### 2. Create an order — `POST /api/v1/checkout/orders`

Request:

```http
Idempotency-Key: concert-checkout-00000001
Content-Type: application/json
```

```json
{ "quoteId": "quote-id", "accessToken": "private-quote-token" }
```

The idempotency key must contain 16–128 safe characters. Reuse the same key when retrying the same submission; do not reuse it for another quote.

Response (`201`, or `200` for replay):

```json
{ "id": "order-id", "orderNumber": "FLX-20261201-...", "replayed": false }
```

### 3. Start QRIS payment — `POST /api/v1/checkout/orders/:id/payment`

Request:

```http
Authorization: Bearer flx_live_<secret>
X-Order-Access-Token: private-quote-token
```

Response includes `orderId`, provider, provider payment ID, QR display data, expiry, and a `replayed` flag. A retry may return the already-created payment session. Payment is confirmed only by server-side provider status verification; a client response cannot mark an order paid.

### 4. Retrieve order status — `GET /api/v1/checkout/orders/:id`

Requires both `checkout:create` and `orders:read` scopes, plus the private quote access token in `X-Order-Access-Token`. The partner key stays in `Authorization: Bearer ...`. Returns order/payment status, item snapshots, QR payment instructions, issued ticket QR tokens, and email delivery state. Treat this response as sensitive customer data and do not expose it in public pages, analytics, or logs.

## Errors and safe retry behavior

Typical responses include `400` for invalid input, `401` for missing/expired/revoked keys or invalid private order tokens, `403` for missing API scope, `404` for unavailable partner-owned resources, `409` for expired quotes, unavailable inventory, or idempotency conflicts, `429` for rate limits, and `5xx` for service/provider failures. Error bodies use `{ "message": "..." }` and include `requestId` on unexpected server errors.

Retry quote creation only after deciding how to handle the previous quote's inventory hold. Retry order creation with its original idempotency key. Retry payment-session creation or order status with the same quote access token. Do not assume a timeout means the operation failed.

## Current API boundaries

- API-key checkout currently uses the configured platform QRIS provider. Cross-partner checkout remains disabled.
- Partner webhooks and API-key usage dashboards are implemented. Customer-account endpoints and partner settlement reports are not part of the current contract. Quotas are database-backed fixed windows, not sliding-window or burst controls.
- The contract and API hostnames match the current Nginx configuration. DNS/TLS reachability and a real external integration remain to be verified; a committed Nginx virtual host alone does not prove those are live.

## Outbound partner webhooks

Webhook endpoints are managed with a partner staff session at `/api/staff/partners/:partnerId/admin/webhooks`:

- `GET` lists endpoint metadata without returning signing secrets.
- `POST` registers `{ "name": "...", "url": "https://organizer.example/webhooks/fluxora", "eventTypes": ["payment.verified"] }`. The response returns a new signing secret once.
- `POST /:webhookId/rotate-secret` immediately replaces the secret and returns the new value once. The `X-Fluxora-Key-Version` header increments; configure the receiver with the new secret before expecting future retries to verify.
- `DELETE /:webhookId` deactivates an endpoint.
- `GET /api/staff/partners/:partnerId/admin/webhook-deliveries?limit=50` lists recent delivery status; `POST /webhook-deliveries/:deliveryId/retry` manually requeues a failed delivery.

The supported event types are `checkout.order_created`, `payment.verified`, `tickets.issued`, `payment.late_paid_manual_review`, `payment.expired`, `payment.cancelled`, `payment.refund_confirmed_manually`, and `checkout.reservation_expired`. Payloads use a stable delivery ID and contain order identifiers/state and event-specific data, without buyer email/phone, provider secrets, or ticket QR bearer tokens.

Each POST includes `X-Fluxora-Event`, `X-Fluxora-Delivery`, `X-Fluxora-Timestamp`, `X-Fluxora-Key-Version`, and `X-Fluxora-Signature: t=<unix-seconds>,v1=<hex-hmac>`. Verify `v1` as HMAC-SHA256 using the endpoint secret over the exact bytes `timestamp + "." + raw HTTP request body`; compare signatures in constant time, reject timestamps outside the receiver's tolerance, and deduplicate delivery IDs. The same delivery ID is used for automatic retries and manual replay, while each attempt is signed with a fresh timestamp.

Responses with 2xx are marked delivered. Failures retry with exponential backoff (starting at 15 seconds, capped at one hour) for up to 12 attempts before entering `FAILED`; admins can manually replay failed deliveries. Endpoint secrets are AES-256-GCM encrypted at rest. Configure the same `PARTNER_WEBHOOK_ENCRYPTION_KEY` on every API instance in an environment; use a different key per environment. Endpoint setup requires HTTPS, a public DNS destination, and a standard port; resolved IPs are pinned for the request and private/reserved ranges are rejected.
