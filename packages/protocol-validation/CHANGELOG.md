# @codaco/protocol-validation

## 11.8.0

### Minor Changes

- 38aff29: Add `collectEntityTypeReferences`: every codebook node/edge type referenced by
  a protocol, discovered from schema-level `entityTypeReference` tags — the
  entity-type counterpart of `collectEntityAttributeReferences`. Covers stage
  subjects (including the Network Composer's per-edge-type entries), edge
  creation/display prompt settings, the Family Pedigree node/edge configs, and
  filter rules. Architect's codebook usage detection now derives node/edge type
  usage from this instead of hand-maintained path lists, so new stage types are
  covered automatically — and types referenced only by filters now correctly
  count as in use.
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

- a171f96: Unify the Sociogram and Narrative stage behaviours into a single shared schema, and flatten the `automaticLayout` behaviour to a plain boolean (was `{ enabled }`). The Narrative interface gains a configurable `automaticLayout` behaviour (a force-directed layout that positions nodes). It is only active when explicitly enabled, so existing protocols keep their hand-authored static layouts; new Narrative stages created in Architect enable it by default. The v7→v8 migration flattens any existing Sociogram `automaticLayout` value.
- 3218905: Rework the Network Composer editor: consolidated Node Configuration section, multi-select Edge Configuration with per-edge-type attribute lists, and editable attributes whose input control is configured on the stage (and rendered in the side panel) rather than the codebook variable. Each editable attribute also carries an optional `label` that captions the field in the side panel, falling back to the variable's name when unset.
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

- 7970d1f: Refine the Family Pedigree and Narrative Pedigree interfaces.

  **Narrative Pedigree** defaults to a plain pedigree with no status markers. The key panel lists the conditions and explains what each status symbol means; selecting a condition from that list switches to a single-condition view, drawn in that condition's colour in standard pedigree notation. Any person can be made the focal point once a condition is shown: the pedigree then keeps the relatives who contribute to that person's inheritance at full strength and fades everyone else by blending them toward the background, with a "Clear focus" control to return to the whole family. The fixed preset/behaviour configuration is removed from the stage (schema 8). The snapshot control (a camera action) produces a printable document — the whole pedigree at natural size on a white background with dark labels, a heading generated from the shown condition and any focal person, and the symbol key.

  Narrative Pedigree also gains a researcher option, **"Show possible (at-risk) statuses"**, which defaults to off. When off, the pedigree shows only certain statuses; the inferred at-risk markers (may develop / may carry / may be affected, including the more-seriously-affected homozygous marker) are hidden from the people, the key panel, and the screen-reader summary. When on, those markers are drawn. The genetics engine is unchanged — this is a display gate intended for clinician-directed use.

  **Family Pedigree** intro is simplified: the language selector now uses the standard rich option group with plain-language wording ("Mother & father" listed first), and the separate "biological parents" explainer step is folded into the editable Information step (pre-filled in Architect, so researchers can reword it, remove it, or add a video). The in-wizard intro screen renders its explanation as markdown, with any headings kept beneath the dialog's own heading level. When the framing is a participant choice made partway through the quick-start wizard, the choice is now reflected in the following step titles (e.g. "Mother"/"Father"), not just their body text.

  Both pedigree interfaces now render only the alters placed on the pedigree. The interview network is one shared graph, so an alter nominated in a later stage can share the pedigree's node type; the views scope themselves to the pedigree's committed private membership (its stage metadata) and fall back to node type only when no membership has been recorded.

  **Biological sex** is now asked consistently and sensitively wherever a person is added, through one shared field: "What sex was this person recorded as at birth?" (or "…were you…" for the participant), with a one-time explanation that it is for inheritance, not gender identity, and a required answer whose options are Female, Male, Intersex or a variation in sex characteristics, Don't know, and Prefer not to say. The participant's **own** biological sex is now captured (an "About you" step) — previously it was never asked, so the participant dropped out of their own sex-linked risk. The genetics engine drives transmission from Female/Male only; the other values propagate as uncertainty but are stored distinctly. When adding a child, the "who provided the egg/sperm" questions now read in the chosen framing (e.g. "Who is the biological mother/father?" under the mother/father framing), and the two contributors are pre-selected from the parents' biological sex where it can be inferred (with same-sex couples prompting for the donor/carrier), always overridable.

  Biological sex is now stored as a node attribute on **every** pedigree member, so it is a first-class part of the interview network and a researcher can drive node shape from it (or leave shape free for a construct such as gender identity). People who are not asked directly are inferred from their reproductive role — an egg provider is recorded female, a sperm provider male, a gestational carrier female — falling back to Don't know. In Architect, the biological-sex variable is created pre-seeded with the canonical value set, locked so it cannot drift from what the interview and engine expect.

  The Narrative Pedigree genetics changes (inheritance-aware focal highlighting) require research-team sign-off before merge.

- c56b75a: Stage labels are now required to be non-empty. The schema-8 stage `label` is
  validated as a required, non-empty string, and the v7→v8 migration backfills any
  stage with a missing, empty, or whitespace-only label with a positional default
  ("Stage 1", "Stage 2", …) so existing protocols upgrade cleanly.

### Patch Changes

- Updated dependencies [37006d0]
- Updated dependencies [fd2a7e2]
- Updated dependencies [0f577dd]
  - @codaco/shared-consts@5.4.0

## 11.7.0

### Minor Changes

- dd13556: Tighten the protocol schema and add migrations to fix conformance gaps found in a release audit of the interview module:
  - Reject form fields that reference a variable with no renderable `component` (or a `layout`/`location` variable).
  - Validate that a NameGeneratorQuickAdd `quickAdd` references an existing text variable on the subject node type.
  - Require `otherOptionLabel` when a CategoricalBin prompt sets `otherVariable`.
  - Add prompt/parameter validation: `highlight.variable` must be boolean, `layout.layoutVariable` must be a layout variable, RelativeDatePicker `before`/`after` must be non-negative with an ISO `anchor` (they are independent opposite-direction offsets — earliest = anchor − before, latest = anchor + after — so there is no `before < after` constraint), non-empty ordinal/Likert options, and external-data panel rule targets.
  - Remove the vestigial Information `loop` flag, with a migration dropping it from existing protocols.
  - A `minValue`, `minLength`, or `minSelected` validator no longer implies a field is required. A migration sets `required: true` on every existing codebook variable (node, edge, or ego) that has one of these validators without an explicit `required: true`, preserving the effective behaviour of protocols authored before the change.

  Further schema tightening and migrations from the medium/low conformance audit:
  - Variables: ordinal/categorical option lists require at least two options and may no longer use boolean values (a migration coerces legacy boolean values to strings); ordinal variables no longer accept `minSelected`/`maxSelected`; `encrypted` is permitted only on node text variables (rejected on other node types and on all ego/edge variables); ego variables may not declare `unique` validation. Migrations strip the now-invalid properties from existing protocols.
  - Forms: Alter/AlterEdge/NameGenerator forms require at least one field; the unused `form.title` on EgoForm/AlterForm/AlterEdgeForm is dropped by migration.
  - Filters & skip-logic: empty `rules` arrays are rejected (and dropped by migration); operator-by-type / value-type validation now also runs on `skipLogic.filter` and `panels[].filter`; ego rules are rejected inside a stage node/edge filter; attribute-less ego type-level rules are rejected.
  - Stages: OrdinalBin/CategoricalBin prompt variables must be of the matching type; NameGeneratorRoster `dataSource` must reference a `network` asset; Geospatial `tokenAssetId`/`dataSourceAssetId` must resolve to correctly-typed assets, its prompt variable must be `location`, and `targetFeatureProperty` / apikey value must be non-empty; CategoricalBin requires `otherVariablePrompt` when `otherVariable` is set (backfilled by migration); a contradictory NameGenerator min/max-nodes `behaviours` block is normalised by migration; a Sociogram prompt may not set both `edges.create` and `highlight` (migration drops highlight); Information `size` is restricted to an uppercase enum applied to image/video items only (migrated); FamilyPedigree nomination prompts may not reuse the reserved `scaffolding` id or duplicate prompt ids.
  - Codebook: variable record-keys must be unique across entity types.

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

- 545edda: Make the v8 schema the single source of truth for entity-attribute (codebook variable) references.

  Fields that hold the id of a codebook variable are now tagged at their schema definition with `entityAttributeReference({ subject, requireType? })`, which brands the field type and records how to resolve the variable's subject. A new `collectEntityAttributeReferences(protocol)` walker derives every reference — with its resolved subject and any required type — directly from the tagged schema, and `validateProtocol` uses it to check that each referenced variable exists on its subject and is of an allowed type. This replaces the hand-placed existence checks that were duplicated across `superRefine`, removing the drift that previously let a variable referenced only by certain validation rules be reported as unused (and invalid references slip through). The walker tolerates structurally-invalid stages/filter rules so references inside in-progress protocols are still detected.

  New public exports: `collectEntityAttributeReferences`, `asEntityAttributeReference` (the brand-boundary constructor for building branded reference values), and the `EntityAttributeReferenceHit` type.

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

- Updated dependencies [8be592d]
  - @codaco/shared-consts@5.3.0

## 11.6.1

### Patch Changes

- Add `hashProtocol(protocol)` export — content-only hash of `{ codebook, stages }` for cross-package protocol identification (dedup, analytics, migration). Computed via ohash.

## 11.6.0

### Minor Changes

- Add `VariableOption` and `VariableOptionValue` exports, derived from the existing `VariableOptions` (`z.infer<typeof categoricalOptionsSchema>`):

  ```ts
  export type VariableOption = VariableOptions[number];
  export type VariableOptionValue = VariableOption['value'];
  ```

  Consumers that previously hand-rolled equivalent shims (`@codaco/interview`'s `utils/codebook.ts`, `@codaco/protocol-utilities`'s `types.ts`) should import from here instead. Both shims have been deleted in their respective packages' next releases.

## 11.5.0

### Minor Changes

- Add `hashProtocol(protocol)` export — content-only hash of `{ codebook, stages }` for cross-package protocol identification (dedup, analytics, migration). Computed via `ohash`.

## 11.4.0

### Minor Changes

- f1dbd8d: Add node shape support with variable-to-shape mapping. NodeDefinition now includes a required `shape` field with a default shape (circle, square, or diamond) and optional dynamic mapping that maps variable values to shapes. Supports discrete mappings for categorical/ordinal/boolean variables and breakpoint mappings for number/scalar variables. Renames `iconVariant` to `icon` on node definitions.

## 11.2.0

### Minor Changes

- b8b9fb0: Add legacy protocol migration support for schema versions 1 through 7. The package can now migrate protocols from any schema version (1-8) to the current version 8. This includes the v3→v4 name sanitization migration and the v5→v6 NameGenerator type consolidation, along with no-op version bumps for intermediate versions.

## 11.1.1

### Patch Changes

- 4f2d778: Export sort rule schema from filters module

## 11.1.0

### Minor Changes

- 273bcbe: Add optional showTransit and allowSearch configuration options to geospatial interface mapOptions:
  - showTransit: When enabled, Fresco displays transit layers on the map
  - allowSearch: When enabled, participants can search the map for locations

  Both options default to false (disabled).

## 11.0.0

### Major Changes

- 8f91391: Remove `introductionPanel` from Geospatial interface schema.

  This is a breaking change for existing protocols that include an `introductionPanel` on Geospatial stages. Protocols with Geospatial interfaces no longer support or require an introduction panel.

## 10.1.0

### Minor Changes

- b713317: Add greaterThanOrEqualToVariable and lessThanOrEqualToVariable validations for number, datetime, and scalar variable types

## 10.0.0

### Major Changes

- 01448c8: Split Family Tree sexVariable into egoSexVariable and nodeSexVariable.

  This is a breaking change for existing protocols that reference the old sexVariable field. Protocols with Farmily Tree interfaces require that the egoSexVariable and nodeSexVariable be defined separately.

## 9.0.0

### Major Changes

- cc2adc3: Add required `name` property to protocol schema (breaking change)

  **Schema changes:**
  - Protocol schema now requires a `name` property (`string`, min 1 character)

  **Migration changes (v7 → v8):**
  - Migration now requires a `name` dependency to be provided when migrating from v7

## 8.0.2

### Patch Changes

- 9958b67: Fix type inference in zod-mock-extension generateMock function
  - Fixed `base` parameter type inference in `generateMock()` callbacks by using `z.output<this>` instead of explicit type parameters
  - Added excess property checking for object schemas to catch extra properties at compile time
  - The `ExactReturn` type utility now correctly handles unions, primitives, arrays, and Record types without false positives

## 8.0.1

### Patch Changes

- 84d09e3: Implement validation of variable ID uniqueness across entities. Replaces broken implementation.

## 8.0.0

### Major Changes

- edc9dcb: added relationship to ego variables to edges for family tree census #315

## 7.2.0

### Minor Changes

- 26ae10b: Add comprehensive migration tests and wildcard support for schema transformations
  - Add comprehensive test suite for v7 to v8 migration covering all transformations (displayVariable removal, Toggle options removal, filter type transformations, schema version updates)
  - Extend traverseAndTransform utility to support wildcard (\*) syntax in transformation paths
  - Add 9 new tests for wildcard functionality including nested paths, multiple wildcards, and edge cases
  - Create Protocol<V> generic type for discriminated union extraction by schema version
  - Fix TypeScript compilation errors using schema validation and optional chaining patterns
  - Update extractProtocol utility to use VersionedProtocol type for better type safety

## 7.1.0

### Minor Changes

- c0c9e2b: Fix typo in filter rule operators

## 7.0.1

### Patch Changes

- dc865db: Second draft of family tree census
- d795dd9: Changeset
- 9c213e7: Add node and edge color sequences
- f0fd48b: Implement initial family tree census
- 018f3a0: Adjust property names

## 7.0.0

### Major Changes

- 7ec964b: Refactored protocol-validation API to return the Zod validation result directly, which is a result object with success and error properties.

## 6.0.0

### Major Changes

- 3849e0e: Updated zod to version 4. Consumers must also use zod 4 to avoid type conflicts.

### Patch Changes

- Updated dependencies [3849e0e]
  - @codaco/shared-consts@5.0.0

## 5.0.2

### Patch Changes

- 793bf39: Fix TypeScript declaration merging errors by disabling rollupTypes in vite-plugin-dts. This resolves "Individual declarations in merged declaration must be all exported or all local" errors and "const initializer in ambient context" issues when importing the package.

## 5.0.1

### Patch Changes

- 29287ef: Schema 8 migration fixes/improvements:
  - Fix displayVariable removal
  - Remove options from Toggle variables

## 5.0.0

### Major Changes

- 97fd038: # Release stable versions for protocol-validation

  This changeset marks the transition from alpha/prerelease to stable versions for protocol-validation package.

  ## Changes
  - **@codaco/protocol-validation**: Upgraded from `4.0.0-alpha.11` → `4.0.0` (stable)

  ## Context
  - Both shared-consts (3.0.0) and protocol-validation are now considered stable and ready for production use
  - This removes the alpha/prerelease status and indicates these packages have reached production readiness

  ## Breaking Changes

  This is not a breaking change in terms of functionality - the API remains the same. The version bump reflects the move from alpha to stable status.

- ae26f2a: ### Major Update for `@codaco/protocol-validation` (Schema 8)

  #### Key Changes:
  - **New Stage Types Added**:
    - `Geospatial`
    - `Anonymisation`
    - `OneToManyDyadCensus`
    - `FamilyTreeCensus`

  - **Expanded `assetManifest` Schema**:
    - Added a new `apiAssetSchema`, enabling support for API keys.
    - Expanded `fileAssetSchema` with the addition of the `geojson` type, enabling support for geospatial data.

  - **New `experiments` Property on `Protocol`**:
    - Introduced a new `experiments` property with an `encryptNames` boolean.

### Patch Changes

- a4969c4: small changes
- 86aa8c0: separate out node and edge based stage subjects so that they can be extracted
- Improve types for variables
- 4ea6b33: Ensure development protocol can validate
- 43c3304: make data source required property in panel schema
- 3605f81: export even more types
- df6da79: Make migration for schema 8 return proocol object
- 04aff9d: Correct SortOrderSchema
- 37df451: Export stage types
- ec38a8a: change anonymisation schema
- 3e394d5: use specific stage subject types
- ceda2af: Export additional schemas to support prisma json transformer extension
- 551b473: Improve prompt type
- Updated dependencies [a4969c4]
- Updated dependencies
- Updated dependencies [9ec9284]
- Updated dependencies [304c64f]
- Updated dependencies [b0fa339]
  - @codaco/shared-consts@4.0.0

## 4.0.0-alpha.11

### Patch Changes

- df6da79: Make migration for schema 8 return proocol object

## 4.0.0-alpha.10

### Patch Changes

- 551b473: Improve prompt type

## 4.0.0-alpha.9

### Patch Changes

- 43c3304: make data source required property in panel schema
- 04aff9d: Correct SortOrderSchema

## 4.0.0-alpha.8

### Patch Changes

- 3e394d5: use specific stage subject types

## 4.0.0-alpha.7

### Patch Changes

- 86aa8c0: separate out node and edge based stage subjects so that they can be extracted

## 4.0.0-alpha.6

### Patch Changes

- a4969c4: small changes

## 4.0.0-alpha.5

### Patch Changes

- ceda2af: Export additional schemas to support prisma json transformer extension

## 4.0.0-alpha.4

### Patch Changes

- 3605f81: export even more types

## 4.0.0-alpha.3

### Patch Changes

- 4ea6b33: Ensure development protocol can validate
- 37df451: Export stage types
- ec38a8a: change anonymisation schema

## 4.0.0-alpha.2

### Patch Changes

- Improve types for variables

## 4.0.0-alpha.1

### Major Changes

- ae26f2a: ### Major Update for `@codaco/protocol-validation` (Schema 8)

  #### Key Changes:
  - **New Stage Types Added**:
    - `Geospatial`
    - `Anonymisation`
    - `OneToManyDyadCensus`
    - `FamilyTreeCensus`

  - **Expanded `assetManifest` Schema**:
    - Added a new `apiAssetSchema`, enabling support for API keys.
    - Expanded `fileAssetSchema` with the addition of the `geojson` type, enabling support for geospatial data.

  - **New `experiments` Property on `Protocol`**:
    - Introduced a new `experiments` property with an `encryptNames` boolean.
