# @codaco/interview

## 1.1.0

### Minor Changes

- 8be592d: Store categorical attribute values consistently as arrays of selected option values.

  Previously the CategoricalBin interface wrote a bare scalar while CheckboxGroup / ToggleButtonGroup wrote arrays, and consumers carried bridging helpers to tolerate both shapes. Categorical attributes are now always arrays (a single selection is a one-element array), and the bridges have been removed:
  - `interview`: `CategoricalBin` writes a single-element array; the node-shape resolver, categorical sorter, and bin matcher read the array contract directly.
  - `network-query`: `EXACTLY` / `NOT` use deep equality and `OPTIONS_*` use array length — the scalar-categorical fallbacks (`categoricalEqual`, scalar `optionsLength`) are gone.
  - `network-exporters`: `isCategoricalOptionSelected` checks array membership only.
  - `shared-consts`: `VariableValue` types categorical as an array of option values.
  - `protocol-validation`: the v7→v8 migration wraps existing scalar categorical filter / skip-logic rule operands (`EXACTLY` / `NOT` / `INCLUDES` / `EXCLUDES`) in a single-element array.
  - `interview` (FamilyPedigree): the `relationshipType` edge variable (a categorical) is now written and read as a single-element array, conforming to the contract so its values export and query correctly.
  - `shared-consts`: adds the canonical `RelationshipType` type and `RELATIONSHIP_TYPE_OPTIONS`, shared between Architect (which locks the categorical edge variable's options) and the FamilyPedigree interface so they cannot drift.

  Collected interview networks holding scalar categorical values must be migrated by the host application (tracked for Fresco).

- 096ad2a: Add a `hideNavigation` prop to `Shell` that renders the interview without the navigation rail/bar, used by screenshot-capture stories.
- e692e79: Stop the interview navigation from flipping orientation when a portrait tablet's
  software keyboard resizes the viewport. The automatic aspect-ratio threshold for
  switching the nav between a side rail (`vertical`) and a bottom bar
  (`horizontal`) is now more generous (`5/4` instead of `3/4`), so a keyboard
  opening on an iPad in portrait no longer pushes the aspect ratio past the
  breakpoint and snaps the nav to the side mid-interview.

  Hosts that know their device context can also bypass the automatic detection
  entirely with the new optional `navigationOrientation` prop on `Shell`
  (`'horizontal' | 'vertical'`, exported as the `NavigationOrientation` type).

- 495eff7: Expose participant-facing interview progress through the step-change contract.

  `@codaco/interview` appends a synthetic `FinishSession` stage to every interview, so the host-controlled `currentStep` indexes a list of length `P + 1`. Hosts that wanted to show progress had to re-derive it and independently account for that appended stage, which drifted from what the participant actually saw (complexdatacollective/Fresco#801).
  - `onStepChange` now receives a second argument, `StepChangeMeta` (`{ progress, totalSteps }`), carrying the 0–100 participant-facing progress and the true total step count (including the finish stage). Existing single-argument handlers remain compatible.
  - A new pure helper `getInterviewProgress(stages, currentStep)` computes the same `{ progress, totalSteps }` from a protocol's stages, for hosts that need progress offline (e.g. synthetic data) without knowing about the appended finish stage.

### Patch Changes

- dd13556: Fix interview-runtime schema-conformance bugs found in a release audit:
  - Look up edge attributes against the edge codebook (not the node codebook) in `updateEdge`, so AlterEdgeForm / TieStrengthCensus answers are no longer silently dropped.
  - Stop negating boolean `additionalAttributes` when a node is removed from a NameGenerator prompt; recompute from the prompts the node still belongs to.
  - Scope a TieStrengthCensus prompt's answered-state to its own `edgeVariable` so a shared edge from a sibling prompt doesn't skip data collection.
  - Read census decline metadata at stage index 0, and prune it when a node is deleted.
  - Auto-advance past a skipped entry stage instead of rendering it.
  - Process bucket/bin sort rules exactly once (fixing numeric/date/ordinal ordering), honour CategoricalBin `binSortOrder`, and fix categorical/zero/false sorting.
  - Coerce number answers to their native type at the form boundary; enforce Anonymisation passphrase length.
  - Inject the computed relationship-to-ego on FamilyPedigree finalize, supply a concrete stage subject for pedigree form validators, and stop duplicating pre-existing nodes/edges on finalize.

  Further interview-runtime fixes from the medium/low conformance audit:
  - DyadCensus: scope each prompt's answered-state per prompt so a sibling prompt sharing the same `createEdge` no longer auto-skips data collection on a later prompt. The shared edge is still reflected (the later prompt pre-selects "Yes" from the network), but the participant must still answer it. Edge creation is idempotent so re-selecting "Yes" cannot append a duplicate edge.
  - TieStrengthCensus: replace the `'__none__'` decline sentinel with a collision-free key so an ordinal option whose value is literally `'__none__'` is recorded as a value rather than treated as a decline.
  - OneToManyDyadCensus: backward navigation across a prompt boundary lands on the destination prompt's last focal node instead of the first.
  - NameGeneratorRoster: honour an initial-sort property of `'*'` (data-file order), keep data-file order when no `sortOrder` is set, apply the full multi-key `sortOrder`, and rank ordinal/categorical sortable properties by codebook option order instead of lexicographically.
  - External data: salt each roster row's primary key with its row index so byte-identical rows stay distinct; carry the asset `source` filename through so media MIME types and the CSV-vs-JSON decision use the real extension rather than the display name; render a visible placeholder for an Information item whose asset is missing or unsupported.
  - OrdinalBin: a node whose stored value matches no option is shown as unplaced instead of silently disappearing, and missing-value styling triggers for a string `'-1'`. CategoricalBin: derive drop-target and motion ids from the option index so duplicate option labels no longer collide.
  - FamilyPedigree: filter the override-path seed by the configured node/edge type so foreign-typed nodes/edges no longer leak into the nomination render.
  - Narrative: out-of-codebook convex-hull group values get distinct colours and legend entries instead of colliding with the first option.
  - NameGenerator NodePanel: render loading/error UI for an external-data panel whose asset fails to resolve, instead of a silently blank panel.

- 382b290: Contain Geospatial map initialisation failures instead of crashing the whole
  stage. `mapbox-gl`'s `Map` constructor throws synchronously when the
  environment can't host a map (most commonly "Failed to initialize WebGL" on
  devices or browsers without working WebGL). That throw previously escaped the
  effect and was caught by `StageErrorBoundary`, taking down the entire stage
  with an opaque reconciler stack. The map creation is now wrapped in a
  `try/catch` that captures the real error and renders a contained fallback
  message, so participants can continue. `StageErrorBoundary`'s copyable debug
  info also now leads with the error name and message — Firefox's `Error.stack`
  omits the message, which was silently dropping the most useful detail from
  bug reports.
- 5af36c5: Fix the navigation bar disappearing off-screen when the browser is resized
  smaller while a Geospatial stage is open. The Mapbox canvas participates in
  layout flow (the package doesn't ship Mapbox's stylesheet), so a stale,
  oversized canvas was forcing the stage wider than the viewport. The map now
  resizes with its container via a `ResizeObserver`, the map container clips its
  overflow, and the stage flex item can shrink horizontally (`min-w-0`).
- 818bbe1: Respect the codebook node shape everywhere nodes are rendered: per-alter and per-alter-edge form headers no longer force a circle, the categorical bin "specify other" dialog, the roster drag preview, and the roster drop overlay now resolve the node shape, and the quick-add toggle previews the shape of the node being created.
- cdc8a2f: Fix `ActionButton` icons rendering off-centre (e.g. the rotate/refresh icons): Lucide SVGs carry intrinsic `width`/`height` attributes, so the old `w-auto` sizing left the browser to back-derive the width inconsistently and could produce a non-square icon box. Lucide icons are now given an explicit square size so any icon centres reliably. Improve the visibility of the "missing" bin on the Ordinal Bin interface, which previously blended into the background; it now uses visible neutral surface tokens.
- d0ca1be: Fix two NameGeneratorRoster bugs and remove a dead schema field.
  - **Roster cards no longer show a raw UID.** When the name heuristic could not
    resolve a label for an external-roster node (e.g. the asset came from a
    preview interview export whose attribute keys are variable UUIDs absent from
    the running codebook, or the subject has no populated text variable), the
    card title fell back to the node's content-hash `_uid` — an opaque "random
    ID". The new `resolveRosterNodeLabel` falls back to the first usable
    attribute value, then to a stable `Unnamed {subject} {n}` placeholder.
  - **DataCards shrink to fit narrow panels.** `GridLayout`'s
    `repeat(auto-fill, minmax(Npx, 1fr))` forced columns to at least `minItemWidth`
    even in a narrower container, so a single roster card overflowed its panel at
    the default resizable width (observed on iPad), breaking drag-and-drop. The
    column floor is now `min(Npx, 100%)` so a lone column shrinks to fit.
  - **The roster panel can't be resized narrower than a card.** `ResizableFlexPanel`
    gains an optional `minSizePx` (a hard pixel floor for the first panel, enforced
    by the resize hook and a CSS backstop). NameGeneratorRoster sets it to the card
    width plus chrome, so the resize handle stops before a card would overflow.
  - **Removed the unused `cardOptions.displayLabel`.** It was introduced in the v8
    schema but was never read by any application (legacy or current) and cannot be
    set in Architect. Dropped from the schema, the `protocol-utilities` types, and
    the `SyntheticInterview` builder.

- 264431c: Sociogram: when automatic layout is paused, adding or removing an edge no longer restarts the layout. It now stays paused until the user resumes it with the toggle.
- Updated dependencies [dd13556]
- Updated dependencies [8be592d]
  - @codaco/network-query@1.1.0

## 1.0.1

### Patch Changes

- 1a6d441: Move `allNodes`, `allEdges`, and `stageMetadata` selector calls before the
  `variableConfig` object in `FamilyPedigree` so hook call order is consistent
  across renders. Also trims the `getStageIndex` JSDoc to its essential
  invariant.

## 1.0.0

First stable release of `@codaco/interview`, the host-pluggable Network Canvas interview engine. This promotes the `1.0.0-alpha` development series to a stable `1.0.0` with no further functional changes; see the `1.0.0-alpha.*` entries below for the detailed history.

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
