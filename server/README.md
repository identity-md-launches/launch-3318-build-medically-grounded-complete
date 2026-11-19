# Backend scaffold (not deployed)

This folder describes the production backend. **Nothing here is running.** The demo in `dist/` uses browser storage instead.

- `schema.sql`: PostgreSQL schema with tenant row-level security, an append-only audit log, integration and notification outboxes, and a supplier-notes-free product view for clinic roles.

## Planned API (reuse `src/domain/rules.ts` and `src/services/actions.ts` server-side)

| Method and path | Who | Action function |
| --- | --- | --- |
| `POST /applications` | public (rate-limited, CAPTCHA) | `submitApplication` |
| `POST /leads` | public | `submitLead` |
| `PATCH /admin/clinics/:id/verification` | platform_admin | `setVerification` |
| `GET /catalog` | clinic roles | `clinic_products` view filtered by eligible states |
| `POST /orders` / `PATCH /orders/:id` | clinic roles with createDrafts | `createDraft`, `updateDraft` |
| `POST /orders/:id/submit` (Idempotency-Key header) | submitRequests | `submitOrder` → outbox |
| `POST /orders/:id/authorize` | clinician | `authorizeOrder` → outbox |
| `POST /orders/:id/cancellation` | clinic roles | `requestCancellation` |
| `PATCH /admin/orders/:id/status` | platform_admin | `adminSetStatus` |
| `POST /webhooks/pharmacy/:pharmacyId` | pharmacy (HMAC signed) | `applyWebhook` |
| `POST /tickets`, `POST /tickets/:id/messages`, `POST /tickets/:id/resolve` | scoped | ticket actions |
| `GET /admin/financials` | platform_admin | `financials` |

## Deployment steps (when built)

1. Provision PostgreSQL and apply `schema.sql` through a migration tool.
2. Configure the OIDC provider and map IdP subjects to `users.idp_subject`.
3. Store pharmacy, payment, email and webhook secrets in a secret manager. Never use `VITE_*` variables for secrets.
4. Deploy the API and outbox worker. Point the SPA at the API origin through runtime config.
5. Replace each mock adapter with a live one only after a signed agreement and a sandbox test with that partner.
6. Get an independent security, privacy and compliance review before any real clinic or patient data is processed.
