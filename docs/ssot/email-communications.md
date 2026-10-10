# Customer and organizer email communications

**Reviewed:** 2026-10-10  
**Status:** Transactional ticket email pipeline is implemented but provider delivery setup is pending. Organizer campaigns and periodic event reminders are product requirements, not implemented features.

## 1. Message categories

| Category | Purpose | Audience | Consent/status |
|---|---|---|---|
| Transactional | Order/payment status, ticket delivery, necessary event/order changes | Relevant customer/order | Ticket delivery outbox exists; provider setup and full delivery validation pending. |
| Event reminder | Periodic notice about an event the customer purchased tickets for | Purchasers for that event | Requested by product owner; scheduling, frequency, preference and delivery controls not implemented. |
| News/promotional | Organizer news, future events, offers, or other marketing | Customers who explicitly opted in to that organizer | Optional consent capture, campaigns, unsubscribe, and suppression not implemented. |

Do not treat a purchase as permission for promotional email. Do not make marketing consent a condition of purchase. Keep transactional communication operationally and visibly distinct from marketing campaigns. Product/legal policy owners should approve exact message classification and controls before launch.

## 2. Existing transactional delivery

- Ticket issuance queues email through a database outbox.
- Brevo transactional email integration sends the issued ticket information when configured.
- Delivery states are `PENDING`, `SENDING`, `SENT`, and `FAILED`.
- Retries use bounded exponential backoff; SuperAdmin can requeue a failed delivery.
- Tickets remain available through the private order API when email is unavailable.
- Delivery is at least once if provider response is ambiguous, so rare duplicate email is possible.
- QR ticket values are bearer credentials; email and links containing them must be handled as sensitive. The customer frontend renders QR values from the private order response and avoids persisting them in session recovery.
- `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` are required for delivery. Sender/domain verification and an end-to-end sandbox walkthrough are pending.

Reference: [backend operations guide](../../backend/readMe.md).

## 3. Requested organizer capabilities

### Checkout opt-in

- Display an optional, unchecked-by-default checkbox at checkout.
- Explain that the customer is opting in to news and promotional messages from the named event organizer.
- Keep the control separate from terms acceptance and transactional ticket/order delivery.
- A missing/false choice must not block order creation.
- Capture enough evidence to demonstrate the choice and the text/version presented.

### Organizer news and promotional email

- Organizers can select only customers with a recorded opt-in to that organizer.
- A customer may have different preferences for different organizers.
- Every promotional email must include a working unsubscribe mechanism; unsubscribe state must suppress subsequent campaign sends.
- Do not expose recipient lists across organizers. Avoid unrestricted export of customer email addresses unless separately approved.
- Campaigns need sender identity, template/content preview, event/partner authorization, audit history, deduplication, rate limits, and delivery outcome reporting.
- Define handling for bounces, spam complaints, resubscription, consent withdrawal, and account/data deletion.

### Periodic event reminders

- Audience is restricted to purchasers for the specific event/performance/order concerned.
- Reminder timing and frequency are configurable and messages must be deduplicated so retries do not result in repeated sends.
- Suppress reminders for cancelled/refunded/void tickets and handle changed/cancelled events with a clearly defined transactional notice path.
- Decide whether reminders are sent to all purchasers by default, whether they have a separate preference/opt-out, and which messages are strictly necessary versus optional.
- Keep reminder schedules cancelable when event times change or the event is archived/cancelled.

## 4. Suggested data concepts (not yet schema)

These are design concepts, not a finalized Prisma model:

- **CommunicationConsent:** partner/organizer, normalized contact identity, purpose/category, affirmative state, timestamp, source/order context, consent-copy version, and withdrawal timestamp/source.
- **EmailSuppression:** normalized address, scope (global or organizer), reason (unsubscribe, hard bounce, complaint, administrative), created/cleared timestamps, and source.
- **Campaign:** organizer, audience rule, sender, subject/template/content version, status, creator/approver, scheduled/sent timestamps, and audit reference.
- **CampaignRecipient/Delivery:** campaign ID, recipient reference or privacy-preserving address reference, deduplication key, delivery state, provider message ID, attempts, and outcome timestamps.
- **ReminderSchedule:** event/performance, trigger timing, template, state/version, and schedule generation so updates cancel/rebuild pending jobs safely.
- **MessageCategory:** transactional, reminder, or promotional classification used for template policy, audience selection, and reporting.

Model decisions must preserve organizer scoping and avoid keeping unnecessary customer data. Retention and deletion behavior need to be defined before choosing whether recipient emails are copied into campaign records or resolved at send time.

## 5. Operational and abuse controls to define

- Who may create campaigns and whether approval is required for large sends.
- Maximum campaign size and send rate per organizer; provider quotas and bounce/complaint thresholds.
- Sender/domain setup and verification per platform or partner; prevent sender spoofing.
- Template sanitization, link validation, tracking/privacy choices, and unsubscribe-token security.
- Retry policy, dead-letter handling, idempotent campaign scheduling, and delivery audit access.
- Customer support process for consent, unsubscribe, and missed/duplicate reminders.
- Data retention period for consent proof, delivery records, and suppression entries.
- Customer privacy notice and applicable jurisdictional rules. Have the product owner obtain appropriate legal review rather than treating this technical spec as legal advice.

## 6. Current status

| Capability | Status |
|---|---|
| Ticket email outbox and retry | `[DONE]` Code implemented. |
| Brevo sender/domain and delivery validation | `[NOT DONE]` |
| Checkout promotional opt-in | `[NOT DONE]` |
| Consent evidence/history | `[NOT DONE]` |
| Organizer campaign UI/API/audience targeting | `[NOT DONE]` |
| Unsubscribe and suppression | `[NOT DONE]` |
| Periodic event reminder scheduling | `[NOT DONE]` |
| Message category separation/reporting | `[NOT DONE]` |
| Email policy, retention, deliverability and abuse procedures | `[NOT DONE]` |

## 7. Related documents

- [Platform PRD](PRD/fluxora-platform.md)
- [Ticketing domain](ticketing-domain.md)
- [API and access model](api-and-access.md)
- [Operations and release](operations.md)

