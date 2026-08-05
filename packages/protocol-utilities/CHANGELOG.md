# @codaco/protocol-utilities

## 3.1.1

### Patch Changes

- d985cd3: Expose the shared default seed used by `SyntheticInterview` so deterministic fixtures can use the same value explicitly.

## 3.1.0

### Minor Changes

- 59625a8: The defaults a date field falls back on, when a protocol declares no bounds of its own, now live in one place.

  `@codaco/shared-consts` exports `DATE_PICKER_DEFAULT_MIN`,
  `DATE_PICKER_EARLIEST_DATE`, `DATE_PICKER_LATEST_DATE`,
  `RELATIVE_DATE_PICKER_DEFAULT_BEFORE`, and
  `RELATIVE_DATE_PICKER_DEFAULT_AFTER`. `@codaco/fresco-ui` renders its date
  fields from them, `@codaco/interview` derives the bounds a submitted date is
  validated against from them, `@codaco/protocol-validation` models those bounds
  when detecting contradictions, and `@codaco/protocol-utilities` generates
  synthetic dates to fit them. Each package previously kept some local copies and
  tested only those copies, so widening or narrowing a bound in one place could
  leave another package predicting a window that no longer existed. No default
  or limit has changed value, and generated data is unchanged.

  `@codaco/protocol-utilities` additionally exports `todayYmd`, the clock read behind `GenerationConfig.today`'s default.

- 7cffcc9: Synthetic interview data now respects the validation rules configured on your variables.

  Previously, generated networks ignored the rules a protocol author sets in Architect, so previewing a protocol or bulk-generating interviews could produce data a participant could never have entered — names shorter than a required minimum length, numbers outside their permitted range, dates outside a date picker's window, duplicate values on a variable marked unique, or a "start date" later than the "end date" it is required to precede. Generated values now satisfy required, minimum/maximum length, minimum/maximum value, minimum/maximum selected, unique, same as, different from, and the greater/less than (or equal to) cross-variable comparisons, as well as the bounds a date picker or relative date picker imposes.

  Where rules refer to one another, generation follows that order, so a variable compared against another is filled in after the variable it depends on.

  If a protocol's rules cannot all be satisfied at once — for example a minimum length greater than its maximum length, a permitted range with no values in it, or a variable required to be both unique and drawn from fewer options than there are entities to fill — generation is now refused with a `SyntheticDataConstraintError` that names the variable and describes the conflict, instead of silently producing data that could never be collected. `SyntheticDataConstraintError` and the `ConstraintConflict` type it carries are exported from `@codaco/protocol-utilities`.

  When skip logic and filtering are respected, controls on stages proven unreachable no longer create synthetic-data rendering conflicts with reachable Network Composer stages.

  Read-only stage references no longer make validation rules apply to values written only by binning stages. Writers on stages proven unreachable by skip logic are likewise ignored consistently by both the feasibility check and the synthetic draw.

  Manually seeded nodes and edges keep omitted Boolean attributes at the neutral
  `false` value regardless of how the control's options are ordered.

  When multiple reachable Network Composer stages render one date variable at the
  same resolution, generation now uses the intersection of their accepted
  windows. It refuses only controls at incompatible resolutions or controls whose
  windows do not overlap. When an ordinary form also renders that variable,
  generation includes its codebook control in the same intersection.

  Categorical Bin "other" inputs must now target a text variable, matching the
  text field the interview renders. Importing a version 7 protocol removes an
  incompatible non-text "other" configuration instead of preserving a control
  that cannot record the target variable's value.

  `@codaco/fresco-ui` adds a `./form/validation/helpers` export subpath so consumers can build the same validator stack the interview uses. `@codaco/interview` now fails loudly, naming the variable, when a protocol carries a validation rule of the wrong type, rather than passing it to a validator that would report a generic error.

- 3548c35: `SyntheticInterview.getNetwork()` now answers the ego's variables instead of leaving them blank.

  The ego previously came back with no attributes at all, whatever its codebook declared. An ego form built from synthetic data therefore rendered empty every time, a required ego variable arrived unanswered, and rules written between ego variables — same as, different from, and the greater/less than (or equal to) comparisons — were ignored entirely.

  Ego attributes are now drawn through the same solver the nodes and edges already used, so they satisfy the rules its codebook declares and a protocol whose ego rules cannot all be met at once is refused with the same `SyntheticDataConstraintError`. Ego is drawn after the nodes and edges, so adding an ego variable to an existing fixture does not disturb the values its nodes and edges were already given.

### Patch Changes

- 1a3fe60: Improve node entry and display across interview interfaces. Synthetic `name`
  variables now use realistic personal names whenever their validation rules
  allow it, long labels wrap and truncate without distorting node shapes, and
  Network Composer quick add retains focus after submitting a node. Shared modal,
  form-field, and theme refinements support the updated Architect editing
  experience.
- efc3a92: A relative date question anchored near either end of the calendar no longer refuses every date it offers.

  A relative date question works out the dates it accepts by counting days forward and back from an anchor. With an anchor late in the calendar that count could pass the year 9999 — an anchor of 9999-12-31 accepting one day after it worked out a latest date of 10000-01-01 — and with an early anchor it could pass year zero, working out 0000-07-05 or, further back, something that was not a date at all. Neither is a date the software recognises, so the check on what a participant entered stopped comparing dates and compared plain text instead, where a five-digit year sorts before every four-digit one. Every date the question could offer was then rejected as too late, including the one the participant had just chosen. Both ends of the window now stop at the first and last dates a date field can hold.

  `@codaco/shared-consts` exports `dateWithinPickerRange`, `DATE_PICKER_EARLIEST_DATE` and `DATE_PICKER_LATEST_DATE`. The field in `@codaco/fresco-ui`, the submission checks in `@codaco/interview` and the synthetic dates drawn by `@codaco/protocol-utilities` all work the window out from that one function, so the three cannot disagree about it. Questions anchored anywhere else are unaffected, and generated data for them is unchanged.

- 5d91508: Synthetic networks no longer contain duplicate edges of one type between one
  pair. `generateNetwork` now looks a pair up before drawing an edge for it and
  reuses the one already there, the way the interview does — so two prompts, two
  censuses, or a census and a sociogram all asking about the same people leave a
  single edge behind rather than one apiece. A reused pair is recorded as an
  answered "yes" rather than as a negative response, and a tie strength census
  writes its ordinal value onto the existing edge instead of adding another.
  Family pedigree edges keep their own rule: several edges of one type between one
  pair are meaningful there, so a pedigree still draws each parent-child link
  without looking for an existing one.

  Because fewer edges are drawn, the feasibility check for `unique` edge variables
  now counts one set of pairs per subject node type instead of one per prompt, so
  protocols it previously refused for needing more distinct values than the draw
  actually spends are accepted. Seeded output for any protocol whose stages share
  an edge type changes.

- 63cd3ca: Synthetic family pedigree edges now record a relationship. Every parent-child
  edge `generateNetwork` builds carries the relationship type and active flag its
  stage's `edgeConfig` names — `biological` and `true`, which is what the
  interview writes on every parent-child edge it commits and what every reader
  already assumes when the values are missing. Previously those edges were created
  with no attributes at all, so anything reading synthetic pedigree data saw a
  relationship the protocol had no value for.

  The two gamete-side variables (`isGestationalCarrier`, `gameteRole`) stay
  unwritten: they record which parent supplied which gamete and who carried the
  pregnancy, and a pedigree without those features carries no such value in a real
  interview either.

  The values are written rather than drawn, so a seeded run produces the same
  people, the same parentage and the same values as before — the new attributes
  are all that is added. Feasibility counts them like any other written value, so
  a `unique` rule on one of those two variables is now measured against the edges
  that really hold it.

- Updated dependencies [b777dc1]
- Updated dependencies [59625a8]
- Updated dependencies [b777dc1]
- Updated dependencies [8b660f5]
- Updated dependencies [efc3a92]
- Updated dependencies [7cffcc9]
  - @codaco/protocol-validation@12.1.0
  - @codaco/shared-consts@5.6.0

## 3.0.1

### Patch Changes

- Updated dependencies [9c25292]
- Updated dependencies [c8c4614]
  - @codaco/protocol-validation@12.0.0
  - @codaco/network-query@1.2.3

## 3.0.0

### Major Changes

- c2a8700: `generateNetwork` now takes a single parameter object — call
  `generateNetwork({ codebook, stages, ...options })` instead of passing the
  codebook and stages as positional arguments. This is a breaking change.

  It can also build name generator stages from real roster data. Pass parsed
  roster nodes via the new `externalData` option, keyed by stage id, and roster
  and roster-panel stages draw their people from those rows — preserving each
  row's primary key and attributes — instead of inventing people from the
  codebook. Draws are without replacement across prompts and stages, mirroring the
  runtime's global exclusion of rows already in the network. A stage with no entry
  still falls back to codebook-generated people. A roster that loads but contains
  no rows — or whose panel filters out every row — now generates an empty roster
  stage instead of inventing people, matching a live interview that would offer
  nobody to add; only a missing or unreadable roster falls back to fabrication. A new `config` option exposes the
  generation-tuning defaults (the roster-versus-fabricate ratio, node counts, edge
  probabilities, and so on) so callers can override them. FamilyPedigree stages
  now mark exactly one generated node as ego, matching the runtime convention,
  instead of randomising the ego flag across every node.

  `@codaco/interview` now exposes its roster-parsing pipeline from the `./contract`
  entry: `collectRosterExternalData` gathers a protocol's roster nodes keyed by
  stage, and `parseExternalNetworkAsset` and `filterExternalPanelNodes` parse and
  filter individual roster assets. This is the exact code the interview runtime
  uses, so a host reads roster assets identically to a live interview.

  `@codaco/protocol-validation` now exports a `StructuralCodebook` type for
  consumers that assemble or receive a codebook before schema validation.

  Roster rows parsed by `@codaco/interview` are now identified as
  `subjectType_contentHash` instead of a bare content hash. A roster file that
  backs more than one node type (say, a shared address book used by both a
  person stage and a place stage) previously produced the same primary key for
  matching rows under each type, an invariant violation once both ended up in
  the same network. This is a breaking change: sessions saved by earlier
  versions will not re-associate their roster people after upgrading.

### Patch Changes

- Updated dependencies [47dda6b]
- Updated dependencies [c2a8700]
  - @codaco/protocol-validation@11.12.0

## 2.2.2

### Patch Changes

- 98a31e7: Widen the internal `@codaco/*` dependency ranges from exact pins to caret ranges. When you install several Network Canvas packages together, npm and pnpm can now resolve a single shared version of each common dependency instead of being forced to keep multiple exact-pinned copies side by side.
- Updated dependencies [c7e767c]
- Updated dependencies [98a31e7]
  - @codaco/protocol-validation@11.11.0
  - @codaco/network-query@1.2.2

## 2.2.1

### Patch Changes

- 34d2bfd: Align schema 8 with the fields Architect has always required, so a protocol
  that validates is a protocol that renders correctly:

  - Information stages require a `title` (the page heading).
  - Name Generator forms require a `title` (the add-a-person dialog heading).
  - Sociogram and NetworkComposer stages require a `background`, which must be
    exactly one of an image or a concentric-circles count (zero or more; 0
    renders no rings). Narrative stages require a concentric-circles `background`
    (it has no image variant).
  - OrdinalBin prompts require a palette `color`.
  - CategoricalBin prompts with an "other" option require both the bin label and
    the follow-up prompt; a lone empty-string `otherVariable`, or an "other"
    label/prompt set to an empty string without one, is now rejected too.
  - A Sociogram prompt with highlighting enabled must name the variable to
    toggle, and an `edges` object must set `create` and/or `display`.
  - A codebook variable referenced by a form field must define a `component`
    (input control) — previously a missing one crashed the interview when the
    form rendered.
  - Free-text fields the editor already requires are now required (non-empty) in
    the schema too: a prompt's `text`, a form field's `prompt`, an introduction
    panel's `title`/`text`, an Information item's `content`, a Narrative preset's
    `label`, a side panel's `title`, a FamilyPedigree `censusPrompt`, an
    Anonymisation `explanationText`, a NarrativePedigree disease's `label`/`color`,
    and a NameGeneratorRoster `dataSource` and `searchOptions.matchProperties`.

  The conditional rules are also encoded in the inferred TypeScript types: the
  background is a two-variant union (image or circles), and checking a Sociogram
  prompt's `highlight.allowHighlighting` or a CategoricalBin prompt's
  `otherVariable` narrows the dependent fields to present, so consumers need no
  runtime fallbacks or non-null assertions.

  Protocols migrating from schema 7 are backfilled with the value the interview
  already displayed (stage label or "Information", "Add {node type}", 4 rings,
  the first palette color, "Other"/"Please specify"); empty required text is
  backfilled from a natural source where one exists (a form field's prompt from
  its variable name, a panel title from the stage label) or a plain default
  otherwise, so migrated interviews look identical. Synthetic interviews seed the
  default background for canvas stages.

- Updated dependencies [34d2bfd]
  - @codaco/protocol-validation@11.10.0
  - @codaco/network-query@1.2.1

## 2.2.0

### Minor Changes

- b467615: Add forward skip destinations to schema 8, shared skip evaluation, synthetic
  network generation, and the interview runtime. Hidden stages can now continue
  at a later stage or route to the interview finish screen, with live route
  recalculation, safe Back navigation, and confirmed one-screen overrides for
  unavailable stages.

  Also keep shared Select fields correctly labelled and contained when option
  labels are long. The bundled sample protocol now ends the interview when a
  participant declines consent.

### Patch Changes

- 486f928: Extend the `SyntheticInterview` builder for the interview e2e configuration
  matrix: stage inputs now accept `interviewScript`, `skipLogic`, `filter`, and
  `validation`; prompt inputs accept `additionalAttributes` and `sortOrder`; and
  variable inputs accept `encrypted` and `parameters`. Consolidate stage
  assembly so the builder emits schema-valid output directly — form fields no
  longer carry a stray `component` (the codebook variable supplies it), EgoForm
  joins AlterForm/AlterEdgeForm in stripping the form `title`, and FamilyPedigree
  no longer emits a top-level `subject`. `quickAdd` defaults now resolve to the
  seeded name variable's id rather than its display name.
- c36f3a5: Support the skipLogic `destination` field (targeted skip-to-stage / skip-to-finish) on `SkipLogicInput`, so synthetic protocols built with `SyntheticInterview` can exercise targeted skip routing.
- Updated dependencies [367e702]
- Updated dependencies [e6c58c2]
- Updated dependencies [c16a1d9]
- Updated dependencies [803e4e7]
- Updated dependencies [179952e]
- Updated dependencies [b467615]
  - @codaco/protocol-validation@11.9.0
  - @codaco/shared-consts@5.5.0
  - @codaco/network-query@1.2.0

## 2.1.1

### Patch Changes

- 272c1b2: Harden protocol validation and synthetic-network generation.

  `@codaco/protocol-validation`: asset `source` is now constrained to a safe
  filename (no path separators or `..`), so a malformed protocol can no longer
  carry a path-traversal entry name into an exported archive. `NameGeneratorRoster`
  now reuses the shared name-generator node-count bounds (`minNodes`/`maxNodes`
  lower bounds and the `maxNodes >= minNodes` check) instead of accepting
  unbounded values. Codebook variables gain an optional `readOnly` flag for
  system-managed variables, and a protocol-level check validates that Family
  Pedigree's locked value sets keep their canonical options. A new
  `extractProtocolFromZip` export lets a caller that has already parsed a
  `.netcanvas` archive extract from it without re-parsing.

  `@codaco/protocol-utilities`: `generateNetwork` clamps the requested node range
  so an inflated `minNodes` with no `maxNodes` can no longer produce an inverted
  range (previously this threw and left synthetic preview loading forever).

- Updated dependencies [272c1b2]
  - @codaco/protocol-validation@11.8.1
  - @codaco/network-query@1.1.2

## 2.1.0

### Minor Changes

- 37006d0: Refine the Architect stage editors for the Family Pedigree and Narrative Pedigree interfaces.

  **Family Pedigree editor**

  - The fixed-framing selector is now a styled select, and the framing section explains what the gamete-based and gendered framings mean in neutral, non-normative terms.
  - Boundary options no longer use "family tree" (always "family pedigree"), explain what off/recommended/required do, and rename "Require Children Contributors" to "Require Co-Parents' Families". Both boundary fields are now required in the editor so a missing value surfaces as a named issue rather than a raw schema error.
  - Fixed a bug where changing the node type cleared the stage-level `framing`, `boundaries`, and `introScreen`, producing a schema error on finish. A seam test now guards the preserve-list against the schema's required fields.
  - The intro screen is now built on the Information content-item model — reorderable text and asset sections instead of a single title/text/video block. The `introScreen` schema field changes from `{ title?, text, videoAssetId? }` to `{ items }`, and the Information item renderer is extracted to a shared `ContentItem` component reused by the pedigree intro step. The intro-screen title field is removed.
  - Node and edge configuration panels split their columns evenly (50% variable column), give variable pills a white background, and edge-type items render on a darker surface to stand out from the panel. Edge configuration explains why the interface needs an edge type, and the gamete-role variable now uses predefined read-only egg/sperm options (shared via `GAMETE_ROLE_OPTIONS` in `@codaco/shared-consts`) in the same way as relationship type.
  - Nomination prompts show an empty-state message when no prompts exist yet.

  **Narrative Pedigree editor**

  - Corrected the new-stage dialog tags: Narrative Pedigree (read-only) is tagged Display Data only; Family Pedigree gains Capture Edge Attributes.
  - The At-Risk Statuses explanation moves from the section side column into the main column and is formatted with subheadings and lists.

- fd2a7e2: Family Pedigree redesign (three features):
  - **Configurable FamilyPedigree framing** — swappable parent terminology (gamete-based "Egg/Sperm Parent" vs gendered "Mother/Father"), either researcher-fixed or participant-chosen; an optional video+text intro step; and two author-set boundary rules (require grandparents; require children's genetic contributors). Persists `gameteRole` as a network edge variable and captures biological sex for non-parent people.
  - **Interface fixes** — "Add sibling" is now always discoverable (rendered disabled with an inline hint when it cannot apply, keeping the shared-parent rule), plus first-cousin representation/creation demonstration stories.
  - **Narrative Pedigree** — a new read-only interface that renders a captured pedigree, computes faithful Mendelian carrier/at-risk status per disease (autosomal dominant/recessive, X-linked recessive/dominant, Y-linked, mitochondrial, multifactorial), highlights a focal node's affected genetic lineage under participant-switchable presets, renders status as edge stickers or classic pedigree notation, and exports a PNG snapshot.

### Patch Changes

- a171f96: Unify the Sociogram and Narrative stage behaviours into a single shared schema, and flatten the `automaticLayout` behaviour to a plain boolean (was `{ enabled }`). The Narrative interface gains a configurable `automaticLayout` behaviour (a force-directed layout that positions nodes). It is only active when explicitly enabled, so existing protocols keep their hand-authored static layouts; new Narrative stages created in Architect enable it by default. The v7→v8 migration flattens any existing Sociogram `automaticLayout` value.
- 0f577dd: Add the **Network Composer** stage type — a free-form, single-screen, promptless
  canvas for building a whole personal network in one place (create nodes, draw
  multiple edge types, capture node and edge attributes, group nodes into convex
  hulls, reposition, and delete, with undo/redo and lasso selection).

  - `@codaco/protocol-validation`: a new additive schema-8 `NetworkComposer` stage
    (no version bump, no migration) with cross-reference validation of its
    `quickAdd` / `layoutVariable` / `nodeForm` / per-edge-type form references, and
    a `superRefine` check rejecting duplicate edge subject types (edge types and
    node attributes are both optional). Automatic layout uses the shared flat
    `behaviours.automaticLayout` boolean (as the Sociogram and Narrative do); for
    NetworkComposer it is only the starting default. An optional
    `convexHullVariable` names a single categorical node variable whose values are
    drawn as convex-hull groups.
  - `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the shared
    canvas, edge layer, and force-directed auto-layout engine. Nodes are added by
    name from a field in the tool palette and laid out on a grid; in edge mode the
    first node tapped enters a linking state and the edge tool adopts that edge
    type's colour. Selecting a node or edge opens a resizable, backdrop-less
    right-hand drawer that leaves the canvas interactive; it edits the entity's
    attribute form (saving valid edits automatically, with no Save button) or shows
    an empty state when there is nothing to edit. When a `convexHullVariable` is
    configured its hulls are always drawn (reusing the Narrative hull layer), and
    group membership feeds the layout's group-cohesion force so same-group nodes
    cluster under automatic layout. Nodes are grouped with the Groups tool (pick a
    group in its popover, tap nodes to toggle membership) or by lasso-selecting in
    select mode and choosing which group to add the selection to. Automatic layout
    is an interview-time toggle whose live value is persisted in stage metadata, so
    the participant's choice sticks across navigation; Architect only sets its
    default.
  - `@codaco/shared-consts`: a `NetworkComposer` stage-metadata shape storing the
    participant's automatic-layout choice.
  - `@codaco/fresco-ui`: the `SegmentedToolbar` gains a `menu` segment (a button
    that opens a single-select menu) and a `popover` segment (a pressed-able button
    that anchors arbitrary popover content), and a vertical toolbar now opens its
    tooltips, menus, and popovers to the right (into the canvas); `Popover` accepts
    a `side` prop.
  - `@codaco/interview`: the NetworkComposer tool palette is built from the shared
    `SegmentedToolbar` — a Select tool, an Add-node button whose popover holds the
    name field, an edge tool that opens a menu of edge types, an automatic-layout
    toggle, and undo/redo.

- 9e603c5: Source `StageType` from `@codaco/protocol-validation` (the schema's canonical,
  `z.infer`-derived union) instead of a hand-maintained copy, which had already
  drifted from the schema. The duplicated union — previously re-exported
  incidentally via the package barrel — is removed; import `StageType` from
  `@codaco/protocol-validation` instead.
- Updated dependencies [38aff29]
- Updated dependencies [37006d0]
- Updated dependencies [fd2a7e2]
- Updated dependencies [a171f96]
- Updated dependencies [3218905]
- Updated dependencies [0f577dd]
- Updated dependencies [7970d1f]
- Updated dependencies [c56b75a]
  - @codaco/protocol-validation@11.8.0
  - @codaco/shared-consts@5.4.0
  - @codaco/network-query@1.1.1

## 2.0.0

### Major Changes

- 6420d8b: **Breaking:** `generateNetwork` no longer takes `seed` as a positional argument. It is now part of the options object, so callers no longer need to pass `undefined` to reach the other options:

  ```ts
  // Before
  generateNetwork(codebook, stages, 42, { simulateDropOut: true });
  generateNetwork(codebook, stages, undefined, { simulateDropOut: true });

  // After
  generateNetwork(codebook, stages, { seed: 42, simulateDropOut: true });
  generateNetwork(codebook, stages, { simulateDropOut: true });
  ```

### Minor Changes

- c8978ce: Add an `inProgressStageIndex` option to `generateNetwork` that treats one stage as in progress rather than complete. For interaction-driven stages (OrdinalBin, CategoricalBin, Sociogram) a subset of subject nodes is left without a value for the stage's prompt variables, so previews of those stages still have unplaced nodes to interact with. Architect's preview passes the previewed stage index, leaving all other stages fully populated.

### Patch Changes

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

- Updated dependencies [dd13556]
- Updated dependencies [dd13556]
- Updated dependencies [8be592d]
- Updated dependencies [545edda]
- Updated dependencies [d0ca1be]
  - @codaco/network-query@1.1.0
  - @codaco/protocol-validation@11.7.0
  - @codaco/shared-consts@5.3.0

## 1.0.0

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

## 1.0.0-alpha.0

### Minor Changes

- Initial alpha release. Provides two exports extracted from `@codaco/interview`:
  - `generateNetwork(codebook, stages, seed?, options?)` — pure function that produces an `NcNetwork` (plus per-stage metadata and step state) from a protocol codebook and stages array. Used by `@codaco/architect-web`'s preview host to populate previews and by tests that need a deterministic network shape.
  - `SyntheticInterview` — fluent builder for codebooks, stages, prompts, forms, and full interview payloads. Previously internal to `@codaco/interview`; now public so consumers can construct synthetic interview payloads outside the engine package (e.g., Storybook stories).
- Both share a `@faker-js/faker`-backed value generator for deterministic, seedable value synthesis.
- Peer/runtime dependencies: `@codaco/network-query`, `@codaco/protocol-validation`, `@codaco/shared-consts`, `@faker-js/faker`, `es-toolkit`, `uuid`, `zod`.
