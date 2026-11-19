# Validation record

This file holds the actual output of every check run on this revision. All runs were on 2026-11-19 against the source in this commit and the committed `dist/`.

## Environment

- OS: Ubuntu 24.04.5 LTS (Linux 6.8, x86_64), no root access
- Node.js v24.21.0, npm (bundled), dependencies installed with `npm ci` from `package-lock.json`
- TypeScript 5.9.3, Vite 5.4.21, Vitest 2.1.9
- Revision 2 (this run): Playwright 1.64.0 with the machine's Chromium headless shell (build 1248) and system fonts; no `LD_LIBRARY_PATH` workaround was needed.
- Previous revision: Playwright 1.65.1 with Chromium headless shell (build 1255). Playwright was installed outside the project's dependencies, in a scratch directory that is not committed. The machine had no Chromium system libraries or fonts, so they were extracted from Ubuntu packages into the scratch directory and loaded with `LD_LIBRARY_PATH` and a local `FONTCONFIG_FILE` (DejaVu and Liberation fonts).

## 1. Typecheck: `npm run typecheck`

```
> medically-grounded-portal@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json

exit 0
```

## 2. Production build: `npm run build` (runs `tsc --noEmit`, then `vite build`)

```
> medically-grounded-portal@0.1.0 build
> tsc --noEmit -p tsconfig.json && vite build

vite v5.4.21 building for production...
transforming...
✓ 41 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   1.22 kB │ gzip:  0.56 kB
dist/assets/index-CxqWAiQG.css   17.87 kB │ gzip:  4.17 kB
dist/assets/index-BJzvypQz.js   296.24 kB │ gzip: 85.63 kB
✓ built in 1.01s
exit 0
```

## 3. Unit tests: `npm test`

```
> medically-grounded-portal@0.1.0 test
> vitest run


 RUN  v2.1.9 <repo>

 ✓ src/services/actions.test.ts (15 tests) 36ms

 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at  23:40:53
   Duration  448ms (transform 120ms, setup 0ms, collect 141ms, tests 36ms, environment 0ms, prepare 73ms)

exit 0
```

## 4. End-to-end acceptance: `node tests/e2e/acceptance.mjs`

Run with `PLAYWRIGHT_MODULE=<path to playwright/index.mjs>`. The script serves `dist/` under a `/preview/` subpath, so relative asset URLs are exercised. It exits 1 if any check fails.

```
PASS 1. invalid application shows field errors
PASS 1. create fictional clinic application
PASS 2. approve it in demo administration
PASS 3. open its clinic workspace
PASS 4. search products, empty state, save a favorite
PASS 5. create and submit an order request (staff-side prep, duplicate click)
PASS 5b. clinician authorizes; mock hand-off to pharmacy review
PASS 6. find the same order in administration
PASS 7. update simulated status (accepted, processing, shipped)
PASS 8. clinic-side history matches
PASS onboarding checklist marks the first order request done
PASS 9. create, reply to and resolve a support ticket
PASS 10. reload and verify persistence
PASS role restrictions and tenant scoping (client-side demo)
PASS reorder creates a fresh draft
PASS mock failure handling and retry in admin
PASS reload during authorization leaves an order administration can send
PASS supporting documents open and download
PASS mobile: first screen shows headline and main action at 390
PASS mobile: public menu navigation
PASS mobile: portal sidebar opens, navigates and closes
PASS no horizontal overflow at 320px on key routes
PASS no horizontal overflow at 390px on key routes
PASS no console errors, page errors or failed requests
{
  "passed": 24,
  "failed": 0,
  "failures": []
}
exit 0
```

Check 8 compares the clinic-side status history of the acceptance order with this exact list (newest first): `shipped, processing, accepted, pharmacy_review, awaiting_clinician, submitted, draft`. Clinician authorization appears as a note event, not as a second Submitted status. Check 5 confirms that the order has exactly one `submitted` event after a double-clicked submit.

### Revision 2: reviewer findings reproduced and checked

- **Reload during authorization** (new e2e check). As Sam Patel, a Harbor Lane order for one package of prd-016, Office-use stock, PO DEMO-PO17 is submitted. As Jordan Wells, NP, a `MutationObserver` reloads the page as soon as "Waiting for the simulated hand-off" appears after **Authorize request**. After 2.3 s the stored history is `draft, submitted, awaiting_clinician` with `authorizedBy` set and no `externalRef`, so the interruption is real. The clinic shows "Clinician authorized. Waiting for simulated pharmacy hand-off.", no Authorize button and no stale "must authorize" text, and the dashboard's Items needing attention leaves the order out. Administration's overview lists it as "Hand-off not sent". The order page offers **Send to mock pharmacy** and no manual Pharmacy Review status. Clicking it records exactly one `pharmacy_review` event with an external reference, and the button disappears afterwards.
- **Supporting documents** (new e2e check). `#/app/catalog/prd-001` links both fictional documents. The product sheet opens at `#/app/catalog/prd-001/doc/0`, and **Download text file** produces `prd-001-product-sheet-demo.txt`. The intake requirements open at `/doc/1`.
- **320px overflow**. The overflow check now compares `scrollWidth` with `documentElement.clientWidth`, because in mobile emulation `window.innerWidth` grows to match `scrollWidth`, which hid the overflow in the previous revision. `/app/orders/MG-1038`, `/app/account` and `/app/catalog/prd-001/doc/1` were added to the routes. A scratch script measured the previous committed export against this one at 320 × 844: `/app/orders/MG-1038` went from 320/327 to 320/320, and `/app/account` from 320/324 to 320/320.
- **Onboarding checklist** (new e2e check). After acceptance steps 1–8, the new clinic's Clinic account shows First order request as Done.
- Unit tests added: an authorization with no send is `handoffPending`, is not a clinic attention item, has the authorization-aware help text, and completes through `sendToPharmacy`. A manual `adminSetStatus` to Pharmacy Review on such an order is refused, and a second send is refused once the reference exists.

## 5. Design probe: `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste`

Run with `IMD_PLAYWRIGHT=<path to playwright/index.mjs>`. It measured the export at 320, 390 and 1440 wide. Its screenshots went to `test/scratch/taste/shots/`, which is not committed. On the 390 screenshot, the first screen shows the header, the headline "Source. Request. Track.", the one-line lead, **Request clinic access**, **Explore demo** and the demo order preview card.

```json
{
 "checks": [
  {
   "name": "render",
   "passed": true,
   "exitCode": 0,
   "durationMs": 8905,
   "output": "renders, no script errors or missing local files"
  },
  {
   "name": "layout",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "no horizontal scroll at 320, 390 or 1440\nno text box overlaps another\nno floating control covers text\nno text cut off by overflow: hidden"
  },
  {
   "name": "targets",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "all 9 controls at least 24px or spaced at 390\n9 under the 44px comfortable size"
  },
  {
   "name": "contrast",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "all measured text meets 4.5:1 (3:1 large)"
  },
  {
   "name": "casing",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "no all-caps text in content"
  },
  {
   "name": "tracking",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "letter-spacing natural in content (display type may run tight)"
  },
  {
   "name": "eyebrows",
   "passed": true,
   "exitCode": 0,
   "durationMs": 1,
   "output": "no kicker labels above headings"
  },
  {
   "name": "type-sizes",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "390: 4 sizes in use, 5 with one-offs (13px×16, 15px×9, 17px×6, 22px×2, 34px×1)\n1440: 4 sizes in use, 5 with one-offs (13px×16, 15px×14, 17px×6, 22px×2, 52px×1)\nbar: 6 sizes used more than once, 8 counting one-offs, per width"
  },
  {
   "name": "type-faces",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "families (2): ui-sans-serif, ui-monospace\nweights (3): 400, 600, 700"
  },
  {
   "name": "glyphs",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "no em dashes or emoji in text"
  },
  {
   "name": "slogans",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "1 two-beat lines; a stack is four or more, so keep the best and cut the rest:\n\"Source. Request. Track.\" (section.hero:nth-of-type(1) > div.inner > div:nth-of-type(1) > h1)"
  },
  {
   "name": "repetition",
   "passed": true,
   "exitCode": 0,
   "durationMs": 1,
   "output": "no repeated lines"
  },
  {
   "name": "copy-budget",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "prose on the first screen: 29 words at 390 (bar 60), 29 at 1440 (bar 90)\nall words on the first screen: 66 at 390, 138 at 1440\nwhole page: 197 words, 71 of them prose"
  },
  {
   "name": "chrome",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "border and shadow together: 0\ncards inside cards: 0\ngradient text: 0"
  },
  {
   "name": "motion",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "transition: all on 0 elements\nendless animations: 0; still running with reduced motion: 0"
  },
  {
   "name": "share",
   "passed": true,
   "exitCode": 0,
   "durationMs": 0,
   "output": "title \"Medically Grounded · Clinic pharmacy sourcing portal (demo)\", favicon, og:title, og:image, description"
  }
 ]
}
```
```
exit 0
```

## 6. Better Interface review (six domains)

Coverage: the without-a-browser checks for all six domains were done against the source. The rendered checks were limited to what the Playwright runs above measured: layout and overflow at 320/390/1440, target sizes, contrast of rendered text (taste `contrast`), the type-size count, the share metadata, console errors and failed requests. There was no manual visual pass beyond the 390 and 1440 screenshots.

| Domain | What was checked | Finding / state |
| --- | --- | --- |
| Accessibility | Skip link (`src/ui/shell.tsx:32`), visible focus ring (`src/styles.css:80`), polite live region for toasts (`src/ui/kit.tsx:40`), labelled form fields with per-field errors (e2e check "invalid application shows field errors"), keyboard-reachable menus | No open findings. A screen reader was not tested. |
| Layout | No horizontal overflow at 320 and 390 on key routes (e2e), mobile sidebar and public menu (e2e), taste `layout` | Passed |
| Writing | Hero headline was a generic category phrase. It is now "Source. Request. Track." (`src/pages/public.tsx:68`) and the plain lead stays under it. Every action, status and notice states that it is simulated or fictional. | Fixed in this revision |
| Typography | One scale of six sizes (`src/styles.css:52-57`), taste `type-sizes`, `tracking`, `eyebrows`, `casing` | Passed |
| Colors | Navy, white and teal tokens, status tones for badges, taste `contrast` | Passed |
| UI | Loading (skeleton during hand-off), empty, error and success states, plus duplicate-submit protection (e2e). Order history showed Submitted twice after clinician authorization (previously `src/services/actions.ts:167`, now line 168). Authorization is now a note event and the status stays Awaiting Clinician until the hand-off. | Fixed in this revision |

Revision 2 rerun: the probe was run again on the rebuilt export and passed 16 of 16 checks (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget, chrome, motion, share). The 390 screenshot again shows the header, headline, lead, **Request clinic access** and **Explore demo** on the first screen. The share image (`public/og-image.png`, 1200 × 630) was regenerated: the mark now sits beside "Medically Grounded" with a second line, "Clinic pharmacy sourcing demo". The image was inspected visually after rendering.

Revision 2 review findings and fixes:

| Domain | Finding | Fix |
| --- | --- | --- |
| Layout | `.btn` is `white-space: nowrap` (`src/styles.css:93`), so the order-detail **Create new draft from this order** button and the Clinic account `dl.kv` badge pushed the root to 327 and 324px at 320 | `@media (max-width: 360px)` block in `src/styles.css` lets header buttons wrap and stacks `dl.kv` into one column |
| UI | An authorized order that was interrupted mid-send had no recovery action (`src/pages/admin.tsx`, the retry was gated on `integrationError`) | `handoffPending()` in `src/domain/rules.ts`. The admin order page shows **Send to mock pharmacy** or **Retry hand-off**, and Overview and the exceptions filter list the order |
| Writing | The order header and dashboard said "A clinician must review and authorize it" after authorization | `orderHelp()` and `needsClinicAttention()` in `src/domain/rules.ts`, used in `src/pages/clinic.tsx` |
| UI | Supporting documents were plain text | Linked document route `SupportingDocument` in `src/pages/clinic.tsx` with a plain-text download |

## Limitations

- Only headless Chromium on Linux was used. No Safari, Firefox, physical phone or screen reader was tested.
- Tenant isolation and role restrictions are enforced client-side only, because the static demo has no real authentication. They were tested as such (e2e "role restrictions and tenant scoping").
- All pharmacy, payment, carrier, credential and email calls are mock adapters, and no live integration was exercised.
