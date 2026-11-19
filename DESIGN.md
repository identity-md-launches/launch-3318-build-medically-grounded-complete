# DESIGN.md: Medically Grounded

## Overview

Medically Grounded is a premium healthcare SaaS portal for clinic operators: administrators, clinicians and staff who check order status and catalog details many times a day. The visual character is calm and dense: deep navy chrome (header, hero, sidebar), white content surfaces on a near-white page, and one restrained teal used only for primary actions, links and focus. Readability of tables and status comes before decoration. There are no gradients, illustrations or animation beyond short state transitions.

Rules that apply across the system:
- The navy chrome frames the page and white cards carry the content. The public site uses a navy hero and page header over white sections. The portal uses a navy sidebar with white cards on `--color-bg`.
- Each view has one filled teal action (`.btn-primary`). Peer actions use the neutral `.btn`.
- Status is always shown as a text badge (label plus dot), never by color alone.

All values live in `src/styles.css`. There is no CSS framework.

## Colors

Primitives are named by hue (`--navy-900`, `--teal-600`, `--slate-200`, ...). Components use only the semantic tokens below. Defined in `src/styles.css` `:root`.

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `--slate-25` `#f8fafc` | Page background in portal and public sections |
| `--color-surface` | `#ffffff` | Cards, inputs, topbar, footer |
| `--color-surface-muted` | `--slate-50` `#f2f5f9` | Neutral badge, button hover, customer messages |
| `--color-surface-inverse` | `--navy-900` `#0b1f3a` | Site header, hero, page heads, sidebar |
| `--navy-800` / `--navy-700` | `#14305a` / `#1f4174` | CTA band background / active sidebar item |
| `--color-text` | `--slate-900` `#0f1b2d` | Body text |
| `--color-text-secondary` | `--slate-500` `#56657a` | Meta text, labels in stats, table headers |
| `--color-text-inverse` / `-secondary` | `#ffffff` / `#c3cfe0` | Text on navy |
| `--color-border` / `-subtle` | `#d5dde8` / `#e6ebf2` | Table header rule, outlines / row dividers |
| `--color-accent` / `-hover` | `--teal-600` `#0f7c72` / `--teal-700` `#0b665e` | Primary buttons, links, radio/checkbox accent |
| `--color-accent-soft` | `--teal-50` `#ecf8f6` | Support replies, completed stepper steps |
| `--color-accent-on-dark` / `--teal-300` | `#5fd0c4` | Logo mark, sidebar count pill |
| `--color-focus` | `--teal-600` | 2px focus outline |
| Status pairs `--color-{info,warn,good,bad}-{bg,text}` | blue, amber, green, red | Status badges and notices only |

Contrast: the design probe (`taste.mjs`) measured every text pair rendered on the home page at 320, 390 and 1440 wide and found all at or above 4.5:1 (3:1 for large text). Pairs on other routes were not measured individually. See the [validation record](docs/VALIDATION.md).

## Typography

- Family: `--font-sans` system UI stack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, ...`). No web fonts are bundled. `--font-mono` (`ui-monospace, ...`) is used only for IDs (`.mono`: order, product and tracking IDs).
- Weights: 400 (body), 600 (labels, buttons, h2/h3), 700 (h1, hero, stat values). Only these three.
- Scale, six sizes:

| Token | Size | Role |
| --- | --- | --- |
| `--text-sm` | 13px | Meta, field labels, badges, table headers |
| `--text-base` | 15px | Body, tables, buttons |
| `--text-md` | 17px | Lead paragraphs, h3, legends |
| `--text-lg` | 22px | h2 section headings |
| `--text-xl` | 30px | h1 page headings, stat values |
| `--text-2xl` | `clamp(34px, 5vw, 52px)` | Hero headline only |

- Inputs are always 16px, so iOS does not zoom on focus.
- Headings: line-height 1.2, `letter-spacing: -0.01em` (hero -0.02em), `text-wrap: balance`. Paragraphs: `text-wrap: pretty`. Lead text max 48–62ch.
- Numbers in stats, tables and totals use `font-variant-numeric: tabular-nums` (`.num`, `.tabular`, `.stat .value`).
- No all-caps text, no tracked labels above headings.

## Layout

- Spacing scale `--space-1` to `--space-8`: 4, 8, 12, 16, 24, 32, 48, 72px. Cards pad 24px (16px at 560px and below). Grids use a 16px gap.
- Public pages: `.section` and `.page-head .inner` max 1180px, centered, with 48px block padding (32px on mobile). The hero is a two-column grid (`1.05fr 1fr`) above 900px and stacks below it.
- Portal: `.shell` is a grid with a 248px sidebar (`--sidebar-w`) and fluid main. `.content` is max 1280px and holds a vertical stack with 24px gaps. Header actions sit right-aligned in `PageHeader` (`.spread`).
- Responsive grids: `.grid-2/3/4` use `repeat(auto-fit, minmax(min(100%, 340/250/180px), 1fr))`, so they collapse without breakpoints. `.form-grid` uses a 220px minimum.
- Breakpoints:
  - **≤900px:** the public nav collapses behind a **Menu** button and drops down below the header. The portal sidebar becomes an off-canvas drawer (`transform`, 200ms) with a scrim, closes on Escape, on scrim click and on navigation, and the topbar shows a **Menu** button. The role switcher takes its own full-width row.
  - **≤560px:** tables marked `.table-stack` become label/value rows using each cell's `data-label`. Padding shrinks.
  - **≤360px:** page-header buttons (`.content > header .btn`) may wrap their label (`white-space: normal`, `max-width: 100%`), and `dl.kv` definition lists stack into one `minmax(0, 1fr)` column with a 4px gap and 8px below each value, so long actions and status badges stay inside 320px.
- Wide tables that do not stack sit in `.table-wrap` (`overflow-x: auto`).
- Checked in Chromium: no horizontal overflow at 320, 390 and 1440px on the home page (probe), and at 320/390 on eight key routes (E2E).

## Elevation & depth

- `--shadow-card`: 1px ring plus a soft 1–2px shadow, used for cards, steps, FAQ items and stats. Cards have no border; the shadow ring stands in for one.
- `--shadow-pop`: a deeper shadow for the hero preview and the toast.
- Borders mark structure only: table rules, input outlines, the topbar's bottom rule and the footer's top rule.
- Stacking: sticky site header z 20, portal scrim 30, drawer 40, toast 50, skip link 100.

## Shapes

`--radius-sm` 6px (buttons, inputs), `--radius-md` 10px (notices, messages, table wrap), `--radius-lg` 14px (cards, hero preview, CTA band). Badges, chips and count pills are fully rounded (999px). Timeline dots are circles.

## Components

All in `src/ui/kit.tsx` and `src/ui/shell.tsx`, styled in `src/styles.css`.

- **Buttons** (`.btn`, `.btn-primary`, `.btn-danger`, `.btn-ghost`, `.btn-on-dark`, `.btn-sm`): 40px minimum height (32px small), `scale(0.96)` on press, `:disabled` at 55% opacity. Loading is shown with changed text ("Submitting…") plus `aria-busy`.
- **StatusBadge / Badge** (`.badge-{info,warn,good,bad}`): a pill with a dot. Order status tones come from `STATUS_TONE` in `src/domain/rules.ts`.
- **Fields**: `TextField`, `TextArea`, `SelectField`. Each has a visible label tied by `htmlFor`, optional hint and error linked via `aria-describedby`, and `aria-invalid` when in error. `focusFirstError` moves focus to the first invalid field after submit.
- **Notice** (`.notice`, `-warn`, `-bad`, `-good`): inline messages. `bad` has `role="alert"`.
- **Empty**: centered title, a forward-pointing sentence and an optional action. Used for every list.
- **Skeleton**: loading placeholder while a mock hand-off runs.
- **Stat**: card with a label and a tabular value.
- **Tables**: `.table-wrap` around `table`. Add `.table-stack` plus `data-label` on cells for mobile stacking.
- **Timeline** (`.timeline`): order and ticket histories, with timestamp and actor above the note.
- **Stepper** (`.stepper`): order builder steps, with `aria-current="step"` on the active one.
- **Chips** (`.chip` with `aria-pressed`): category filter toggles.
- **PortalShell** (`shell.tsx`): skip link, sidebar nav with `aria-current="page"` and count pills, demo banner with reset, topbar role switcher, `<main id="main">`.
- **PublicLayout** (`public.tsx`): sticky navy header, collapsible nav, footer with demo disclaimer.
- **Toaster**: a polite live region that shows a navy toast for 4 seconds.

Focus: global `:focus-visible` gives a 2px teal outline with 2px offset. Reduced motion: every transition and animation drops to 0.01ms.

## Do's and Don'ts

- Do start a new portal page with `<PageHeader title=… actions=…>` followed by `.card` sections in a `.grid-2` or `.stack`. Start a public page with `PageHead`, then `.section` blocks.
- Do give each view at most one `.btn-primary`. Use `.btn` for alternatives and `.btn-danger` for destructive ones, behind a confirm or an admin approval.
- Do show status with `StatusBadge` and the wording from `ORDER_STATUS_LABEL`. Never invent new status words or show status by color alone.
- Do add an `Empty` state, with a next step, to any new list.
- Do use semantic tokens. Don't apply primitive tokens (`--teal-600`) inside new component rules, except the existing chrome-level uses listed above.
- Don't add type sizes, weights or fonts beyond the scale above. Don't use all caps or tracked labels above headings.
- Don't add borders and shadows to the same surface, and don't nest cards inside cards.
- Recipe for a new admin page: add a route in `AdminApp` (`src/pages/admin.tsx`) and a `NavItem` with a `group`, render `PageHeader`, put data in a `.card .table-wrap table.table-stack` with `data-label`s, and route all mutations through a function in `src/services/actions.ts` called via `act()`.
