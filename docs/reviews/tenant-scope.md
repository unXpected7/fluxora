# Tenant scope source review

**Review date:** 2026-10-09  
**Scope:** Static source review of staff administration, public catalogue, partner API, checkout, and event operations routes. This is not a runtime penetration test or production authorization approval.

## Access checks reviewed

- Staff admin routes require a current staff session. Partner-scoped admin paths require an active partner membership with an owner, admin, or event-manager role; SuperAdmin access is global.
- Event reads and writes use the selected partner scope. Performance and ticket-type operations resolve their parent event before access; bundle creation verifies every component ticket belongs to the selected event.
- Membership reads and writes are partner-filtered. Membership changes require partner owner/admin access; assigning OWNER is SuperAdmin-only; deactivation protects the last active owner and removes that user's gate assignments for the partner.
- Staff account search requires owner/admin access, limits results to 20 active accounts, and returns only ID, email, and membership state for the selected partner.
- Gate assignment operations first scope the event to the partner. Assignment accepts only an active staff account with an active GATE membership in that same partner.
- API key and webhook metadata/delivery operations filter by partner ID. Key creation, rotation, revocation, webhook creation/secret rotation, and delivery replay require owner/admin access; secrets are only returned at creation/rotation.
- Event order and check-in summaries first resolve the event through the partner scope. Platform refund review, ticket-delivery retry, and manual refund confirmation require SuperAdmin access.
- Partner API requests validate the bearer key hash, expiry, revocation, partner status, rate quota, and route scope. Catalogue reads filter by the key's partner. Checkout validates the quote access token and partner ownership.
- Customer order status and payment routes require the quote access token as a bearer credential; order IDs alone do not grant access.

## Remaining runtime verification

- Exercise cross-tenant ID and slug substitution, inactive partner/key, missing scope, unauthorized role, and gate assignment cases against isolated fixtures.
- Verify legacy tenant backfill and order/ticket ownership from a restored database containing representative existing sales data.
- Review buyer PII exposure and operational actions after the approved partner role policy is finalized.
