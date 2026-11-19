# Architecture

## What exists now (static demo)

```
Browser
 ├─ Interface      src/pages/*, src/ui/*         React components; no business rules
 ├─ Business logic src/services/actions.ts       operations: apply, approve, draft, submit, authorize, cancel, ticket, ...
 │                 src/domain/rules.ts           status machine, permissions, pricing, validation, financials
 ├─ Integrations   src/integrations/adapters.ts  MOCK adapters behind interfaces
 └─ Data access    src/data/store.ts             one JSON document in localStorage (key medically-grounded-demo-v1)
```

- Every mutation goes through a function in `actions.ts` that receives the acting `User`. It checks role and clinic scope (`requireClinicAccess`, `requireAdmin`, `canAuthorize`) and writes audit records.
- Clinic views read data only through `scopeToClinic(user, rows)`.
- **Limitation:** all of this runs in the browser, so any user can edit localStorage and become anyone. It demonstrates the rules but enforces nothing. Role switching is a labeled demo control, not sign-in.

## Production design (not deployed)

```
Browser SPA ──HTTPS──> API server (Node/TypeScript) ──> PostgreSQL (row-level security)
                         │  auth middleware (OIDC)        audit_log (append-only)
                         │  actions.ts + rules.ts reused  
                         ├─> job queue (outbox: pharmacy submit, email, retries)
                         └─> adapters (server-side only, secrets from a secret manager)
Pharmacy webhooks ──HTTPS + signature──> /webhooks/pharmacy/:pharmacyId
```

1. **Authentication.** Use a managed OIDC provider (for example Auth0, Cognito, Entra ID or Okta) with MFA required for platform administrators and clinicians. Use httpOnly secure session cookies. Replace the demo role switcher with real sign-in.
2. **Tenant isolation.** Every clinic-owned table has `clinic_id`. The API derives `clinic_id` from the session, never from the request body. PostgreSQL row-level security policies (`server/schema.sql`) enforce `clinic_id = current_setting('app.clinic_id')` for clinic roles as a second line of defense. Integration tests must prove cross-tenant reads and writes fail.
3. **Role permissions.** Check server-side with the same rules as `src/domain/rules.ts` (`DEFAULT_PERMISSIONS`, `canAuthorize`, `ADMIN_TRANSITIONS`). Authorization must remain a clinician-only act tied to a clinician record.
4. **Persistent database.** PostgreSQL with the schema in `server/schema.sql`, migrations, point-in-time recovery, and encryption at rest.
5. **Audit logs.** Append-only `audit_log` (no UPDATE or DELETE grants), written in the same transaction as each mutation, plus `order_events` for order history.
6. **Secrets.** Pharmacy API keys, payment keys and email keys live in a secret manager and are read only by the API and worker. Nothing secret is ever placed in `VITE_*` variables, the frontend bundle or the repository.
7. **Outbox and retries.** The submit endpoint writes the order plus an outbox row in one transaction, and a worker calls the pharmacy adapter. Use an `Idempotency-Key` header (the order's `idempotency_key`), exponential backoff, a dead-letter state surfaced as an admin exception, and a unique constraint on `(order_id, idempotency_key)`.
8. **Compliance.** Do not claim HIPAA compliance. Before handling PHI you need a BAA with every vendor in the data path, a risk assessment, access reviews, logging and monitoring, and an independent security and compliance review. The demo forbids PHI (`DEMO-` patient references).

## Still undeployed

The API server, database, authentication provider, worker and queue, webhook endpoint, live adapters and email sending. The static export in `dist/` is the only deployable artifact in this repository.
