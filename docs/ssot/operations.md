# Operations and release model

**Reviewed:** 2026-10-10  
**Status:** Development infrastructure and deployment materials exist. Production ticketing launch remains blocked on deployment and operational readiness items listed below.

## 1. Environments

| Environment | Frontend/API intent | Database | Payment posture |
|---|---|---|---|
| Local | Vite frontend and Express API on developer machine | Local PostgreSQL via Compose or PostgreSQL 16+ | Sandbox/default disabled; never use production credentials locally. |
| Development | Frontend deployed from `main`; API on VM01 port `5102` | Separate Fluxora dev PostgreSQL database | QRIS should remain disabled until merchant sandbox walkthrough passes. |
| Production | Frontend deployed from `prod`; API intended on VM01 port `5103` | Separate Fluxora prod PostgreSQL database | Keep disabled until provider, data recovery, security, and operations are approved. |

Production and development must have separate DB credentials, payment credentials, webhook encryption keys, signing secrets, allowed origins, and data. Never copy production secrets into development or the repository.

## 2. Deployment responsibility

- Frontend CI validates frontend/backend source and deploys the static frontend to VM01 on documented branch pushes.
- API deployment and migration are separate/manual procedures; frontend workflows do not deploy the API.
- Gateway Nginx vhost installation, DNS, certificate issuance/renewal, and reload are external infrastructure operations.
- DB Compose stack is separate from app stack and has isolated dev/prod databases.
- Apply migrations only after a database backup and verify environment/database target before running the migration task.
- Migration rollback is not automatic. The deployment guide describes restoring the pre-migration dump and redeploying the prior app version when needed.

## 3. Health and background work

### Health endpoints

- `GET /healthz`: process liveness; does not require database access.
- `GET /readyz`: database readiness check; returns unavailable when DB query fails.

### API process workers

The backend process starts timer-driven work:

| Worker | Interval in source | Function |
|---|---:|---|
| Reservation expiry | 10 seconds | Releases/reconciles expired inventory reservations. |
| Ticket email outbox | 15 seconds | Sends queued ticket email and retries failures. |
| Partner webhook delivery | 5 seconds | Delivers due partner webhook messages/retries. |

The current API starts these workers inside each non-test process. Before scaling to multiple replicas, verify that DB claims/leases prevent duplicate work and that only one effective action occurs for each delivery/reservation. The code should remain safe under retries and duplicate processing.

## 4. Operational queues and manual actions

SuperAdmin operational endpoints expose counts for ticket-email/webhook delivery states, refund-review orders, overdue pending payments, and expired active reservations. These counts exclude customer contact details and secrets.

Manual actions include:

- Requeue failed ticket delivery.
- Retry a failed partner webhook delivery.
- Review a late-paid order and record an externally completed refund reference.
- Inspect partner/API audit records and API key quota usage.

These APIs do not replace monitoring, alerting, ownership, or incident response. No completed monitoring/alerting plan with responders is evidenced.

## 5. Backups, restore, and recovery

Before a production rollout, the operator must:

1. Confirm DB identity/environment and record the release commit/image.
2. Create a non-empty pre-migration database backup.
3. Store scheduled backups encrypted and off the VM with separate dev/prod paths and retention.
4. Perform restore drills for both environments and record restore procedure, backup age, recovery time, and data-loss window.
5. Alert on backup failure, storage exhaustion, API readiness failure, worker backlog, and DB availability.

Status: `[NOT DONE]` The backend plan records that there is no configured Fluxora backup schedule/off-host retention and no restore drill. Do not infer recoverability from a documented example dump command.

## 6. Release procedure (high-level)

1. Review product/API/schema changes and confirm backwards-compatible rollout order.
2. Validate CI/build artifacts and identify exact release commit/image.
3. Verify target environment, secrets, database URL, provider mode, allowed origins, and gateway route.
4. Create and validate backup before DB change.
5. Run the environment-specific migration job.
6. Deploy/restart the matching API service and check container health, `/healthz`, `/readyz`, and migration status.
7. Deploy the matching frontend build and verify host/path routing and API origin.
8. Smoke test public catalogue, staff login/permissions, quote/order (provider-disabled where appropriate), and operational queue endpoints.
9. Observe logs/queues/health and record release evidence. Do not enable QRIS until provider validation and launch checklist pass.

Use the exact environment-specific commands in [`../../deploy/README.md`](../../deploy/README.md); this SSOT is not a substitute for runbook commands.

## 7. Recorded rollout state

The following are dated statements from implementation docs, not live checks performed by this SSOT page:

- Backend plan reports isolated dev/prod databases and dev API deployed on VM01 at `10.10.0.2:5102`, with health/readiness/migrations verified and QRIS disabled.
- Customer storefront rollout notes report customer hostname DNS/TLS and public gateway HTTPS checks complete, but current production frontend assets were older than the checked-in build.
- The same rollout notes report production API `/readyz` returning 503 and no production API container present.
- Dev API had no events with available inventory in the recorded storefront rollout check.
- Manual mobile/screen-reader verification, provider sandbox purchase, Brevo delivery, production event inventory, and full production checkout remain pending.

Recheck live environment before relying on these dated states.

## 8. Production launch checklist

- `[NOT DONE]` Current production storefront is deployed and correct at `e-ticket.fluxorastudio.id`.
- `[NOT DONE]` Production API is deployed, migrated after backup, and returns ready.
- `[NOT DONE]` Admin/partner portal DNS/TLS/gateway routes are verified and CORS/session behavior works.
- `[NOT DONE]` Provider sandbox success, expiry, duplicate/out-of-order callbacks, amount mismatch, and late-payment cases pass.
- `[NOT DONE]` Production provider credentials and enablement are approved after sandbox evidence.
- `[NOT DONE]` Brevo sender/domain, ticket delivery, retry, and privacy behavior pass a walkthrough.
- `[NOT DONE]` Backup schedule, off-host retention, restore drills, alerting, and responders are in place.
- `[NOT DONE]` Real event inventory is prepared and customer support/refund procedures are staffed.
- `[NOT DONE]` Email consent/promotions/reminders are implemented only after policy, unsubscribe/suppression, delivery, and abuse controls are designed.
- `[NOT DONE]` Manual mobile, accessibility, and browser verification is recorded.

## 9. Related documents

- [System architecture](architecture.md)
- [Platform PRD](PRD/fluxora-platform.md)
- [Email communications](email-communications.md)
- [Deployment runbook](../../deploy/README.md)
- [Backend rollout plan](../plansBE/eticket.md)

