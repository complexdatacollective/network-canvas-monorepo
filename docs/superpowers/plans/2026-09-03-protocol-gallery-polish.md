# Protocol Gallery Polish Plan

## Overview

Address the design review of the `feature/protocol-gallery` branch. Six
concerns were raised: the animated page background fights the dense content;
the typography lacks scale levels (authorship too big and loose, long titles
with paragraph leading, "featured" too light); the type is generally too
large compared with Architect; card shadows clip and hover misbehaves; the
card metadata area has no contrast once the background goes; and the stage
colour strip should become a fresco-ui component backed by a shared
stage-type → colour + icon map that Architect's timeline can later adopt.

Work proceeds one step at a time. Each step ends at a visually verifiable
state on `localhost:3001/en/protocol-gallery` and one detail page (for
example `/en/protocol-gallery/sixhumene`, whichever slug has multiple waves),
and nothing from the next step starts until the current one is approved.

Steps 3 and 6 add to `@codaco/fresco-ui`; everything else is confined to
`apps/networkcanvas.com`. The `developing-network-canvas-ui` skill is invoked
once before the first UI edit (step 1).

## Planning context

### What the code does today

| Concern           | Current implementation                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background        | Both pages mount `HomepagePageBackground` (the homepage network weave from `@codaco/art`) with a `data-*-weave-target` anchor. The sidebar and submit card use `bg-surface/75 backdrop-blur-md` so the weave shows through.                                                                                                                                                                        |
| Type scale        | The site opts `--theme-root-size` into `--theme-root-size-fluid` (1rem → 1.1rem above ~1760px) in `app/globals.css`. Architect never overrides the sentinel, so it sits on the fixed 1rem product base from `themes/default.css`. Both share the same `--text-*` clamps, whose middle terms still carry a `vw` component.                                                                          |
| Heading variants  | Gallery h1 uses `section-heading` (`text-4xl font-black`); card titles use `subheading` (`text-2xl font-black`). Long titles are `Paragraph intent="lead"` (detail) or `smallText font-bold` (card). Authorship is `Paragraph smallText muted font-monospace`. "Featured" is the website-local `Eyebrow` (`font-monospace text-xs tracking-widest uppercase`, no weight).                          |
| Small-text tokens | `--text-xs--line-height: 1.85` and `--text-sm--line-height: 1.8`. Every caption, eyebrow and author line inherits that paragraph-grade leading, which is why they read loose.                                                                                                                                                                                                                      |
| Card structure    | `<a hover:-translate-y-1>` → outer `Surface shadow="lg"` (`shadow-xl`, `overflow-clip`) → inner `Surface spacing="md" shadow="none"` for metadata, which the depth ladder paints `bg-surface-1`. Cards render inside `Collection` + `GridLayout` (CSS grid, `gap-6`), each wrapped in a `motion.div layout="position"` and a `[data-stagger-item]` div.                                            |
| Stage colours     | `apps/networkcanvas.com/lib/stageTypes.ts` holds `STAGE_TYPE_COLORS: Record<StageType, string>` of Tailwind `bg-*` classes (two entries, `Information`/`Anonymisation`, are `bg-text/25`/`bg-text/55`, not palette colours). `StageBar.tsx` and `StageSequence.tsx` consume it. Architect's Home animation has its own six-entry `STAGE_META` (hsl colours + landing SVGs) in `timelineScript.ts`. |

### Decisions

| Decision                                                               | Reason                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove the weave outright rather than dimming it                       | A single-colour, near-transparent weave is still motion and still a `fixed` canvas layer behind a dense reading page. Removing it also lets the translucent sidebar/submit surfaces become opaque, which the platinum contrast work depends on. Option B below keeps the dimmed variant available if the plain page feels too flat. |
| Scope the product type scale to the gallery routes, not the whole site | The feedback is about these pages. Flipping `globals.css` would resize the homepage and every other route, which is outside this branch. A wrapper utility on the gallery `<main>` gives the Architect behaviour here; promoting it site-wide is a separate decision.                                                               |
| Add typographic levels to fresco-ui, not to the website                | The reviewer wants them for Studio too. The website's `Eyebrow`/`MonoCaption` are the prototypes; they move into `@codaco/fresco-ui/typography` and the website consumes them.                                                                                                                                                      |
| Tighter leading via explicit variants, not by changing `--text-xs`     | The `--text-*` line heights are the shared body-copy scale for every app and interview surface. Captions, eyebrows and meta lines get `leading-snug`/`leading-tight` in their own variant so body text is untouched.                                                                                                                |
| Stage-type map lives in fresco-ui, keyed by `StageType`                | fresco-ui already depends on `@codaco/protocol-validation` (types) and `lucide-react`, and owns `paletteColorStyles`. A `Record<StageType, …>` fails to compile when a stage type is added, the same guard `INTERFACE_NAMES` uses in protocol-builder.                                                                              |
| Icons come from lucide                                                 | One icon family across nineteen stage types. fresco-ui's five legacy `menu-*` SVGs cover only some types and would mix styles. This is a design call the reviewer may overrule (see Open questions).                                                                                                                                |
| Architect's `STAGE_META` / timeline migration is a follow-up           | The reviewer described it as "eventually". This plan delivers the map and the component; Architect adoption is listed under Follow-ups so it is not forgotten.                                                                                                                                                                      |

### Constraints

- No `any`; no barrel files; `~/` aliases stay inside the app.
- fresco-ui subpath exports are generated: after adding a file to `exports`,
  run `pnpm --filter @codaco/fresco-ui sync-exports`.
- Every new fresco-ui variant or component gets a story (Chromatic) and, where
  behaviour exists, a vitest test.
- Accessibility is not negotiable: colour is never the only carrier of stage
  type (labels and icons stay), `aria-hidden` decoration stays hidden, and the
  card link keeps its `focus-visible` treatment.
- Dark theme: the website runs `next-themes` with `data-theme`, so every new
  colour choice (platinum area, eyebrow tones) is checked in both modes.

## Steps

### Step 1 — Remove the page background

**Files:** `app/[locale]/protocol-gallery/page.tsx`,
`app/[locale]/protocol-gallery/[slug]/page.tsx`,
`components/protocol-gallery/GallerySidebar.tsx`,
`components/protocol-gallery/SubmitProtocolCard.tsx`.

1. Delete the `HomepagePageBackground` import and element from both pages,
   along with the `data-protocol-gallery-weave-target` /
   `data-protocol-detail-weave-target` attributes and the `target` prop
   plumbing they exist for. `HomepagePageBackground` itself stays (the homepage
   uses it); only its `target` prop becomes unused — remove the prop if the
   homepage never passes it, otherwise leave it.
2. Drop `bg-surface/75 backdrop-blur-md` from the sidebar and submit card so
   they are ordinary opaque surfaces.
3. Keep `<main className="relative isolate">` unless it turns out only the
   weave needed it; check nothing else (skip link, sticky sidebar) relies on
   the stacking context.

**Option B (only if the plain page feels too flat on review):** keep
`PageBackground` but with `complexity` reduced, `intensity` ~0.05, no
convergence animation, and a single hue. Not the recommendation.

**Verify:** both pages on light and dark themes; sticky sidebar still sticks;
no console errors.

### Step 2 — Switch the gallery to the product type scale

**Files:** `app/globals.css`, both gallery pages, card and detail components
that pick heading variants.

1. Add a utility in `globals.css`:

   ```css
   /* Product (Architect) type scale for dense content pages. */
   @utility type-scale-product {
     --theme-root-size: 1rem;
     --spacing-base: calc(0.25 * var(--theme-root-size));
     font-size: var(--theme-root-size);
   }
   ```

   `--spacing-base` must be redeclared alongside the root size, otherwise the
   `:root` snapshot cascades down (see the comment in `themes/default.css`).
   `font-size` is set so `em`-based container widths (`max-w-*`) re-resolve,
   matching how the interview and studio themes do it.

2. Apply `type-scale-product` to `<main>` on both gallery pages. The header
   and footer are inside `<main>` today; decide whether they should keep the
   site ramp (move them outside the wrapper) or match the page. Recommendation:
   wrap only the content between header and footer so site chrome stays
   consistent with other routes.

3. Step down the heading choices to Architect's register:

   | Element                  | Now                           | Proposed                        |
   | ------------------------ | ----------------------------- | ------------------------------- |
   | Gallery / detail page h1 | `section-heading` (4xl black) | level `h1` default (3xl bold)   |
   | Intro paragraph          | `lead` (lg)                   | default (base), keep `muted`    |
   | Card short name (h3)     | `subheading` (2xl black)      | level `h3` default (xl bold)    |
   | Detail long title        | `lead`                        | new `subtitle` variant (step 3) |
   | Overline headings        | `all-caps` h4 (sm black)      | unchanged                       |

   The long title and authorship changes wait for step 3 so each step changes
   one thing.

4. Note for the reviewer: even on the product base, `--text-*` keeps a `vw`
   term, so headings still grow slightly with viewport width — exactly as in
   Architect. Making them fully static would mean overriding `--theme-vw`,
   which is not recommended because it changes the whole scale system.

**Verify:** compare the gallery h1 and body against Architect's Home screen
at the same window width; check 1280px, 1440px and 1920px; run
`pnpm --filter networkcanvas.com typecheck`.

### Step 3 — Add typographic levels to fresco-ui and apply them

**Files (fresco-ui):** `src/typography/Heading.tsx`,
`src/typography/Paragraph.tsx`, new `src/typography/Eyebrow.tsx`,
`src/typography/*.stories.tsx`, `src/typography/TypeScale.stories.tsx`,
`package.json` exports (+ `sync-exports`).

**Files (website):** `components/protocol-gallery/Eyebrow.tsx` (delete),
`ProtocolGalleryCard.tsx`, `[slug]/page.tsx`, `StageSequence.tsx`,
`GallerySidebar.tsx`, `ProtocolDetailFacts.tsx`.

New styles (names are proposals; confirm before implementing):

| Addition                     | Classes                                                                   | Used for                                                 |
| ---------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Heading variant="subtitle"` | `text-lg font-semibold leading-snug tracking-normal`                      | Long descriptive titles under a name (detail page, card) |
| `Paragraph intent="caption"` | `text-xs leading-snug`                                                    | Stage counts, "Added …", result counts                   |
| `Paragraph intent="meta"`    | `font-monospace text-xs leading-snug`                                     | Authorship, filenames, dates — compact monospace meta    |
| `Eyebrow` component          | `font-monospace text-xs font-bold leading-none tracking-widest uppercase` | "Featured protocol", facet row labels, "View" link label |
| `Eyebrow tone`               | `muted` (`text-text/60`), `primary` (`text-primary`), `default`           | Featured gets `primary`; row labels get `muted`          |

Design notes for the reviewer to react to:

- Authorship: `meta` at `text-xs leading-snug` is one step smaller and much
  tighter than today's `smallText` (sm at 1.8 leading). If it reads too small
  on the detail page, `text-sm leading-snug` is the fallback.
- "Featured": bold monospace eyebrow in `primary`. If more weight is wanted,
  `font-black` is available on the same component.
- Long title: `subtitle` renders semantically as `<p>` via Heading's `render`
  prop on the detail page (the h1 is the short name), so heading order stays
  valid.

Website changes: replace `Eyebrow`/`MonoCaption` imports with the fresco-ui
versions, swap the long title and authorship to the new variants, update the
`Eyebrow`-based row labels in the card and detail facts.

**Verify:** Storybook `Typography` stories show the new levels alongside
existing ones; gallery card and detail page authorship, title and featured
label; `pnpm --filter @codaco/fresco-ui test -- typography` and typecheck.

### Step 4 — Platinum card metadata area

**Files:** `ProtocolGalleryCard.tsx`, possibly `Tag.tsx` reference for the
existing `light` tone (`bg-platinum text-surface-2-contrast`).

1. Replace the inner `Surface` with `className="bg-platinum text-surface-2-contrast"`
   (Surface documents `bg-*` overrides) or a plain `div` if the depth ladder
   adds nothing. The `hr` dividers switch to `border-platinum-dark`.
2. Check `--platinum` in dark mode: fresco-ui's `Tag light` already relies on
   it, so it should hold, but the card is a much larger area — confirm the
   `Badge variant="outline"` chips and the `MonoCaption` text still meet
   contrast on it in both themes.
3. If the featured border (`border-primary border-2`) now looks heavy against
   platinum, try a 1px border plus the eyebrow, since the eyebrow is bolder
   after step 3.

**Verify:** light and dark; contrast of caption and badges on platinum.

### Step 5 — Fix shadow clipping and hover behaviour

Diagnose first in the browser, then fix. Likely causes, in order:

1. **Neighbouring cards paint over each other's shadows.** Cards in a CSS grid
   are siblings in the normal paint order; a later card (next row) paints over
   the previous row's `shadow-xl`, so the shadow looks cut along the lower
   card's top edge. The hovered card also transforms, which lifts it above its
   siblings while the others stay clipped.
   - Fix: reduce the resting shadow to `shadow="sm"` and give the hover state
     `hover:shadow-xl` plus `relative hover:z-10 focus-visible:z-10` so only the
     lifted card claims a higher layer. Consider `gap` at 6 → 8 if the shadows
     still touch.
2. **Transitions.** `transition-transform` on the link does not cover the
   shadow, so the hover shadow snaps. Use `transition-[transform,box-shadow]`.
3. **Rounded-corner mismatch.** The link (`rounded`) and the Surface
   (`rounded`) both round, but the inner metadata Surface uses `rounded-t-none`
   inside an `overflow-clip` parent; check the bottom corners on hover.
4. **Motion wrapper.** `motion.div layout="position"` applies its own
   transform during re-sorts; if the hover lift fights it, move the hover
   translate from the `<a>` onto the Surface so the two transforms live on
   different elements.
5. Detail page surfaces: confirm `shadow="md"` inside `space-y-8` has no
   clipping; likely fine.

**Verify:** hover each card at the grid edges and in the middle row; keyboard
focus; re-sort while hovering; reduced-motion setting.

### Step 6 — StageBar and the stage-type map in fresco-ui

**Files (fresco-ui):** new `src/stages/stageTypeMeta.ts`, new
`src/stages/StageBar.tsx` (+ story + test), `package.json` exports
(+ `sync-exports`).

**Files (website):** `lib/stageTypes.ts` (shrinks), `StageBar.tsx` (delete),
`StageSequence.tsx`, `ProtocolGalleryCard.tsx`.

1. `stageTypeMeta.ts`:

   ```ts
   import type { LucideIcon } from 'lucide-react';
   import type { StageType } from '@codaco/protocol-validation';
   import type { PaletteColor } from '../styles/palette';

   export type StageTypeMeta = { color: PaletteColor; icon: LucideIcon };
   export const STAGE_TYPE_META: Record<StageType, StageTypeMeta> = { … };
   export const UNKNOWN_STAGE_META: StageTypeMeta;
   export function getStageTypeMeta(type: string): StageTypeMeta;
   export function isStageType(type: string): type is StageType;
   ```

   Colours port from the website map but as palette names so consumers can
   use either `bg-*` classes or `paletteColorStyles[color].color`. The two
   non-palette entries need palette equivalents: `Information` →
   `platinum-dark`, `Anonymisation` → `charcoal` (proposal).

   Proposed icons (lucide): NameGenerator `UserPlus`, NameGeneratorQuickAdd
   `UserRoundPlus`, NameGeneratorRoster `Users`, EgoForm `UserRound`,
   AlterForm `ClipboardList`, AlterEdgeForm `ClipboardPen`, Sociogram
   `Waypoints`, DyadCensus `GitCompareArrows`, TieStrengthCensus `Gauge`,
   OneToManyDyadCensus `GitFork`, NetworkComposer `Workflow`, OrdinalBin
   `ListOrdered`, CategoricalBin `Shapes`, Narrative `BookOpen`,
   FamilyPedigree `Network`, NarrativePedigree `Dna`, Geospatial `MapPin`,
   Information `Info`, Anonymisation `LockKeyhole`. Confirm exact names exist
   in the pinned lucide version before use.

2. `StageBar.tsx`: `stages: readonly { type: string }[]`, optional
   `className`, `aria-hidden` by default with an optional `label` prop that
   renders an `sr-only` summary for consumers who want the bar to carry
   meaning. Segment colour from `getStageTypeMeta(type).color` via
   `paletteColorStyles` (inline `background-color` var) so no class list has
   to be scanned. Story renders a mixed sequence, a single stage, and an
   unknown type. Test: renders one segment per stage and falls back for
   unknown types.

3. Website: `StageBar` imports from `@codaco/fresco-ui/stages/StageBar`;
   `StageSequence` dots (and optionally a small icon next to the type label)
   read `getStageTypeMeta`; `lib/stageTypes.ts` keeps only
   `EDGE_GENERATING_STAGE_TYPES`, `summarizeStages` and their types, and its
   `isStageType` is replaced by the fresco-ui one.

4. Changesets: extend `.changeset/fresco-ui-tag.md` (or add a new fresco-ui
   `minor`) to mention `Eyebrow`, the new `Heading`/`Paragraph` variants,
   `StageBar` and `STAGE_TYPE_META`. The website changeset already covers the
   gallery.

**Verify:** stage bar and sequence on the detail page for a multi-wave
protocol; Storybook `StageBar` story; `pnpm --filter @codaco/fresco-ui test`,
typecheck, `knip`.

### Step 7 — Wrap-up

- `pnpm --filter networkcanvas.com test`, `typecheck`; `pnpm --filter
@codaco/fresco-ui test`, `typecheck`, `lint`; `pnpm knip`.
- Check the Storybook interaction tests for `Collection`, `Tag`, `Badge` still
  pass (`pnpm --filter @codaco/fresco-ui test:storybook` if the script exists).
- Review the diff for stray comments and unused translations.
- Commit per step as they are approved (messages proposed at each step).

## Open questions for the reviewer

1. **Type scale scope:** gallery routes only (this plan) or the whole site?
2. **Icon family:** lucide throughout, or reuse the existing `menu-*` custom
   icons where they exist and fill gaps with lucide?
3. **`subtitle`/`meta`/`caption`/`Eyebrow` naming and sizes:** happy with the
   proposals in step 3, or should the eyebrow be `font-black`?
4. **Neutral colours for `Information` and `Anonymisation` stages** in the
   palette-keyed map: `platinum-dark` and `charcoal`, or something else?

## Follow-ups (not in this branch)

- Migrate Architect's Home `STAGE_META` (`timelineScript.ts`, `TransitMap.tsx`)
  to `STAGE_TYPE_META` so the landing animation and the gallery agree.
- Replace `StageTypeImage` previews in Architect's `TimelineStageRow` with
  colour + icon from the shared map, retiring `@codaco/interface-images` from
  the timeline.
- Decide whether the whole marketing site should drop the fluid root ramp.
- Studio adoption of the new typographic levels.
