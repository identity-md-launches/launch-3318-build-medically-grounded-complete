# Data model and seed data

TypeScript source of truth: `src/domain/types.ts`. SQL equivalent: `server/schema.sql`. Seed: `src/data/seed.ts` (`seedDb()`). Every record is fictional: names use `.example` and `.test` domains, NPIs start with `000000`, license numbers start with `DEMO-`, and product names end in "(demo)".

| Entity | Key fields | Notes |
| --- | --- | --- |
| Clinic | id, name, practiceType, verification, verificationNote, locations[], primaryContact, billingContact, shippingPreference, billingPreference, checklist | Verification: submitted, pending_review, information_requested, approved, rejected |
| Location | id, name, address, city, state, zip | State drives product eligibility |
| User | id, clinicId (null for platform), role, clinicianId?, permissions, active | Roles: clinic_admin, clinician, staff, platform_admin |
| Clinician | id, clinicId, name, credential, npi, licenseState, licenseNumber, credentialCheck | credentialCheck is never "verified" |
| Product | id, name, category, type, form, strength, packageSize, pharmacyId, pharmacyProductId, pathways[], states[], availability, shipping, unitPrice, dispensingFee, documents[], supplierNotes (admin only), active | Types: patient_specific, office_use, branded |
| Pharmacy | id, name, kind, integrationStatus, adapter, states, contactEmail, notes | All fictional, no agreements |
| Order | id (MG-####), clinicId, locationId, pathway, items[], patientRef, poNumber, pharmacyNotes, status, preparedBy, authorizedBy/At, idempotencyKey, sourceOrderId, cancellationRequested, integrationError, externalRef, trackingNumber, events[], timestamps | 10 statuses; see rules.ts |
| OrderItem | productId, quantity, unitPrice, dispensingFee | Prices captured at submission |
| StatusEvent | id, at, status?, actor, kind, note | kind: status, note, clarification, cancellation_request, integration, edit |
| Ticket | id (T-####), clinicId, orderId?, subject, category, status, messages[], history[], resolution | open, awaiting_clinic, awaiting_support, resolved |
| Lead | id, kind, name, organization, email, message, status, owner, clinicId? | From contact, partnership and access forms |
| Task | id, title, assignee, due, related, status, notes[] | Admin follow-ups |
| AuditRecord | id, at, actor, action, entity, entityId, detail | Append-only in production |
| Notification | id, at, to, subject, body, clinicId | Simulated only |
| IntegrationLog | id, at, adapter, operation, outcome, detail | mock_success, mock_failure, rejected_invalid, duplicate_ignored, retrying |
| FinancialAssumptions | platform fee per order and %, payment processing %, support and integration cost per order, shipping by requirement | Editable in admin |

## Seed contents

- 3 clinics: Harbor Lane Aesthetics (approved, 2 locations CA/AZ), Summit Vitality Telehealth (approved, GA), Cedar Row Dermatology (pending review, OR).
- 7 users: one platform admin; Harbor admin, clinician and staff; Summit admin and clinician; Cedar admin.
- 3 fictional pharmacies, 18 fictional products across 6 categories (including backorder, limited and discontinued items and region-limited states).
- 3 orders (Shipped, Clarification Required, Delivered), 1 ticket, 2 leads, 2 tasks, 1 audit record.

## Financial definitions (`financials()` in rules.ts)

- **Total order value**: medication + pharmacy fees + shipping + platform service fee, for non-draft, non-cancelled orders.
- **Pass-through**: medication + pharmacy fees + shipping (owed to pharmacies and carriers).
- **Retained platform revenue**: platform service fees only.
- **Variable costs**: payment processing % of total + support cost per order + integration cost per order.
- **Contribution margin**: retained revenue minus variable costs. Order value is never reported as revenue or profit.
