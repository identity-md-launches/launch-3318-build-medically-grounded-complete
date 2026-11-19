# Medically Grounded (demo)

A B2B pharmacy sourcing and order-management portal for med spas, weight-management clinics, hormone and wellness practices, dermatology offices and telehealth companies. This repository is a **working browser demonstration with fictional data**. It is not a pharmacy service, it does not process prescriptions, payments or shipments, and it makes no compliance claim.

The site is a static single-page app (Vite + React + TypeScript, hash routing). It keeps data in the browser's `localStorage` and has clearly labeled demo role switching. That is **not** authentication and **not** a database. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the production design.

## Install, preview, rebuild

Requires Node 18+ (built with Node 24.21 and npm 11.19).

```bash
npm ci               # install from package-lock.json
npm run dev          # local dev server with hot reload
npm run build        # typecheck (tsc --noEmit) and production export to dist/
npm run preview      # serve the built dist/ locally
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript only
```

`vite.config.ts` sets `base: './'`, so every asset URL in `dist/` is relative. The export works from any static host or subpath, including an IPFS gateway path. Routes use the URL hash (`#/app/orders`), so the static host needs no rewrites. Commit `dist/` after every rebuild: the publisher serves the committed export and does not rebuild.

### End-to-end acceptance run

`tests/e2e/acceptance.mjs` serves `dist/` under `/preview/` inside its own process, drives Chromium through the full acceptance flow and exits non-zero on any failure. Playwright is not a project dependency. Install it anywhere and point the script at it:

```bash
npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/acceptance.mjs
```

## Using the demo

1. **Request clinic access** (`#/request-access`): submit a fictional application. Invalid input is flagged per field.
2. **Review in demo administration**: approve the clinic. Approval is labeled as a demo step that verifies nothing.
3. **Open clinic workspace**: search the catalog, save favorites, compare products and create an order request.
4. **Explore demo** (`#/demo`): switch between clinic administrator, clinician, staff and platform administrator. The "Viewing as" menu in the portal header does the same. **Reset demo data** restores the seed.

## Feature status

### Implemented (working in the browser demo)
- Public site: Home, How it works, Product categories, For clinics, Resources/FAQ, Contact (general and partnership), Request access, Demo chooser.
- Clinic application with validation, duplicate-name protection, and verification states: submitted, pending review, information requested, approved (demo), rejected.
- Roles: clinic administrator, clinician, staff, platform administrator. Permission toggles per user. Only clinicians can authorize. Only platform administrators can open administration.
- Clinic dashboard: counts, items needing attention, recent activity, favorites, support requests, quick actions.
- Catalog with 18 fictional products in six categories and three product types. Search, filters (type, category, eligible state, favorites), favorites, comparison of up to three products, product detail with every required field.
- Order workflow: location, products, pathway, fictional reference (`DEMO-` prefix enforced), itemized review, simulated submit, unique ID, history. Staff preparation is separate from clinician authorization. All ten statuses, timestamps, draft editing and discarding, cancellation requests that need admin approval, clarification round-trips, and new drafts from previous orders (repriced, ineligible items removed, fresh authorization required).
- Duplicate protection: a draft can only be submitted once, the submit button locks while sending, concurrent hand-offs are de-duplicated, and the mock adapter is idempotent by key.
- Support: ticket creation (optionally linked to an order), replies from both sides, resolution summary, reopen, status history.
- Simulated notifications outbox, labeled "Simulated, not sent".
- Administration: overview; orders with filters, exceptions, status updates, clarifications, cancellation decisions and hand-off retry; tickets; tasks with assignment and notes; leads with owner and status; clinics and applications with approval, mock credential check, user roles and activation; activity insights (product interest, clinic activity, repeat ordering); catalog editing (price, fee, availability, eligible states, active); pharmacy partner records and integration status; integrations page with failure simulation, mock webhooks and request log; financials with editable assumptions; audit log.
- Financials: total order value, pass-through (medication, pharmacy fees, shipping), retained platform revenue, variable costs and contribution margin are reported separately. Supplier notes and margins appear only in administration.

### Mocked (labeled as such in the UI)
- Every integration in `src/integrations/adapters.ts`: catalog/pricing, order submission, status webhooks, shipment tracking, payments, credential verification, email. None contacts a real system. See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).
- Pharmacy status updates (an administrator or a mock webhook stands in for the pharmacy).
- Credential checks (record "mock check only, not verified").
- Notifications (recorded, never sent).

### Not deployed / not implemented
- No backend, authentication, server-side tenant isolation, persistent database or server-side audit log is deployed. `server/` holds the schema and API scaffold only.
- No real pharmacy, payment, carrier, NPI/license or email integration.
- No hosted URL is produced by this repository. The committed `dist/` is the static deliverable; publishing happens outside this job.
- Supporting documents are fictional demo documents generated in the browser from the listing (route `#/app/catalog/<id>/doc/<n>`, with a plain-text download). They contain synthetic listing and logistics data only, no clinical or dosing guidance.

## Project layout

```
src/domain/       types.ts (data model), rules.ts (statuses, permissions, pricing, validation, financials)
src/data/         seed.ts (fictional seed data), store.ts (localStorage data access)
src/services/     actions.ts (business operations) and actions.test.ts
src/integrations/ adapters.ts (mock adapters, retry, idempotency, status map)
src/ui/           kit.tsx (components, router, fields), shell.tsx (portal layout)
src/pages/        public.tsx, clinic.tsx, admin.tsx
tests/e2e/        acceptance.mjs (Playwright acceptance run against dist/)
server/           schema.sql and README for the production backend (not deployed)
docs/             ARCHITECTURE.md, INTEGRATIONS.md, DATA_MODEL.md, VALIDATION.md
DESIGN.md         design system as implemented
```

## Validation results (summary)

Full record with the command output, dates and environment: [docs/VALIDATION.md](docs/VALIDATION.md). Last run 2026-11-19.

| Command | Result |
| --- | --- |
| `npm run build` (runs `tsc --noEmit`, then `vite build`) | Passed. JS 296.2 kB (85.6 kB gzip), CSS 17.9 kB |
| `npm run typecheck` | Passed, no errors |
| `npm test` | 15 of 15 unit tests passed |
| `node tests/e2e/acceptance.mjs` against `dist/` | 24 of 24 checks passed: acceptance steps 1–10, invalid inputs, empty states, duplicate submit, role restrictions, reorder, mock failure, recovery of a hand-off interrupted by a reload, supporting documents, onboarding checklist, mobile navigation, no overflow at 320 and 390 (measured against `clientWidth`), no console errors |
| `taste.mjs` design probe | 16 of 16 checks passed |

Limitations: browser checks ran in headless Chromium on Linux with fonts installed locally for the test only. No physical device, Safari, Firefox or screen reader was tested. Tenant isolation is only client-side because no real authentication exists.

## Agent coordination

The brief asked for separate agents for product/design, the clinic interface, the admin interface, data/integrations and independent testing, with one lead. **This build was done by a single agent working through those roles one after another.** The shared contracts that kept the work consistent were `src/domain/types.ts` and `rules.ts` for data, `src/styles.css` tokens for styling, and `src/services/actions.ts` for behavior. Testing was not independent of the builder. A future multi-agent team should keep that split, with the lead owning those three files.

## Dependencies and licenses

Runtime: `react` 18.3 and `react-dom` 18.3 (MIT).
Build and test: `vite` 5.4 (MIT), `@vitejs/plugin-react` 4.7 (MIT), `typescript` 5.9 (Apache-2.0), `@types/react` and `@types/react-dom` (MIT), `vitest` 2.1 (MIT).
Testing only, not installed in the project: Playwright 1.65.1 (Apache-2.0).
Fonts: none bundled. The site uses the system UI font stack.
Design guidance: Better Interface by Jakub Krehel (MIT). Documentation structure adapted from Impeccable by Paul Bakaus (Apache-2.0). Both were used as guidance; no code from them is included.
The project's own code is marked `UNLICENSED` in package.json until the owner chooses a license.

## Security notes

- No secrets, API keys or credentials are in this repository or in the frontend bundle. Production adapters must run server-side with secrets in a secret manager.
- Do not enter real patient, payment or credential data into the demo. Patient references must start with `DEMO-`.
- This demo is not HIPAA compliant and is not production ready. Production use would require the backend in `docs/ARCHITECTURE.md`, a BAA-capable hosting stack, and independent security and compliance review.
