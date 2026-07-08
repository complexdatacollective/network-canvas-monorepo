# Architect shared-theme migration — design

**Date:** 2026-07-08
**Status:** Approved design (feasibility investigated and cross-verified the same day)
**Scope:** `apps/architect` main document only. No changes to `tooling/tailwind` or any library package.

## Context and goal

Architect's main document compiles its own Tailwind v4 theme (`apps/architect/src/styles/tailwind.css`, 749 lines) that hand-mirrors parts of the shared design system. fresco-ui components are compiled against this local token set, and any component using a token Architect never mirrored renders broken — currently AppUpdateIndicator's tooltip/dialog (transparent panels, unconstrained sizing, background-less primary button), the Dialog system, and the new form fields. This blocks Architect from consuming most of `@codaco/fresco-ui`.

**Goal:** replace Architect's local theme with the shared `@codaco/tailwind-config/fresco.css` foundation (as Interviewer uses), layered with a permanent Architect app theme, so every fresco-ui component renders correctly while Architect keeps its current visual identity.

Key feasibility facts (verified 2026-07-08):

- The shared theme already compiles in Architect's Vite project: the interview preview is a separate popup document whose only stylesheet (`src/styles/preview.css`) imports `fresco.css`. `@codaco/tailwind-config` is already a workspace dependency.
- The switch is **atomic per document**: `fresco.css` forbids a second `@import 'tailwindcss'`, and ~20 `:root` names collide between the two systems with incompatible formats (HSL triplets vs oklch triplets). No incremental coexistence in `index.html`.
- Scale: ~1,726 theme-dependent occurrences across 180 of 708 files under `apps/architect/src`.
- Identical on both sides already (no work, no drift): radius scale, shadow scale, the six shared keyframes, `tablet-landscape`/`desktop` breakpoints, and node/edge/ord sequence **order** 1–8 (order is protocol data; verified position-identical).

## Decisions

Resolved with the maintainer 2026-07-08:

1. **Brand look — keep Architect's current identity.** The app layer re-declares Architect's semantic color values over `fresco.css` (the extension mechanism `themes/default.css:5-10` sanctions). A restyle toward the fresco default look is possible later as its own design effort.
2. **legacy-ui — mechanical port.** `lib/legacy-ui` (21 files, 273 occurrences) gets the same codemods as everything else. Replacement by fresco-ui components is separate future work.
3. **Raw-variable families — rewrite to shared tokens.** No compatibility layer: `--space-*` (540 refs), `--animation-*` (74), `--z-*` (23), `--picker-*` (6) are rewritten to shared spacing multiples, standard duration/easing utilities, literal z values, and explicit sizes respectively.
4. **Sequence colors — app-local aliases.** `--node-color-seq-N`/`--edge-color-seq-N`/`--ord-color-seq-N` (+`-dark`) are defined in the app layer as aliases of the shared `--node-N`/`--edge-N`/`--ord-N`, with `-dark` variants derived via oklch relative-color syntax. No shared-package changes; no library changeset.

Derived decisions made in this design (flagged for review):

- **Named palette values follow the shared canon.** `bg-charcoal`, `bg-rich-black`, etc. keep their names but take the shared oklch values (9 of 17 hues re-tuned; charcoal and rich-black are drastically darker). Overriding named hues app-side would fork the palette's meaning. The ~27 charcoal/rich-black sites are individually checked in the visual pass and swapped to different tokens where contrast breaks.
- **Fluid type is adopted.** `text-*` utilities (106 sites) keep their names and take the shared clamp() scale; `leading-*` (5 sites) falls back to Tailwind defaults. This is part of adopting the design system, not a regression.
- **`strong` stays 800.** The app layer's base block keeps `font-extrabold` for `strong` (shared base uses 700).

## Architecture

### Stylesheet stack

`apps/architect/index.html` swaps its `tailwind.css` link for a new entry:

```css
/* apps/architect/src/styles/tailwind.css (rewritten) */
@import '@codaco/tailwind-config/fresco.css';
@import '@codaco/fresco-ui/styles.css'; /* @source glue for fresco-ui dist */
@import './architect-theme.css';
```

`main.css` (ProtocolSummary print import) is unchanged in role. `preview.css` is untouched — the preview document is already correct.

### architect-theme.css — the permanent app layer

One file, four sections. All color values are full oklch colors (never HSL triplets — the local HSL plumbing is deleted wholesale).

**1. Brand overrides** (`@layer theme` re-declarations of shared variables):

| Variable                               | Value (today's meaning)                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--background`                         | platinum                                                                                                                                                     |
| `--text`                               | cyber-grape                                                                                                                                                  |
| `--primary` / `--primary-contrast`     | cyber-grape / white                                                                                                                                          |
| `--secondary` / `--secondary-contrast` | neon-coral / white                                                                                                                                           |
| `--accent` / `--accent-contrast`       | slate-blue / white                                                                                                                                           |
| `--selected`                           | mustard                                                                                                                                                      |
| `--link`                               | neon-coral                                                                                                                                                   |
| `--destructive` / `-contrast`          | tomato / white                                                                                                                                               |
| `--warning` / `-contrast`              | neon-carrot / white                                                                                                                                          |
| `--success` / `-contrast`              | kiwi / white                                                                                                                                                 |
| `--info` / `-contrast`                 | cerulean-blue / white                                                                                                                                        |
| `--surface-1..3` / contrasts           | white / platinum / platinum-dark, navy-taupe contrasts                                                                                                       |
| `--input` / `--input-contrast`         | white / charcoal                                                                                                                                             |
| `--focus-color`                        | mustard — preserves Architect's focus-ring color through the shared `focus-styles` machinery without overriding the `focusable` utility fresco-ui depends on |

**2. App-only semantic tokens** (`@theme static` additions — Architect vocabulary with no shared concept): `--color-rules-{type,assert,control,delete,attribute,operator,value}` (+ `rule-*` aliases), `--color-timeline`(+contrast), `--color-sortable-background/-contrast`, `--color-table-row-tint`, `--color-form-control`, `--color-action`(+contrast), `--color-muted` (cyber-grape 60% — replaces `muted-foreground`), `--color-hover/focus/active` and `--color-input-active` (sea-green family), `--color-surface-accent`(+contrast) (navy-taupe/white), `--color-fresco-purple`(+contrast). The same `@theme static` block also **re-emits the named palette at runtime** (`--color-<hue>` and single-hyphen `--color-<hue>-dark` for all 17 hues + white): the shared theme is `@theme inline` and emits no `--color-*` variables, so without re-emission Architect's 149 existing `var(--color-*)` inline-style/SVG reads — and every R5 rewrite target — would silently fail to resolve. `static` (not plain `@theme`) is required because several tokens are consumed only by fresco-ui dist classes or runtime `var()` reads.

**3. Sequence aliases** (`:root`): `--node-color-seq-N: var(--node-N)` (1–8), same for edge/ord; `-dark` variants as `oklch(from var(--node-N) calc(l - 0.05) c h)`. The 7 dynamic `hsl(var(--${color}))` call sites switch to `var(--${color})` and keep working against protocol-data color names unchanged.

**4. Ported utilities and base layer:** `@utility` definitions for `h1–h4`, `hero`, `lead`, `hint`, `code`, `action-link`, `small-heading`, `form-field`, `scrollable`, `clickable`, `protocol-summary-surface`; the `@custom-variant short`; a base block binding `h1–h4` elements (shared base styles no bare headings — 99 element sites in 62 files depend on this), `p` margins, and `strong { font-extrabold }`. All internal `@apply`s rewritten to shared token names (e.g. `lead`/`hint` use `text-muted`, not `text-muted-foreground`). Dropped as dead: `nav-link`, `allow-text-selection` (zero consumers).

### Foundation spike (gates everything)

Before any fan-out: build the stack above, run `pnpm --filter @codaco/architect build`, and settle empirically whether Tailwind v4 (catalog `^4.3.2`) accepts non-quarter decimal spacing multiples (`p-4.8`). This picks the spacing map branch below. Also capture pre-migration baseline screenshots of the checklist routes (see Verification) from `main`.

## Rules catalog (the codemod contract)

Shard agents apply **all** rules to their files. Ambiguity resolution: rules apply to Tailwind class positions (className strings, cva maps, `@apply`) and CSS `var()` positions; identifiers, prop names, data values, and test fixtures are untouched unless a rule says otherwise.

### R1 — Semantic renames (~255 sites)

| From                                                                                                                                 | To                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `*-error`, `*-error-foreground`                                                                                                      | `*-destructive`, `*-destructive-contrast`                             |
| `text-foreground` (etc.)                                                                                                             | `text-text` (etc.)                                                    |
| `*-muted-foreground`                                                                                                                 | `*-muted`                                                             |
| `*-{primary,secondary,accent,surface-N,surface-accent,timeline,input,sortable,action,warning,success,info,fresco-purple}-foreground` | same stem + `-contrast`                                               |
| `border-border`                                                                                                                      | `border-outline`                                                      |
| `*-divider`                                                                                                                          | `*-outline`                                                           |
| `*-input-placeholder`                                                                                                                | `input-contrast/50` idiom (e.g. `placeholder:text-input-contrast/50`) |
| `bg-shadow`, `bg-shadow-elevated` (1 site)                                                                                           | inline replacement at the call site                                   |
| `var(--modal-overlay)` (1 site)                                                                                                      | `bg-overlay` / `var(--color-overlay)`                                 |
| `var(--heading-font-family)` / `var(--body-font-family)`                                                                             | `var(--heading-font)` / `var(--body-font)`                            |

Unchanged by design (survive via the app layer): `background`, `selected`, `warning`, `success`, `info`, `link`, `primary`, `secondary`, `accent`, `surface-1..3`, `input`, `white`, `black`, `transparent`, all named palette utilities, `rules-*`, `timeline`, `sortable-*`, `table-row-tint`, `form-control`, `action`, `hover`/`focus`/`active`, `fresco-purple`.

### R2 — Spacing rewrite (540 sites, 135 files)

Local scale → shared `--spacing` (0.25rem) multiples. **Branch A (exact, preferred — if the spike proves decimal multiples compile):**

| Token         | rem | Class value |
| ------------- | --- | ----------- |
| `--space-0`   | 0   | `0`         |
| `--space-xs`  | 0.3 | `1.2`       |
| `--space-sm`  | 0.6 | `2.4`       |
| `--space-md`  | 1.2 | `4.8`       |
| `--space-lg`  | 1.8 | `7.2`       |
| `--space-xl`  | 2.4 | `9.6`       |
| `--space-2xl` | 3.6 | `14.4`      |
| `--space-3xl` | 4.8 | `19.2`      |
| `--space-4xl` | 6   | `24`        |
| `--space-5xl` | 7.2 | `28.8`      |
| `--space-6xl` | 8.4 | `33.6`      |

**Branch B (rounded — fallback):** xs→`1`, sm→`2.5`, md→`5`, lg→`7`, xl→`10`, 2xl→`14`, 3xl→`19`, 4xl→`24`, 5xl→`29`, 6xl→`34`. Max drift 0.1rem (1.6px at 16px root); reviewers are told to expect sub-2px spacing deltas, and dense editor rows get eyeballed.

Form: `p-(--space-md)` → `p-4.8` (or `p-5`); raw `var(--space-md)` in CSS → the literal rem value.

### R3 — Motion rewrite (74 sites)

`duration-(--animation-duration-standard)` → `duration-300`; `-fast` → `duration-150`; `-slow` → `duration-500`; `ease-(--animation-easing)` → `ease-in-out` (the local curve **is** `cubic-bezier(0.4, 0, 0.2, 1)`, i.e. Tailwind's `ease-in-out` — value-exact). Raw `var()` uses in CSS/inline styles take the literal values.

### R4 — Z-index rewrite (23 sites)

`--z-fx`→`z-1`, `--z-panel`→`z-10`, `--z-global-ui`→`z-20`, `--z-default`→`z-100`, `--z-dialog`→`z-1000`, `--z-modal`→`z-2000`, `--z-tooltip`→`z-3000` (arbitrary form `z-[N]` if bare numbers don't compile). Preserves today's stacking exactly; interplay with fresco-ui's `z-50` portal layer is audited in H4.

### R5 — hsl() rewrite (104 sites, 10 files)

Static `hsl(var(--x))` → `var(--color-x)`; `hsl(var(--x-dark))` → `var(--color-x-dark)`; `hsl(var(--x) / N)` → the Tailwind opacity-modifier utility or `color-mix` at CSS sites. These targets resolve **only** because the app layer re-emits the palette (`@theme static`, §2 above) — the shared theme's `@theme inline` emits no `--color-*` runtime variables. Existing `var(--color-*)` reads are left unchanged for the same reason. Dynamic `hsl(var(--${color}))` → `var(--${color})` for codebook sequence-name domains (app-layer aliases) or `var(--color-${color})` for palette-name domains — determine each site's value domain first. `--picker-*` (6 refs, ColorPicker only) → explicit sizes.

### R6 — Breakpoint remap (~51 sites, ~9 files)

`md:`→`tablet-portrait:` (768, exact), `lg:`→`tablet-landscape:` (1024, exact), `xl:`→`laptop:` (1280, exact), `2xl:`→`desktop:` (1536, zero uses today). `sm:`→`phone-landscape:` changes the cut point 640→480: each of the 11 `sm:` sites is individually reviewed at both widths, not blind-renamed.

### R7 — Forbidden patterns (the machine gate)

At completion, these greps return **zero** matches in `apps/architect/src` + `index.html` (excluding `preview.css`): `hsl(var(`, `--space-`, `--animation-`, `--z-`, `--picker-`, `-foreground` in class positions, `text-error`/`bg-error`/`border-error`, `muted-foreground`, `border-border`, `(^|[^a-z-])(sm|md|lg|xl|2xl):` in class positions, `--heading-font-family`, `--body-font-family`, `--base-font-size` (outside the print port), `@import 'tailwindcss'`.

## Hand-work items (specialists, disjoint files)

- **H1 Fonts / PWA / CSP** (`index.html`, `main.tsx`, `vite.config.ts`): replace Google Fonts links with `@codaco/tailwind-config/fonts/{nunito,inclusive-sans}.css` imports in `main.tsx` (families become `'Nunito Variable'`/`'Inclusive Sans Variable'`); remove googleapis/gstatic CSP allowances and workbox routes; add self-hosted woff2 caching mirroring `apps/interviewer/vite.config.ts` (the current precache glob covers only js/css/html). Boot-loader `#edf2f8` and manifest `background_color` stay (platinum is kept).
- **H2 ProtocolSummary print view** (`protocol-summary.css`, `SummaryPage`, summary components): port `hsl(var(--platinum(-dark)))` reads; re-anchor the print 12px re-base — the current trick relies on `html { font-size: var(--base-font-size) }` from the old theme; under the fluid scale the equivalent is setting `--theme-root-size` on the summary surface. Verified by its own print-preview screenshot.
- **H3 Entry/config**: `index.html` stylesheet swap; repoint `apps/architect/.oxlintrc.json` tailwind `entryPoint` to the new entry (match the other packages' pattern); delete dead `tailwind.config.js`, vestigial `sass` dep, scss vite options, stale README SCSS claims — **skip any of these already removed by the independent cleanup task in flight**.
- **H4 fresco-ui wiring** (`main.tsx` / app shell): `root`-isolated wrapper, `DialogProvider` + `PortalContainerProvider` (+ `TooltipProvider` if not component-local), and a stacking audit: Architect z values (R4) vs fresco-ui's fixed `z-50` portal layer — fresco-ui overlays must not render beneath Architect panels.

## Orchestration (workflow shape)

Executed via the multi-agent Workflow tool; the orchestrator stays lean and delegates all edits.

- **Phase 0 — Foundation (serial):** author `architect-theme.css` + rewritten entry, build spike, spacing-branch decision, baseline screenshots from `main`. Everything else is blocked on this.
- **Phase 1 — Codemod fan-out (parallel):** directory shards of `apps/architect/src` (~10–14 agents; `lib/legacy-ui` is its own shard; no file in two shards). Each agent applies R1–R6 to its shard, using judgment at flagged sites (`sm:` reviews, opacity-modifier hsl forms, text-5xl/6xl → `text-4xl` or `hero`), and self-checks R7 on its shard before returning.
- **Phase 2 — Specialists (parallel):** H1–H4.
- **Phase 3 — Verification:** one `pnpm typecheck` + lint + `pnpm knip` + `pnpm --filter @codaco/architect build` pass (single run, not per-shard); R7 grep sweep; visual sweep (below); adversarial diff-review agents.
- **Phase 4 — Fix loop:** findings become fix agents; repeat Phase 3 checks until two consecutive clean rounds.

## Verification and acceptance criteria

1. Types, lint, knip, and the architect build pass.
2. R7 forbidden-pattern greps return zero.
3. **Visual pass** (headless Chromium against the dev server; non-negotiable): Home, a protocol editor stage screen, a form-heavy editor section, Codebook, NavShell modal, the AppUpdate pill **and its dialog**, one legacy-ui-heavy screen, and the ProtocolSummary print preview — compared against Phase 0 baselines. Expected result: near-nil diffs (brand kept) except (a) fresco-ui components going broken→correct, (b) fluid-type size deltas at non-default viewports, (c) sub-2px spacing drift if Branch B, (d) charcoal/rich-black sites (checked case-by-case).
4. AppUpdateIndicator's tooltip, dialog, and primary button render correctly — the original bug is demonstrably fixed.
5. The preview popup still renders correctly (regression check only; its document is untouched).

## Delivery

Single branch, single PR, one **app-only changeset** for `@codaco/architect` (apps lane; no library changeset — nothing in `packages/*` or `tooling/*` changes). Shipped via the repo's PR conventions after all gates pass.

## Risks and accepted changes

- **Spacing rewrite is the largest reviewable surface** (540 sites). Branch A makes it value-exact; Branch B introduces ≤1.6px drift. Either way the diff is wide — this was chosen deliberately over a compat layer.
- **Charcoal/rich-black re-tuning** may hurt contrast at ~27 sites; handled per-site in the visual pass.
- **Reduced-motion behavior changes globally**: the shared theme zeroes all animation/transition durations under `prefers-reduced-motion` — new, correct behavior, but Architect-wide.
- **`sm:` breakpoint semantics change** (640→480) at 11 sites; individually reviewed.
- **The elevation plugin's global base rule** (`--scoped-bg` inheritance on all `bg-*` elements) applies to all Architect markup; no known conflicts (verified: no `--scoped-bg`/`--published-bg` collisions in architect src), but the adversarial review watches for it.

## Out of scope

Replacing legacy-ui with fresco-ui components; restyling Architect toward the fresco default look; any change to `tooling/tailwind` (including upstreaming sequence `-dark` variants); Interviewer or preview-document changes; migrating Architect's bespoke modals to `useDialog` (H4 only wires the providers).
