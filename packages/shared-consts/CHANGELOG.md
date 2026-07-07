# @codaco/shared-consts

## 5.4.0

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

## 5.3.0

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

## 5.2.0

### Minor Changes

- `FamilyPedigreeStageMetadataSchema`: edges may now carry an optional internal `gameteRole` (`'egg' | 'sperm'`) recording which gamete a biological/donor parent contributed. It is persisted in stage metadata for relationship labelling and is never written to the interview network.

## 5.1.0

### Minor Changes

- Add session stage-metadata schemas as a cross-package contract for code that produces or consumes interview session state. New exports from `./stage-metadata`:
  - `StageMetadataSchema` (zod) — record of stage ID → either a FamilyPedigree metadata object or an array of DyadCensus/TieStrengthCensus tuples.
  - `DyadCensusMetadataItem` (type) — the `[promptIndex, fromId, toId, isPresent]` tuple shape.
  - `StageMetadata` (type) — inferred from `StageMetadataSchema`.

  These previously lived inside `@codaco/interview`'s session reducer; relocated here so `@codaco/protocol-utilities` (which generates conforming metadata) and `@codaco/interview` (which validates and stores it) can share a single definition. See `@codaco/interview`'s and `@codaco/protocol-utilities`'s changelogs for the corresponding consumer updates.

## 5.0.0

### Major Changes

- 3849e0e: Updated zod to version 4. Consumers must also use zod 4 to avoid type conflicts.

## 4.0.0

### Major Changes

- Improve types for variables
- b0fa339: # Implement bundling with Vite for @codaco/shared-consts

  This is a major breaking change that transitions the package from exporting raw TypeScript files to providing bundled JavaScript output.

  ## Changes
  - Added Vite library mode configuration with dual format support (ESM + CJS)
  - Added vite-plugin-dts for TypeScript declaration generation
  - Updated package.json with proper exports configuration for both ESM and CJS
  - Added build scripts and development workflow
  - Updated version to 3.0.0 to reflect the breaking change

  ## Breaking Changes
  - Package now exports bundled JavaScript instead of raw TypeScript
  - Build step is now required before publishing
  - Import paths remain the same, but the underlying module format has changed

  This change improves compatibility with legacy applications while maintaining support for modern ESM environments.

### Patch Changes

- a4969c4: small changes
- 9ec9284: export additional types
- 304c64f: Make ego a required property of NcNetwork

## 1.0.0-alpha.3

### Patch Changes

- a4969c4: small changes

## 1.0.0-alpha.2

### Patch Changes

- 304c64f: Make ego a required property of NcNetwork

## 1.0.0-alpha.1

### Patch Changes

- 9ec9284: export additional types

## 1.0.0-alpha.0

### Major Changes

- Improve types for variables
