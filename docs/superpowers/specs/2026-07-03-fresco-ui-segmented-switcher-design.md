# fresco-ui SegmentedSwitcher — design

**Date:** 2026-07-03
**Package:** `@codaco/fresco-ui` (+ consumers in `apps/interviewer-v8`)
**Status:** Approved for planning

## Goal

Extract the exclusive single-select "segmented switcher" pattern that `interviewer-v8` currently
hand-rolls in two places into one reusable `SegmentedSwitcher` component in `@codaco/fresco-ui`,
built on Base UI's `ToggleGroup`, preserving the animated sliding active-indicator and adding a
`size` prop. Migrate both existing consumers to it.

## Non-goals

- **Not** a replacement for the existing config-driven `@codaco/fresco-ui/SegmentedToolbar` (a
  general control strip with drag/separators/mixed segment types). `SegmentedSwitcher` is the
  focused, exclusive single-select case; `SegmentedToolbar` stays as-is.
- No multi-select, no drag/repositioning, no separators, no overflow menu (YAGNI).
- No new navigation/routing behaviour beyond what the consumers already do.

## Why a new component (rejected alternative)

Wrapping `SegmentedToolbar`'s `GroupSegment` was considered and rejected: it is a rich toolbar
(drag handle, separators, tooltips, a discriminated-union `items` API) whose own non-goals exclude
filter bars. A switcher wrapper would hide most of it and inherit toolbar semantics it doesn't want.
There is no existing simple segmented control to extend (the nearest, `form/fields/ToggleButtonGroup`,
is multi-select categorical buttons), so a new focused component is the right call.

## Public API

`@codaco/fresco-ui/SegmentedSwitcher` (per-package export; no barrel file):

```ts
type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode; // text; may embed a trailing count node (used by the status filter)
  icon?: LucideIcon; // optional leading icon (used by the view switcher)
  disabled?: boolean;
  render?: RenderProp; // Base UI render escape hatch → render the segment as e.g. a wouter <Link>
};

type SegmentedSwitcherProps<T extends string> = {
  'value': T;
  'onValueChange': (value: T) => void; // fired on activation; never emits an empty/deselected value
  'options': SegmentedOption<T>[];
  'size'?: 'sm' | 'md' | 'lg'; // default 'md'
  'aria-label': string; // required
  'className'?: string;
};
```

Generic over `T extends string` so consumers get exact value types (`'protocols' | 'data'`,
`'all' | 'in-progress' | 'complete'`) with no casts.

## Behaviour & internals

- **Foundation:** Base UI `ToggleGroup` (`multiple={false}`) + `Toggle` per option — provides roving
  arrow-key focus, focus looping, and toggle ARIA for free (lean on the primitive).
- **No deselect:** a switcher always has exactly one active segment. Base UI single-select allows
  toggling the active item off (empty selection); the component **guards against this** — an
  onValueChange that would produce an empty selection is ignored (the current value stays). So the
  public `onValueChange` only ever emits a valid, present value.
- **Animated indicator (preserved):** the active segment's background is a `motion.span` with a
  `layoutId` that is **unique per component instance** (derived via `useId`), so multiple switchers
  in one tree never cross-animate. Transition matches the current spring feel
  (`type: 'spring'`, stiffness/damping in the current ~380/32 range). Respects `useReducedMotion()`
  — when reduced, the indicator snaps rather than slides.
- **Indicator colour (theme token):** the indicator uses a semantic theme token (not a literal
  `sea-green`) so it resolves correctly in both fresco-ui themes; in the **interview** theme the
  token resolves to the current sea-green, leaving the interviewer-v8 appearance unchanged. If no
  existing semantic token maps to that sea-green in the interview theme, introduce a dedicated
  indicator token in `@codaco/tailwind-config` so both themes map correctly. The active label uses
  the existing on-indicator contrast token (`text-primary-contrast` today). Verified visually in
  both themes.
- **`size` mapping:** `sm | md | lg` map to a pill scale (horizontal/vertical padding, text size,
  icon size, gap) following the fresco-ui `controlVariants` convention — `md` approximates today's
  status-filter pill, `lg` approximates today's view-switcher pill. Exact class tuples pinned in the
  plan.
- **`render` escape hatch:** an option's optional `render` is forwarded to its Base UI `Toggle` so the
  segment can render as an arbitrary element (e.g. a wouter `<Link href>`), keeping anchor affordances
  (middle-click / open-in-new-tab) for navigation segments while still participating in the group's
  active-state + roving focus. Active state is driven by `value` (derived from the route by the
  consumer); the plan reconciles link `href` navigation with `onValueChange` so a normal click
  navigates once (no duplicate history entry) and keyboard activation still works.
- **Orientation:** horizontal only (both consumers are horizontal). Not exposing an orientation prop
  (YAGNI); revisit if a vertical consumer appears.

## Migrations (one deliverable, not phased)

Both consumers move to `SegmentedSwitcher` in the same change:

1. **`apps/interviewer-v8/src/components/ViewSwitcher.tsx`** — becomes a thin domain wrapper:
   derives `value` from the wouter route (`activeView(location)`), renders
   `<SegmentedSwitcher size="lg" aria-label="Home view" value={...} options={[Protocols, Data]}>`
   where each option's `render` is a wouter `<Link href>` (Protocols → `/`, Data → `/data`), and
   an `onValueChange` that navigates. The Batch-B `ViewSwitcherView` collapses into this wrapper
   (its bespoke pill markup + local `layoutId` indicator are removed — now owned by the component).
   `ViewSwitcher.stories.tsx` updates to story the wrapper.

2. **`apps/interviewer-v8/src/components/DataView/DataViewToolbar.tsx`** — the inline
   `role="tablist"` status-filter pill group (with its local `layoutId="data-view-status-indicator"`)
   is replaced by `<SegmentedSwitcher size="md" aria-label="Status filter" value={chipFilter}
onValueChange={setChipFilter} options={all|in-progress|complete}>`. **Counts stay**: each option's
   `label` embeds the existing count node. The TanStack-table column-filter wiring
   (`chipFilter`/`setChipFilter` and the `progress` column filter) stays entirely in
   `DataViewToolbar` — the component only owns presentation + the toggle. Behaviour (filtering,
   URL persistence, counts) unchanged.

## Stories & tests

- **fresco-ui:** `SegmentedSwitcher.stories.tsx` (multi-theme, following the package's
  theme-switcher storybook convention) — single args-driven story plus presets exercising `size`
  (sm/md/lg), icon vs no-icon, count labels, a disabled segment, and the `render`-as-link case.
  `SegmentedSwitcher.test.tsx` — value-change fires `onValueChange`; the no-deselect guard (clicking
  the active segment keeps it active); keyboard roving via `ToggleGroup`; reduced-motion path renders.
- **interviewer-v8:** update `ViewSwitcher.stories.tsx` (now the wrapper). The `DataViewToolbar`
  story lands in the resumed non-auth story batch (Task 15 cluster 15e), consuming the real
  `SegmentedSwitcher`. Existing `DataView`/`ViewSwitcher` unit tests (if any) stay green.

## Package wiring

- Add a `./SegmentedSwitcher` entry to `packages/fresco-ui/package.json` `exports` (types + default,
  pointing at the built `dist`), mirroring the `./SegmentedToolbar` entry. No barrel file.
- interviewer-v8 consumes fresco-ui as built `dist`; turbo `^build` builds fresco-ui before
  interviewer-v8 typecheck/stories. When running interviewer-v8 storybook/tests locally, fresco-ui's
  `dist` must be rebuilt first (its `dev` watcher, or a `turbo run build --filter=@codaco/fresco-ui`).

## Verification

- fresco-ui: `pnpm --filter @codaco/fresco-ui build`, the new `SegmentedSwitcher` story renders in
  both themes (visual check — the interview theme indicator matches the current sea-green), the
  `.test.tsx` passes, `pnpm --filter @codaco/fresco-ui typecheck`.
- interviewer-v8: `pnpm --filter @codaco/interviewer-v8 typecheck` (0 errors), existing
  `DataView`/`ViewSwitcher` unit tests green + unchanged, `ViewSwitcher`/`DataViewToolbar` stories
  render, and the sliding animation + counts + navigation are visually preserved.
- Repo: `pnpm knip` (new export is consumed), `pnpm lint:fix` handled by pre-commit.
- No changeset for interviewer-v8 (unreleased). fresco-ui **is** released — a changeset is required
  for the new `SegmentedSwitcher` export (confirm during planning).

## Risks

- **Indicator-token colour drift.** If the chosen token doesn't resolve to the exact current
  sea-green in the interview theme, the switcher's look shifts. Mitigated by visual verification in
  both themes and, if needed, adding a dedicated indicator token so the interview theme matches.
- **Link/`onValueChange` double-navigation.** The nav segments are both `<Link href>` and driven by
  `onValueChange`. Mitigated by reconciling so a click navigates once (verified: no duplicate history
  entry; keyboard activation works).
- **Base UI single-select deselect semantics.** Mitigated by the explicit no-deselect guard, covered
  by a unit test.
- **fresco-ui `dist` staleness for the interviewer-v8 consumer.** Standard turbo `^build` ordering;
  note the rebuild requirement when running interviewer-v8 storybook/tests locally.
  </content>
