# @codaco/interview

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
