# @codaco/interview

## 1.0.0

### Major Changes

- Initial alpha release of `@codaco/interview` — the Network Canvas interview engine extracted from Fresco's `lib/interviewer/` into a standalone, host-pluggable package.

  The package exposes a single `Shell` component plus the supporting context for embedding the interview UI in any React host (Next.js, Vite, Electron, etc.). It owns its own theme, Redux store, AnimatePresence-based stage navigation, and synthetic network generator; the host plugs in `currentStep`, `onStepChange`, `onSync`, `onFinish`, and `onRequestAsset`.

  Key design decisions baked in for 1.0.0:
  - `currentStep` is held in host state and threaded in through React Context (`CurrentStepContext`), not in the Redux store. `useStageSelector` reads a lagging `displayedStep` so selectors keep returning the OLD stage's data while the exit animation plays — the swap to the new stage only happens once `onExitComplete` fires.
  - All in-package selectors that depend on the current stage are parameterised — they take `currentStep` as their second argument and compose via reselect.
  - Stage components consume those selectors through `useStageSelector` rather than `useSelector`, so a stale stage subtree never reads new-stage data during the two-phase navigation transition.
  - Theme tokens, font-size scale, and the `interface` / `focusable` / `scroll-area-viewport` utilities live in `@codaco/tailwind-config` and are scoped to the `<main data-interview>` root the Shell renders, so the host's typography is unaffected.
  - E2E coverage is the SILOS protocol replay (56 tests × 3 browsers = 168 visual snapshots) running in the Playwright Docker image for snapshot determinism.

### Minor Changes

- Extract the synthetic network generator and `SyntheticInterview` builder into a new workspace package, `@codaco/protocol-utilities`.

  **Breaking for `@codaco/interview`:** `generateNetwork`, `GenerateNetworkOptions`, `GenerateNetworkResult`, and `StageMetadataSchema` are no longer exported from `@codaco/interview`. Import `generateNetwork` and friends from `@codaco/protocol-utilities`; import `StageMetadataSchema` (and the related `DyadCensusMetadataItem` / `StageMetadata` types) from `@codaco/shared-consts`.

  ```diff
  - import { generateNetwork, StageMetadataSchema } from '@codaco/interview';
  + import { generateNetwork } from '@codaco/protocol-utilities';
  + import { StageMetadataSchema } from '@codaco/shared-consts';
  ```

  The new `@codaco/protocol-utilities` also publicly exports `SyntheticInterview` (previously internal to `@codaco/interview`), along with the `ComponentType` and `VariableOption` types used by its public methods.

  `@codaco/shared-consts` gains the session-stage-metadata schemas (`StageMetadataSchema`, `DyadCensusMetadataItem`, `StageMetadata`) as the cross-package contract between synthetic-generation output and the interview engine's session state.

  `@codaco/interview`'s runtime entry point and other public exports are untouched. The interview engine no longer carries the synthetic-data code in its published bundle.

### Patch Changes

- Accessibility lint fix: the Information interface's video and audio players now
  carry an `aria-label` derived from the asset name/description.

  Dependency bumps: `immer` (→ ^11.1.8), `mapbox-gl` (→ ^3.24.0).

### Prerelease Changes

- Refactor: extract shared `actionButtonVariants` (circle, plus-badge, icon classes) used by `ActionButton`, `NodeForm`, and `QuickAddField`. Custom kebab-case icons and Lucide icons now size consistently across all three call sites — Lucide icons are constrained to `h-16` while custom icons fill the container. Storybook stories for `NodeForm` and `QuickAddField` now expose an `icon` control so all icons can be exercised interactively.

- Sync with `@codaco/tailwind-config@1.0.0-alpha.9` and `@codaco/fresco-ui@2.5.3`. The new release picks up the foundational base-layer rules and the global `prefers-reduced-motion` override that now ship inside `@codaco/tailwind-config/fresco/utilities.css`. No interview-package source change.

- Sync with `@codaco/tailwind-config@1.0.0-alpha.11` and `@codaco/fresco-ui@2.5.4`. The dev/test host CSS (`styles/host.css`, used only by the e2e Vite host and Storybook preview) drops its now-redundant `@import "tailwindcss"` — that line is now owned by `@codaco/tailwind-config/fresco.css` and was loading Tailwind's runtime twice. No published interview-package source change.

- Add a published CSS entry: `@codaco/interview/styles.css` (resolves to `dist/styles.css`). It contains a single `@source "./**/*.{js,ts,tsx}"` directive scoped to the package's compiled JS, so consumers no longer hand-roll `@source '../node_modules/@codaco/interview/dist/**/*.js'` in their globals.

  This pairs with the parallel `@codaco/fresco-ui@2.6.0` cleanup. Each CSS file in the chain now owns one concern: tailwind-config owns Tailwind v4 + theme + plugins + fonts, fresco-ui owns its scanner glue, and interview owns its scanner glue. Consumer entry CSS becomes:

  ```css
  @import '@codaco/tailwind-config/fresco.css';
  @import '@codaco/fresco-ui/styles.css';
  @import '@codaco/interview/styles.css';
  ```

  The interview package's vite build now copies `src/**/*.css` verbatim into `dist/` via a `cssCopyPlugin` (mirroring fresco-ui), so the `@source` directive ships through with its path intact.

- Document the canonical CSS chain in `dist/styles.css` more emphatically: importing `@codaco/interview/styles.css` is **mandatory** for any host loading the package — without it, Tailwind v4's auto-detection won't reach `node_modules/@codaco/interview/dist` and the stage interface utilities (`.interface`, ActionButton sizing, QuickAdd toggle dimensions, etc.) won't be generated, leaving components unstyled.

  The header now also calls out the source-alias case explicitly: hosts that alias `@codaco/interview` at the package's `src` directory should still `@import` this file unless they've added their own `@source` covering the interview source tree, since Tailwind's auto-source scanner is rooted at the consumer's Vite root and won't always reach into a sibling package's source.

  No runtime change. The single `@source "./**/*.{js,ts,tsx}"` directive that does the actual work is unchanged from `1.0.0-alpha.12`.

- `Shell` now scopes the interview theme purely declaratively via `<ThemedRegion theme="interview">` (from `@codaco/fresco-ui/ThemedRegion`). Removed the host-side `useLayoutEffect` requirement that previously toggled `data-theme-interview` on `<html>`.

  Hosts mount `Shell` anywhere in the tree and the theme — plus a portal container that re-roots Base-UI portals (dialogs, popovers, dropdowns, tooltips, toasts, selects, comboboxes) inside the themed subtree — travels with it. The `<main data-theme-interview>` marker on the rendered DOM is unchanged, so existing test/e2e selectors continue to match.

  For interview-themed UI rendered **outside** `Shell` (e.g. a post-interview "thank you" page), use `<ThemedRegion theme="interview">` directly. See README → _Theming & DOM scope_.

  `CategoricalBin` now exposes a `data-cb-layout-pending` attribute on its outer container while its ResizeObserver-driven layout debounce is in flight. The attribute is cleared once `cols`/`rows` are committed. Runtime behaviour is unchanged for end users; the signal exists so e2e tests can deterministically wait for the catbin layout to settle before capturing screenshots.

- Pairs with `@codaco/fresco-ui@2.8.0` and `@codaco/tailwind-config@1.0.0-alpha.16` to make the scoped interview theme actually paint when `data-theme-interview` is applied to the `<main>` wrapper instead of `:root`.

  `Shell` no longer hardcodes the `scheme-dark` utility on `<main>` — it's now applied automatically by `<ThemedRegion theme="interview">` (fresco-ui 2.8.0). No consumer-visible change beyond the upgrade requirement: the rendered DOM still has `data-theme-interview` and `scheme-dark` on the same element.

  `canvas` selectors (`getPlacedNodes`, `getEdges`, `getNodes`, `getUnplacedNodes`) converted from JS to TypeScript. Runtime behaviour is unchanged for valid protocols — dead branches that the type system rules out (array-shaped subjects, type-keyed `layoutVariable` lookups) were dropped during the conversion.

- Move `immer` from `peerDependencies` to `dependencies`. Hosts no longer have to declare `immer` themselves — interview ships its own resolved version (catalog `^11.1.4`, aligned with fresco-ui and the workspace `@reduxjs/toolkit` / `zustand` transitives via a `pnpm.overrides` entry). The single-instance contract that `enableMapSet()` and Draft tracking rely on is preserved; consumers just don't have to opt in.

  Also bundles the trash-bin icon with the package: `NodeBin` no longer references `bg-[url(/images/node-bin.svg)]` (which required consumers to serve the asset themselves) and instead imports the SVG via Vite, which inlines it as a data URI on a sibling JS module. Consumers can drop their `public/images/node-bin.svg` copies on upgrade.

  Adds the `publish-colors` utility (from `@codaco/tailwind-config@1.0.0-alpha.16`'s elevation plugin) to `Shell`'s `<main>` element so semantic color tokens flow through to descendants under the scoped interview theme. Drops `--color-` prefixes from a handful of arbitrary `bg-[--…]` values now that tailwind-config alpha.16 exposes bare semantic tokens via `@theme inline`.

- `Narrative/PresetSwitcher` rebuilt on top of fresco-ui's `Popover`/`Accordion`/`RadioItem` wrappers, with a drag-handle button driven by `useDragControls` and a pure-toggle popover (only the trigger opens or closes it). The floating panel uses `Surface spacing='sm'` with explicit `shadow-xl`, accordion sections flatten their header into a single `Trigger` that applies `headingVariants()` directly, and the unused `presetLabelVariants`/`presetContentVariants`/`prevPresetRef` from the prior `AnimatePresence`-based version are removed.

  `OneToManyDyadCensus` rebuilt around the shared `Panel` + `NodeList` primitives. Replaces the hand-rolled `Surface`/`Heading`/`Collection` stack so the targets list matches the established node-list pattern (header, sizing, animation, DnD-ready). Focal source renders at size `'md'`, collection items at `'sm'`. `Panel` now forwards `className` so consumers can constrain its width. Panel title copy clarified.

  `DyadCensus` and `TieStrengthCensus` migrated to listbox semantics. `TieStrengthCensus` replaces `BooleanOption` with `RichSelectGroup` (horizontal listbox); `BooleanOption` is deleted. The two duplicate `Pair` components consolidate into a single shared component with an optional SR-only `labelId`. Both stages wire `aria-labelledby` on the response field to the pair label + `Prompts` id, so screen readers announce "Alice and Bob, [prompt], listbox, [option]" on focus arrival. `Prompts` accepts and forwards an `id` prop.

  Intro/explanation markdown bodies now render through `ALLOWED_MARKDOWN_SECTION_TAGS`, so plain-text content renders inside `<p>` instead of being unwrapped. `IntroPanel` drops the wrapping `<span>` (invalid markup around block content).

  Synthetic data:
  - `addNodeType` auto-adds a `'name'` text variable to every node type. The existing `getNetwork` attribute-fill path already populates text variables with faker `firstNames`, and `getNodeLabelAttribute` already prefers a variable named `'name'`, so synthetic nodes now get realistic seed-deterministic labels instead of the `'Person'`-typed fallback.
  - `addStage`'s `initialNodes: number` is now `{ count, promptIndex? }`. The optional `promptIndex` resolves to a real `promptID` at `getNetwork()` time so panel nodes carry a realistic prior promptID.

  Theme cascade + `Shell` consolidation: extract a `theme-base` utility and apply it inside `ThemedRegion` (and `<body>`) so descendants re-resolve themed values; mount `DndStoreProvider` and the interview `Toast.Provider` inside `Shell` (hosts no longer need them); drop the unused `InterviewToastViewport` and `interviewToastManager` public exports. `ProgressBar`/`Spinner`/`NodeBin`/`PassphrasePrompter` switch from `rem` to `var(--theme-root-size)` so sizes scale with the theme's root size at breakpoints. `--radius` indirects through `--radius-base` so the bare `rounded` utility keeps a `var()` reference at use-site.

  Spacing/container tokens now scale with `--theme-root-size` (via `@codaco/tailwind-config@1.0.0-alpha.17`). `Node` drops per-breakpoint `size-XX` variants; `Collection` layouts express `gap` in Tailwind spacing units (internal pixel math resolves the same `calc(N * var(--spacing-base, 0.25rem))` via a hidden measurement element); spacing tweaks across `NodeList`, `Panel`, `Prompt`, `FamilyPedigree`, `NameGenerator QuickAddField`/`Roster`, and `OneToManyDyadCensus`. The `pedigree-context-menu-hint` PNG is bundled via Vite import.

  `NodeBin` renders the SVG via `<img src>` rather than `style={{ backgroundImage: url(...) }}` on a motion child (the inline `style` was silently dropped by React under `motion.div`). Interview's flex panel only applies `overflow: hidden` during collapse.

  Storybook: `withTheme` decorator now also wraps stories in `ThemedRegion`; `data-theme-interview` restored on `document.body`; `NameGenerator` quick-add wires to the real codebook variable id (fixes `NETWORK/ADD_NODE/rejected`); `viteFinal` uses `mergeConfig` and pre-bundles `d3-force`.

  Internal: adopt the `~/*` path alias via `tsconfig` paths. Relative imports deeper than one directory up rewrite to `~/...`; single-up (`../foo`) and same-dir (`./foo`) imports are left untouched. Vite rollup `external` excludes `~/*` so `preserveModules` resolves the alias to relative paths in the published `dist`.

- Switch the `Shell.tsx` interview-theme import to the new `@codaco/tailwind-config/fresco/themes/interview.css` path introduced in tailwind-config 0.5.0. Required so consumers of `@codaco/interview` resolve the theme under the package's exports field. No runtime behaviour change.

- **Public-API removal.** `generateNetwork`, `GenerateNetworkOptions`, `GenerateNetworkResult`, and `StageMetadataSchema` are no longer exported from `@codaco/interview`. Import them from their new homes:

  ```diff
  - import { generateNetwork, StageMetadataSchema } from '@codaco/interview';
  + import { generateNetwork } from '@codaco/protocol-utilities';
  + import { StageMetadataSchema } from '@codaco/shared-consts';
  ```

  The synthetic-data code (`generateNetwork`, `SyntheticInterview`, plus shared `ValueGenerator`/types/constants) has moved into the new `@codaco/protocol-utilities` workspace package. The session stage-metadata schemas have moved into `@codaco/shared-consts`. The interview runtime bundle no longer carries either.

  Internal cleanup: removed the `~/utils/codebook.ts` shim (replaced by canonical types from `@codaco/protocol-validation`); redirected `DyadCensusMetadataItem` imports to `@codaco/shared-consts`; Storybook stories import `SyntheticInterview` from `@codaco/protocol-utilities` (devDependency); dropped now-unused `zod` from `dependencies` (transitive usage via `@codaco/protocol-validation` and `@codaco/shared-consts` is unaffected).

- Update peer dependency on `@codaco/tailwind-config` to track its 1.0 alpha. No source changes — the package's CSS imports already use paths that survived the tailwind-config 1.0 reorganization (`fresco.css` and `fresco/themes/interview.css`).

- **Breaking** (still pre-1.0): replace `onError` callback with built-in PostHog analytics.
  - New required Shell prop `analytics: InterviewAnalyticsMetadata` — `installationId` and `hostApp` are required, `hostVersion` optional.
  - New optional `posthogClient` (host can supply its own client) and `disableAnalytics` (default `false`, set `true` for E2E and synthetic-interview runs).
  - `ProtocolPayload.hash` is now required — host computes via `hashProtocol` from `@codaco/protocol-validation` at protocol-import time; the package forwards as `protocol_hash` super-property.
  - `onError` Shell prop and `ErrorHandler` exported type are removed; render errors and asset-load failures now report via `posthog.captureException` internally.

  Per-interface and stage-level events instrumented across name generators, sociogram, censuses, bins, narrative, family pedigree, anonymisation, geospatial, and the form family. PII is enforced by construction: events never include protocol-author content, codebook variable names, alter labels, free-text input, or passphrases — only structural identifiers, codebook internal ids, counts, durations, and package-defined discriminators.

- Fill in deferred analytics events:
  - Sociogram: `simulation_started` and `simulation_finished` now fire from `useForceSimulation`'s worker lifecycle (first tick → started; `end` → finished, with `duration_ms`, `node_count`, `edge_count`).
  - NameGeneratorRoster: `roster_filter_changed` (debounced; `has_filter` boolean) wired through Collection's `onFilterChange`.
  - Geospatial: `geospatial_search_performed` fires from inside `useGeospatialSearch`'s debounced query callback.
  - Narrative: `narrative_preset_updated` now also fires for `changed: 'group'` and `changed: 'edge_type'` (previously only `'highlight'`).
  - FamilyPedigree: `pedigree_wizard_abandoned` fires when the wizard dialog closes without producing a `batch` result.
  - Form family: `form_dismissed_without_save` fires on the discard-changes confirm path in both SlidesForm (AlterForm/AlterEdgeForm/SlidesForm) and EgoForm. `form_validation_failed` now includes `field_errors: Array<{ field_index, component, message }>` (engine validation messages — may include codebook variable references on the `differentFrom`/`sameAs` rules; that leak is acceptable per spec).
  - Stage validation: `stage_validation_failed` fires from `useStageValidation` when a constraint blocks navigation, with structural `validation_kind` per constraint and `direction`.

- Inline the Sociogram force-simulation Web Workers via `?worker&inline` so the published bundle no longer emits absolute `/assets/<hash>.js` worker URLs paired with `/* @vite-ignore */`. The previous emission only resolved under a Vite host runtime; Turbopack (Next.js 16's default bundler) treats the leading `/` as a server-relative import and fails the build with "server relative imports are not implemented yet". Workers are now embedded as Blob URLs at build time, which is bundler-agnostic. Trade-off: the d3-force worker code (~36 kB unminified, ~8 kB gzipped) ships in the main chunk instead of a separate request.

- Two changes that ride on `@codaco/tailwind-config@1.0.0-alpha.7`:
  1. **Shell's interview theme attribute is now `data-theme-interview`** (was `data-interview`). The `<main>` element rendered by `Shell` carries this attribute, and the interview theme's selectors in `@codaco/tailwind-config` activate against it.
  2. **Shell no longer self-imports the interview theme CSS.** Both themes now ship inside `@codaco/tailwind-config/fresco.css` (re-exported via `@codaco/fresco-ui/styles.css`), so any host that loads fresco-ui's styles already has the interview theme available. The previous explicit `import "@codaco/tailwind-config/fresco/themes/interview.css"` from `Shell.tsx` is gone.

  E2E test fixtures and Storybook decorators in this package update their selectors to match the new attribute.

- Shell now mirrors `data-theme-interview` onto `<html>` via a `useLayoutEffect` (set on mount, removed on unmount), in addition to the existing static attribute on its `<main>`. Pairs with `@codaco/tailwind-config@1.0.0-alpha.8`'s `:root[data-theme-interview]` selectors so `1rem` tracks the interview theme's responsive font-size override (16/18/20px at tablet / desktop) — every `text-*` and `p-*` / `gap-*` utility now scales together without the em-compounding regression that landed in alpha.7.

  The marker on `<main data-theme-interview>` is preserved as a stable selector for tests, e2e fixtures, and storybook hooks.

  The interview package's Storybook decorator (`.storybook/preview.tsx`) does the same: it mounts an `InterviewThemeRoot` component that toggles the attribute on `<html>` so every story in this package renders in interview mode.

- Several CategoricalBin layout/render fixes and motion-gating cleanup:
  - **CategoricalBin no longer renders bins until layout has settled.** `useCircleLayout` now exposes `isReady`; `CategoricalBin.tsx` gates its `<AnimatePresence>` subtree on it. The hook also waits for a 120ms ResizeObserver-quiet window (and rejects measurements smaller than 64px) before committing dimensions, so the bins land in their final grid on first paint instead of briefly stacking vertically while parent flex/sibling motion settles. The `containerRef` moved from the inner `motion.div` to the outer `.catbin-outer` (the actual `flex-1` element whose dimensions drive the layout decision).
  - **CategoricalBin wrapper class fixed for WebKit flex-determined sizing.** `<div className="flex size-full flex-col items-center gap-2">` → `<div className="flex w-full min-h-0 flex-1 flex-col items-center gap-2">`. The previous `size-full` (= `height: 100%`) didn't resolve definitely on WebKit when the parent's height was flex-determined.
  - **Removed per-component `isE2E` motion skips** in `Shell.tsx` and `QuickNodeForm.tsx`. Animation disabling is the responsibility of the host's `MotionConfig` (the e2e host now uses `reducedMotion="always" skipAnimations`); individual motion components shouldn't replicate that. The `isE2E` flag remains for non-motion concerns (mock data, test instrumentation, mapbox stubbing, video stability).
  - **`Navigation.tsx` `animate-pulse-glow` CSS class is now gated on `useReducedMotion()`** so the pulse stops cleanly under reduced-motion preference.

- The viewport-width ramp for the `--theme-root-size` type-scale sentinel (1rem → 1.125rem → 1.25rem) now lives on the interview `Shell`'s `<main>` instead of on every `[data-theme-interview]` element. The `[data-theme-interview]` rule in `@codaco/tailwind-config` keeps only the non-responsive base (`--theme-root-size: 1rem` + `font-size`), so only the full-screen interview scales its type with the viewport — other themed regions (app chrome, Storybook wrappers, embedded previews) stay at the base size.

  The mid-tier breakpoint is corrected from a hardcoded `1080px` to the `--breakpoint-laptop` token (`1280px`); the upper tier remains `--breakpoint-desktop-lg` (`1920px`). Between 1080–1279px the interview now renders at the base 1rem instead of 1.125rem.

## 1.0.0-alpha.26

### Prerelease Changes

- `FamilyPedigree`: ego is now labelled explicitly (its name, or "You") in candidate and reference lists instead of falling through to "Family Member" — e.g. the add-partner flow no longer asks "Is this person also a parent of Family Member?" when adding a partner to one of ego's parents.
- `FamilyPedigree`: the quick-start no longer emits partner edges for partnership-matrix rows whose endpoints were not materialized as nodes (e.g. stale "additional parent" rows after toggling "other parents" off).
- `FamilyPedigree`: the biological-parents intro derives its SVG roughen-filter ids per instance (via `useId`), avoiding duplicate DOM ids when multiple instances mount.
- `FamilyPedigree`: fix a typo in the incomplete-pedigree dialog copy.

## 1.0.0-alpha.25

### Prerelease Changes

- `FamilyPedigree`: when re-opening the define-parents and add-sibling wizards, a separate gestational carrier (a `surrogate` edge) is no longer mistaken for the egg parent. The egg and sperm parents are identified by their recorded gamete role, and the surrogate is preselected as the gestational carrier with the egg parent marked as not having carried the pregnancy.

## 1.0.0-alpha.24

### Prerelease Changes

- `FamilyPedigree`: grandparents (a parent's own parents) are no longer a hard requirement for finalizing the pedigree, and the checklist no longer prompts for them on parents who are not genetic relatives of the participant.

  Previously the requirement was computed in two places that disagreed and neither matched the genetic model in `computeBioRelatives` (only `biological` and `donor` edges are genetic):
  - The finalize gate (`validatePedigreeCompleteness`) treated every parent except `partner`/`social` as biological, so it demanded grandparents for **adoptive** and **surrogate** parents. An adopted participant was blocked from continuing because the checklist asked for the adoptive parents' own parents — information that carries no genetic signal about the participant.
  - The checklist required grandparents for `biological` and `adoptive` parents while skipping `donor`/`surrogate`, contradicting the gate (a `donor` parent could read as "done" in the checklist and then be blocked by the gate).

  Now:
  - The finalize gate only requires that ego has at least two parents defined (adoptive included, so adopted participants can finalize). The grandparent requirement is gone.
  - The checklist shows an **optional**, non-blocking "Add parents for …" nudge **only** for genetic parents (`biological`/`donor`). Adoptive and surrogate parents are never prompted for grandparents. A genetic parent's ancestry may still be genuinely unknown — anonymous gamete donors being the common case — so it is never forced.

  This aligns with the 3-generation pedigree standard (Bennett et al., 2022), which collects the family history that is _available_ and records unknowns explicitly rather than forcing every ancestor to exist.

- `FamilyPedigree`: confirm each child's egg and sperm parent, instead of assuming the participant and their partner are both genetic parents of every child.

  The quick-start wizard previously asked only "do you have a partner?" and "how many children do you have with this partner?", then recorded a `biological` parent edge from **both** the participant and the partner to **every** child. That silently assumed both were the child's genetic parents — so the data model could not represent donor conception, surrogacy, same-sex couples, or social co-parents created during the quick-start, and the "Add parent" menu offered impossible options (e.g. "biological"/"donor") on a child whose two genetic parents were already known.

  Now:
  - Every child-creation path captures the child's egg parent, sperm parent, and (when different) gestational carrier through one shared `BioTriad` model — the same one the "Add child" wizard already used. Donor and surrogate parents are generated as needed, and the partner is only recorded as a parent of a child when the participant actually selects them as the egg or sperm source.
  - The "Add parent" dialog now counts a node's genetic parents (`biological`/`donor` edges) and, once both genetic slots are filled, offers only non-genetic parent types — removing the impossible options.

  Internally, the per-child parentage logic is unified in a single `buildChildParentage` helper shared by the quick-start and the add-child wizard, and the unreachable "simple add-child" form path was removed.

- `FamilyPedigree`: unnamed family members are now labelled by their relationship to the participant instead of "Unknown person", and an adopted participant's two unnamed biological parents are distinguished as the **Egg Parent** and **Sperm Parent**.

  Candidate and reference lists in the add-sibling, add-child, and add-parent wizards previously showed "Unknown person" for any node without a name — which gave no way to tell two unnamed parents apart (e.g. the egg and sperm parents of an adopted participant when adding a sibling). They now use the relationship labeller, which describes a node relative to the participant ("Egg Parent", "Sperm Parent", "Donor", "Rob's Parent", …).

  To support this, which gamete a biological/donor parent contributed (egg vs sperm) is recorded as an **internal** field on the pedigree edge and persisted in **stage metadata**. It is never written to the interview network as an attribute, and needs no protocol-schema change. The egg/sperm distinction can no longer be set to the same person within a single child's biological parents.

- `FamilyPedigree`: the wizards that pick a parent now offer a topology-aware candidate list. Genetic (egg/sperm) parents are restricted to people who could plausibly be a genetic parent of the new node — the relevant co-parents plus any existing donor (reusable) — so adding a sibling no longer offers the participant, their children, or their grandparents. Social/adoptive parents (via "Add parent") can now be an existing person, such as an aunt/uncle or grandparent who became a child's adoptive parent, instead of only a newly created one. Defining a node's parents offers the same genetic candidate list.

- `FamilyPedigree`: a node's partner is no longer offered as a possible parent of that node. The "add parent" social/adoptive list now excludes the node's partners (a partner can't be a parent), and the genetic "define parents" list excludes them too so a partner who has also been recorded as a donor can't be offered as the node's own genetic parent.

- `FamilyPedigree`: when adding a child, the node's siblings are now offered as possible egg/sperm parents so an existing sibling can be selected as a gamete donor (e.g. a sister donating an egg combined with a partner's sperm) without recreating them. Siblings are offered only in the add-child flow — a same-generation sibling still can't be the node's own parent or a new sibling's parent.

- `FamilyPedigree`: "Add parent" is now available on every node, including ego's partner. Previously it was hidden only for ego's direct partner, while every other married-in partner (e.g. a child's partner) could add parents — an inconsistency. A married-in person's parents are collected when clinically relevant (recessive/X-linked risk, consanguinity, an affected partner), and the consultand's own partner is among the most likely to warrant it, so the action is offered everywhere and left to the user's judgement.

- `FamilyPedigree`: the checklist now nudges you to record a partner's parents once that partner has had children with ego. A partner who contributes to the next generation has family history relevant to those children, so their parents are prompted — optionally, like the grandparents nudge, and only when the partner is a genetic (biological/donor) co-parent.

- `FamilyPedigree`: a parent who is both the egg source and the gestational carrier of a child now gets a single parent→child edge (flagged as carrier) rather than a duplicate one. This fixes existing children appearing twice when adding a partner, and a latent issue where the extra edge could skew the egg/sperm preselection when adding a sibling. A store-level guard now throws if a second edge of the same relationship type is created between the same pair of nodes, so duplicate-edge bugs surface immediately instead of accumulating silently.

- `FamilyPedigree`: treat every gestational carrier in the wizards as a non-genetic surrogate. A gestational carrier never contributes the egg, so the redundant "Was this person a gestational surrogate?" question has been removed from both the quick-start and add-parents-later flows, and the carrier is now always recorded with the `surrogate` relationship type. This also fixes a bug where a carrier who used a donated egg was classified as `biological` and incorrectly counted as a genetic relative of the participant.

- `FamilyPedigree`: `addableParentTypeOptions` now also hides the surrogate option once a gestational carrier is recorded for a node (it previously only removed the genetic biological/donor options once both gamete parents were known). This applies both when adding a parent and when adding a partner who might also be a parent of an existing child — so a new partner of a co-parent can only be added as a social (step/adoptive) parent of that child.

- `FamilyPedigree`: a donor-conceived child carried by a gestational carrier (e.g. a single parent using two donors) now renders a line of descent. The layout drew a descent only for children with a primary (biological/social/adoptive) parent, so a child whose parents were all auxiliary (gamete donors plus a surrogate) showed no edges. Following standard pedigree nomenclature — the carrier's line of descent is solid and the pregnancy sits below whoever carried it — the gestational carrier now anchors the descent when the child has no primary parent, with the donors attached as auxiliary lines. Children with a primary parent are unchanged.

- `FamilyPedigree`: the node menu's "Edit name" action is now "Edit" and opens the full person form — the name plus any protocol-supplied node form fields — pre-populated with the node's current values, rather than just the name. Editing is offered only while building the pedigree; once finalized, nodes are no longer editable and the previous finalized name-only edit is removed.

- `FamilyPedigree`: finalizing a pedigree that has no disease nomination prompts now advances to the next interview stage, instead of moving to a non-existent prompt and rendering an empty nomination prompt alongside the finalized pedigree.

- `FamilyPedigree`: the interview's "next" control now pulses once all the pedigree checklist items are checked, nudging the participant to finalize. This is a visual cue only and does not block navigation.

- Fix the `FamilyPedigree` layout breaking at larger viewport widths. `useNodeMeasurement` portaled its hidden measurement node into `document.body`, which sits outside the interview `Shell`'s `[data-theme-interview]` region. Network Canvas node sizes derive from `--theme-root-size` (via Tailwind's `--spacing-base`), and the `Shell` ramps that variable with viewport width (1rem → 1.125rem → 1.25rem). The portaled measurement therefore always resolved the base 1rem and under-measured the nodes that actually render larger inside the `Shell`, so `PedigreeLayout` sized its position cells too small and the nodes overflowed/overlapped at `laptop`/`desktop-lg` breakpoints. The measurement element is now rendered inline rather than portaled to `document.body`, so it inherits the same scaled `--theme-root-size` context as the rendered nodes. It stays off-screen via `position: fixed` + `visibility: hidden`, so it still doesn't affect the caller's layout.

## 1.0.0-alpha.21

### Prerelease Changes

- **Public-API removal.** `generateNetwork`, `GenerateNetworkOptions`, `GenerateNetworkResult`, and `StageMetadataSchema` are no longer exported. Import paths change as follows:

  ```diff
  - import { generateNetwork, StageMetadataSchema } from '@codaco/interview';
  + import { generateNetwork } from '@codaco/protocol-utilities';
  + import { StageMetadataSchema } from '@codaco/shared-consts';
  ```

  The synthetic-data code (`generateNetwork`, `SyntheticInterview`, plus shared `ValueGenerator`/types/constants) has moved into the new `@codaco/protocol-utilities` package. The session stage-metadata schemas have moved into `@codaco/shared-consts`. The interview runtime bundle no longer carries either.

- Internal `~/utils/codebook.ts` shim removed (`VariableOption`, `VariableOptionValue`, `VariableOptions` were redefinitions of types now exported from `@codaco/protocol-validation`). All in-tree consumers (`TieStrengthCensus`, `Narrative/ConvexHullLayer`, `Narrative/PresetSwitcher`, `selectors/session`, plus the Narrative test) import from the canonical source.

- Internal `DyadCensusMetadataItem` import redirected from the local session reducer to `@codaco/shared-consts`. Affects `DyadCensus`, `TieStrengthCensus`, and `DyadCensus/helpers`.

- Storybook stories import `SyntheticInterview` from `@codaco/protocol-utilities` (added as a devDependency).

- Dependency cleanup: dropped `zod` from `dependencies` — no source file in the interview runtime imports it directly any more. (Transitive zod usage via `@codaco/protocol-validation` and `@codaco/shared-consts` is unaffected.)

## 1.0.0-alpha.20

### Prerelease Changes

- `Shell`: move `DialogProvider` inside `ThemedRegion` so dialogs opened from stage content (`FamilyPedigree`, etc.) portal into the themed `PortalContainerProvider` instead of escaping to `document.body`. The provider remains nested below the Redux `Provider`, so dialog content can still call `useSelector` without exploding.

## 1.0.0-alpha.19

### Prerelease Changes

- `CategoricalBin`: comprehensive layout overhaul to fix a longstanding cluster of expanded-panel sizing and ragged-row centring bugs.
  - The expanded bin's panel is now rendered as a sibling of `.catbin-inflow` rather than inside it. The panel is `position: absolute` and anchors to `.catbin-circles`; if it sat inside `.catbin-inflow`, the size container on `.catbin-inflow` would have made that element its own containing block and `cqi` would have resolved against the (padding-shrunk) in-flow area instead of the full one.
  - Split the size query container from the grid: `.catbin-inflow` is the in-flow query container, `.catbin-grid` is the actual grid descendant where the `@container catbin` rules match and where `data-count` drives the layout lookup.
  - Drive grid layout entirely from `data-count` + CSS instead of measuring the container in JS. Drop the now-unused `useCircleLayout` hook.
  - Ragged-row centring is now keyed on a `[data-flow-index]` attribute (1-based ordinal among in-flow bins) rather than `:nth-child`, which broke whenever one bin was lifted out of the in-flow sequence to become the expanded panel.
  - Per-bin container for adaptive title + summary, so each bin's text scales to its own measured size.
  - Float `NodeDrawer` so opening/closing the drawer doesn't resize the bin area underneath.
  - Two final bugs: a panel/padding `cqi` mismatch where the same `clamp(20rem, 40cqi, 40rem)` resolved against different ancestor containers and produced a 200px gap, and a re-expand failure where Motion lost its `layoutId` transition because the expanded item had a constant React `key`.
- `AlterForm` / `AlterEdgeForm`: rebuilt around an explicit intro/form state machine with parent-owned intro navigation. Restores the scroll chain inside slides.
- `SlidesForm`: isolate fields from the hidden submit button so `not-last:mb-*` drops the bottom margin on the visually-last field.
- `useBeforeNext`: per-instance keys so multiple consumers in the same stage compose cleanly instead of clobbering each other.
- `synthetic.addVariable`: dedupe by name so callers can't shadow the auto-seeded `"name"` text variable added by `addNodeType`.
- `DataCard` polish and a saner default `basis` (50) on `Roster`.

- Intro-panel surface spacing increased and unified across stages. `Anonymisation`, `Information`, `EgoForm`, `DyadCensus`, `TieStrengthCensus`, `SlidesForm/IntroPanel`, and `NameGeneratorRoster/DataCard` get the new spacing scale. `DyadCensus` and `TieStrengthCensus` drop their local Surface wrappers in favour of the now-shared intro-panel pattern.

## 1.0.0-alpha.18

### Prerelease Changes

- `Narrative/PresetSwitcher` rebuilt on top of the fresco-ui wrappers. Switches from base-ui primitives to `Popover`/`Accordion`/`RadioItem`, adds a drag-handle button driven by `useDragControls`, and treats the popover as a pure toggle — only the trigger opens or closes it. The floating panel now uses `Surface spacing='sm'` with an explicit `shadow-xl` for the elevated/floating look, each accordion section flattens its header into a single `Trigger` that applies `headingVariants()` directly, and unused `presetLabelVariants` / `presetContentVariants` / `prevPresetRef` from the prior `AnimatePresence`-based version are removed.

- `OneToManyDyadCensus` rebuilt around the shared `Panel` + `NodeList` primitives. Replaces the hand-rolled `Surface` + `Heading` + `Collection` stack so the targets list matches the established node-list pattern (header, sizing, animation, DnD-ready). Focal source node renders at size `'md'` and collection items at `'sm'` for clearer visual hierarchy. `Panel` now forwards `className` so consumers can constrain its width. Panel title copy was also clarified.

- `DyadCensus` and `TieStrengthCensus` migrated to listbox semantics. `TieStrengthCensus` replaces `BooleanOption` with `RichSelectGroup` (horizontal listbox); `BooleanOption` is deleted. The two duplicate `Pair` components are consolidated into a single shared component with an optional SR-only `labelId`. Both stages now wire `aria-labelledby` on the response field referencing the pair label plus the `Prompts` id, so screen readers announce "Alice and Bob, [prompt], listbox, [option]" on focus arrival. `Prompts` accepts and forwards an `id` prop for these aria-labelledby targets.

- Markdown rendering fix for intro/explanation bodies. `RenderMarkdown` now receives `ALLOWED_MARKDOWN_SECTION_TAGS` so plain-text content renders inside `<p>` instead of being unwrapped, and `IntroPanel` drops the wrapping `<span>` (which was invalid markup around block content).

- Synthetic data improvements:
  - `addNodeType` now auto-adds a `'name'` text variable to every node type it creates. The existing `getNetwork` attribute-fill path already populates text variables with faker `firstNames` via `ValueGenerator`, and `getNodeLabelAttribute` already prefers a variable named `'name'`, so synthetic nodes now get realistic seed-deterministic labels in stories and tests instead of the `'Person'`-typed fallback.
  - `addStage`'s `initialNodes: number` is now `{ count, promptIndex? }`. The optional `promptIndex` resolves to a real `promptID` at `getNetwork()` time, so panel nodes carry a realistic prior promptID and the existing-panel round-trip works on every demo prompt. All in-tree callers are updated.

- Theme cascade and `Shell` consolidation:
  - Extract a `theme-base` utility (`bg-background`/`text-text`/`publish-colors`/`font-body`) and apply it inside `ThemedRegion` so descendants re-resolve themed values at the themed cascade context; `<body>` uses `theme-base` too.
  - Mount `DndStoreProvider` and the interview `Toast.Provider` inside `Shell`, so hosts no longer need to mount them. Drops the now-unused `InterviewToastViewport` and `interviewToastManager` public exports — consumers that previously imported them can delete those references.
  - `ProgressBar`, `Spinner`, `NodeBin`, and `PassphrasePrompter` switch from `rem` to `var(--theme-root-size)` so sizes scale with the theme's root size at breakpoints.
  - Indirect `--radius` through `--radius-base` so the bare `rounded` utility keeps a `var()` reference and resolves at use-site instead of snapshotting the default-theme radius at `:root`.

- Spacing/container tokens now scale with `--theme-root-size` (via `@codaco/tailwind-config@1.0.0-alpha.17`'s rebased `--spacing-base` and `--container-*`). Consequent component cleanup:
  - `Node`: drop per-breakpoint `size-XX` variants — the themed `--theme-root-size` handles it now.
  - `Collection` layouts now express `gap` in Tailwind spacing units instead of pixels; the layouts' internal pixel math for virtualization rows resolves the same `calc(N * var(--spacing-base, 0.25rem))` expression via a hidden measurement element on the container.
  - Spacing tweaks across `NodeList`, `Panel`, `Prompt`, `FamilyPedigree` placeholder/node, `NameGenerator` `QuickAddField`/`Roster`, and `OneToManyDyadCensus` to fit the new scale.
  - Bundle the `pedigree-context-menu-hint` PNG via Vite import (previously served from `/public`).

- `NodeBin` renders the SVG via `<img src>` rather than `style={{ backgroundImage: url(...) }}` on a child `<div>`. The previous inline `style` attribute was silently dropped by React under a `motion.div` parent, so the bin graphic now renders correctly during drag.

- `ResizableFlexPanel` (and the interview's flex panel callers) only applies `overflow: hidden` during collapse, so content isn't clipped at rest. Mirrors the matching fix in `@codaco/fresco-ui@2.10.0`.

- Storybook/dev fixes:
  - Repair the theme switcher: the `withTheme` decorator now also wraps stories in `ThemedRegion`, so the canvas tab reflects interview theming (regressed when `withTheme` was previously replaced with `persistTheme`).
  - Restore `data-theme-interview` on `document.body` so story padding/chrome/scrollbars render in the themed palette when stories aren't fullscreen.
  - `NameGenerator` quick-add now wires to the real codebook variable id (the synthetic's `"name"` default doesn't match the auto-generated key, which was causing `NETWORK/ADD_NODE/rejected`).
  - Storybook `viteFinal` uses `mergeConfig` and pre-bundles `d3-force` for faster cold starts on the Sociogram-bearing stories.

- Internal: adopt the `~/*` path alias via `tsconfig` paths. TypeScript 6 deprecates `baseUrl`; Vite 8 ships `resolve.tsconfigPaths`. Relative imports deeper than one directory up rewrite to `~/...`; single-up (`../foo`) and same-dir (`./foo`) imports are left untouched. The Vite rollup `external` predicate excludes `~/*` so `preserveModules` resolves the alias to relative paths in the published `dist` (no `~/` specifiers leak to consumers).
