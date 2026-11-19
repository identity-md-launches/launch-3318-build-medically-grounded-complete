# Integrations

All adapters in `src/integrations/adapters.ts` are **mocks** (`mode: 'mock'`). They never contact a pharmacy, payment processor, carrier, credential registry or email provider. The UI labels every result as simulated. No live integration exists, and none should be described as working.

Each capability is an interface. To go live, implement the same interface **server-side** and register it in place of the mock. Live adapters must never run in the browser.

| Capability | Interface | Mock | Real connection point | Credentials (server-side secret manager) |
| --- | --- | --- | --- | --- |
| Catalog and pricing | `PharmacyCatalogAdapter.fetchCatalog(pharmacyId)` | `MockCatalogAdapter` (returns nothing) | Pharmacy catalog REST API or scheduled SFTP price file | Pharmacy API key or SFTP key per pharmacy |
| Order submission | `OrderSubmissionAdapter.submit(order, idempotencyKey)` | `MockOrderSubmissionAdapter` (idempotent by key; can simulate timeouts) | Pharmacy order API. Send `Idempotency-Key`, map items by `pharmacyProductId` | Pharmacy API key / OAuth client credentials |
| Status webhooks | `StatusWebhookAdapter.parse(payload)` | `MockStatusWebhookAdapter` | `POST /webhooks/pharmacy/:pharmacyId`. Verify the HMAC signature and timestamp before parsing | Webhook signing secret per pharmacy |
| Shipment tracking | `ShipmentTrackingAdapter.track(trackingNumber)` | `MockShipmentTrackingAdapter` | Carrier tracking API or pharmacy tracking events | Carrier API key |
| Payments | `PaymentsAdapter.quote(amount)` | `MockPaymentsAdapter` (never charges) | Payment processor (invoices or payment intents) created server-side | Processor secret key; publishable key only in the browser |
| Credential verification | `CredentialVerificationAdapter.check(npi, state)` | `MockCredentialVerificationAdapter` (always `verified: false`) | NPI registry lookup plus a state license verification service, with human review | Verification vendor API key |
| Email | `EmailAdapter.send(to, subject)` | `MockEmailAdapter` (records to the outbox only) | Transactional email provider | Email provider API key |

## Product mapping

- `products.pharmacy_id` plus `products.pharmacy_product_id` identify the pharmacy's SKU. The order submission adapter sends those IDs, never platform IDs.
- Catalog sync updates `unit_price`, `dispensing_fee` and `availability`, keyed by `(pharmacy_id, pharmacy_product_id)`. Submitted orders keep the prices captured at submission (`order_items.unit_price`).
- State eligibility (`products.states`) comes from the pharmacy's licensure data and must be refreshed with the catalog.

## Status mapping

`PHARMACY_STATUS_MAP` is the single table that converts pharmacy vocabulary into platform statuses:

| Pharmacy status | Platform status |
| --- | --- |
| RECEIVED, IN_REVIEW | Pharmacy Review |
| NEEDS_INFO | Clarification Required |
| APPROVED | Accepted |
| COMPOUNDING, PACKED | Processing |
| SHIPPED | Shipped |
| DELIVERED | Delivered |
| VOID | Cancelled |

`applyWebhook` (in `src/services/actions.ts`) rejects unknown statuses, unknown orders and out-of-order transitions (anything not in `ADMIN_TRANSITIONS`), and ignores duplicates. Each outcome is written to the integration log.

## Reliability

- **Validation:** `validateOrderForSubmit` runs before any hand-off (eligibility, availability, quantities, pathway compatibility, the `DEMO-` reference rule).
- **Duplicate protection:** a draft-only submit guard, a disabled submit button, an in-flight set in `sendToPharmacy`, and an idempotency key per order.
- **Retries:** `withRetry` uses exponential backoff, 2 retries by default, and retries only errors marked retryable.
- **Failed requests:** the order stays **Submitted** with `integrationError`, the clinic sees a notice, and it appears under administration exceptions with **Retry hand-off**. Admins can turn on "Simulate pharmacy endpoint failures" to exercise this path.
