# @codaco/interview

## 4.0.0

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

- faa625a: Sociogram prompts with a display-only highlight (a `highlight.variable` with `allowHighlighting` off) render matching nodes highlighted; tapping a node only toggles the highlight attribute when `allowHighlighting` is enabled.
- Updated dependencies [a6d037a]
- Updated dependencies [1172a44]
- Updated dependencies [34d2bfd]
- Updated dependencies [fc7e279]
  - @codaco/fresco-ui@4.1.0
  - @codaco/protocol-validation@11.10.0
  - @codaco/network-query@1.2.1

## 3.0.0

### Minor Changes

- 0e233da: Network Composer stages now render a background image when the stage configures one, matching the Sociogram: the image replaces the concentric-circles background and never intercepts pointer input.
- 7b096c1: Add an optional `navigationClassnames` prop to `Shell`. It accepts per-orientation class strings (`{ vertical?, horizontal? }`) that are merged onto the interview navigation surface, letting a host apply device-specific styling — e.g. safe-area padding for an installed PWA — without the shared component owning it. Omitting the prop leaves the navigation exactly as before, so existing consumers are unaffected.
- 3925154: NarrativePedigree now models mitochondrial donation. The genetics engine infers
  each child's mitochondrial-DNA source from the egg-cytoplasm edge rather than
  assuming it always follows the female parent, so a child conceived with a donor
  egg inherits the donor's mitochondrial line while still inheriting the intended
  parents' nuclear genome. Protocols that record a `gameteRole` on their pedigree
  edges get this automatically; those that don't are unaffected (the engine falls
  back to the previous female-parent rule, so existing data is unchanged).

  Disease-status symbols follow standardized pedigree nomenclature: a solid fill is
  reserved for individuals who are affected, and relatives who are only at risk are
  shown with the standard hatched carrier symbol rather than a filled marker, keeping
  the display consistent with established clinical and research practice.

  The comprehensive example pedigree is rebuilt around a single, realistic,
  ego-centric family in which all six conditions reach the participant's own
  household. The mitochondrial-donation branch (not authorable through the
  participant interface) is shown in a dedicated example, while the default preview
  reflects a participant-reachable pedigree.

- 8954630: Add zoom in, zoom out and reset controls to the NarrativePedigree interface via a floating toolbar.
- 57335b8: Sociogram quality-of-life improvements (#887):

  - Placed nodes can now be removed from the sociogram again: drag a node onto the drawer at the bottom of the screen (which highlights and expands to receive it), or focus a node and press Delete/Backspace. Removals are announced to screen readers.
  - The drawer of unplaced nodes can now be expanded while empty, revealing the drop area.
  - The sociogram's floating prompt panel can be collapsed behind a chevron tab so the prompt text no longer occludes the drop area, and it re-opens automatically when the prompt changes. A grip icon now signals that the panel is draggable (also on the Geospatial stage, where the prompt is the core task and stays visible rather than being collapsible).

- b467615: Add forward skip destinations to schema 8, shared skip evaluation, synthetic
  network generation, and the interview runtime. Hidden stages can now continue
  at a later stage or route to the interview finish screen, with live route
  recalculation, safe Back navigation, and confirmed one-screen overrides for
  unavailable stages.

  Also keep shared Select fields correctly labelled and contained when option
  labels are long. The bundled sample protocol now ends the interview when a
  participant declines consent.

### Patch Changes

- 367e702: Harden protocol import/validation and make interview autosave failures recoverable:

  - **Zip-bomb protection:** `extractProtocol` now caps the _actual_ inflated output incrementally as it decompresses, instead of trusting the archive's declared uncompressed size. A crafted `.netcanvas` (deflate bomb) can no longer exhaust memory; the new `NetcanvasInflationLimitError` is thrown when the limit is exceeded.
  - **Locked value sets** (biological sex / gamete role / relationship type) are now enforced for read-only **ordinal** variables, not only categorical ones, so their canonical options can't be silently altered.
  - Form-field and composer-field schemas tolerate a persisted stable `id`, so editors can keep durable field identity across reorder and delete.
  - **Autosave durability:** the interview sync middleware no longer advances its "last synced" marker before the write resolves. A failed autosave (e.g. a locked vault or storage quota) is now retried on the next debounce instead of silently dropping just-added network data.

- 2b12bdc: Boolean fields now lay their options out side by side whenever they fit, wrapping to a stacked layout only when the container is genuinely too narrow for them. This fixes the Dyad Census interface stacking its Yes/No choices vertically even when there was room to show them side by side.
- 37a454c: Ask for confirmation before exiting an interview in progress, and regroup the horizontal navigation bar so previous/next sit together on the right with the progress bar filling the middle.
- ef1c4b4: Fix invalid Tailwind utility classes that silently rendered nothing: the Spinner's
  backface-visibility (now `backface-hidden`), and the encrypted background's 3D
  transform (`transform-3d`) and monospace font (`font-monospace`).
- 08797b5: Fix the Anonymisation stage blocking a valid direct-Next attempt: forward navigation now awaits form validation against the current values instead of reading the render-time validity, which was stale while a field validation was still in flight and forced an extra Next click.
- 486f928: Fix two data-integrity bugs surfaced by the interview e2e suite. The
  `encryptedVariables` experiment is now the single master switch for name
  encryption: `NameGenerator`/`NameGeneratorRoster` no longer write ciphertext
  when the experiment is off, keeping the write path aligned with the
  experiment-gated decrypt path (previously an encrypted variable produced
  undecryptable stored values). `Anonymisation`'s before-next gate now calls
  `form.requestSubmit()` instead of the native `form.submit()`, so validation runs
  and the SPA is not GET-navigated to `/?passphrase=…` — which had ejected the
  participant from the interview whenever they pressed Next on an invalid form.
- c16a1d9: Emit NodeNext-compatible relative module specifiers in generated declaration files so TypeScript consumers can resolve package types without a bundled declaration rollup.
- beb5882: Fixed the quick add name generator closing its input after each name in Safari when the protocol uses encrypted variables and a passphrase has been set. The input now stays open so multiple people can be added in a row, matching the behaviour without encryption.
- 007cee6: Node labels now resolve synchronously on first render whenever the label attribute is not encrypted. Previously every label — encrypted or not — was resolved through an asynchronous effect, which briefly exposed the node type's fallback name to assistive technology (and to name-based queries) each time a node mounted. The asynchronous path is now used only when an anonymisation-encrypted label genuinely needs decryption.
- Updated dependencies [367e702]
- Updated dependencies [4d9658b]
- Updated dependencies [e5fcd5e]
- Updated dependencies [7ca17f5]
- Updated dependencies [83dddd8]
- Updated dependencies [2b12bdc]
- Updated dependencies [e6c58c2]
- Updated dependencies [be60ee0]
- Updated dependencies [ef1c4b4]
- Updated dependencies [2c112ba]
- Updated dependencies [5c269b3]
- Updated dependencies [c6f2ad4]
- Updated dependencies [1d19a1b]
- Updated dependencies [c1cf1fa]
- Updated dependencies [617c1b9]
- Updated dependencies [628c018]
- Updated dependencies [ce9b549]
- Updated dependencies [9b57c1d]
- Updated dependencies [486f928]
- Updated dependencies [e4c3d5f]
- Updated dependencies [9336312]
- Updated dependencies [ef02898]
- Updated dependencies [436e04c]
- Updated dependencies [5e2efc3]
- Updated dependencies [6a3f5db]
- Updated dependencies [c236b20]
- Updated dependencies [807f0d4]
- Updated dependencies [452549c]
- Updated dependencies [fd46cd0]
- Updated dependencies [2872951]
- Updated dependencies [c16a1d9]
- Updated dependencies [3a8689f]
- Updated dependencies [2280a15]
- Updated dependencies [803e4e7]
- Updated dependencies [2100c9c]
- Updated dependencies [5e1d565]
- Updated dependencies [ed95edc]
- Updated dependencies [179952e]
- Updated dependencies [31eacf4]
- Updated dependencies [a37d0a2]
- Updated dependencies [a37d0a2]
- Updated dependencies [bfc4303]
- Updated dependencies [36ba214]
- Updated dependencies [9d71015]
- Updated dependencies [5c269b3]
- Updated dependencies [b467615]
- Updated dependencies [9b925e9]
- Updated dependencies [ebdd094]
  - @codaco/protocol-validation@11.9.0
  - @codaco/fresco-ui@4.0.0
  - @codaco/tailwind-config@1.1.0
  - @codaco/shared-consts@5.5.0
  - @codaco/network-query@1.2.0

## 2.0.1

### Patch Changes

- d9b7f0b: Information interface: video items now honour their configured display size (Small, Medium, or Large) the same way images do, instead of always rendering at full size. Text items continue to render at their natural height so all of their content is visible.
- c56f92d: Bundle the private `@codaco/interface-images` package into the build instead of externalizing it, fixing an uninstallable published package.

  `@codaco/interface-images` is a private, source-only workspace package (raw TSX + generated `.webp` screenshots, `version: 0.0.0`, never published to npm) consumed only by the stage-navigation menu. The Vite `external` predicate treated it like a publishable peer and externalized it, so the published `dist/index.js` carried a bare `import '@codaco/interface-images/…'` and `package.json` listed it as a runtime dependency (`workspace:*`, rewritten to `0.0.0` at publish). Because that version does not exist on npm, `pnpm add @codaco/interview` failed with `ERR_PNPM_FETCH_404` for `@codaco/interface-images`.

  The build now bundles the interface-images source into `dist/index.js` and emits its ~4.5 MB of `.webp` screenshots as separate hashed files under `dist/assets/` (referenced via `new URL('./assets/…', import.meta.url)`, keeping `dist/index.js` small and letting the images load on demand), and the package is reclassified as a `devDependency`, so the published package is self-contained with no dangling runtime dependency. No runtime or type API changes.

  - @codaco/network-query@1.1.2

## 2.0.0

### Minor Changes

- 11e1055: Family Pedigree: capture **consanguineous unions** — partner with an existing relative (e.g. ego with a first cousin) and attribute children to that union — and make the Narrative Pedigree genetics engine consanguinity-correct for the resulting recessive-homozygosity risk.

  - Add-partner now offers an existing-or-new picker (existing candidates exclude only first-degree relatives); choosing an existing person creates a partner edge without duplicating the node (preserving the mating loop). The already-built NSGC double-line / loop rendering is exercised end-to-end.
  - A new, non-lattice `atRiskHomozygous` flag surfaces the autozygosity/compound-het risk for the child of two carrier parents (autosomal recessive) and the daughter of an affected father + carrier mother (X-linked recessive), shown distinctly in the Sticker and Classic notation nodes. Genetic edges are de-duplicated at ingestion so carrier counts stay correct.

  The genetics changes require research-team sign-off before merge (they fold into the existing PR #713 genetics gate).

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

- 9f7c890: Add offline-awareness and a more resilient stage error boundary.

  - New `useOnline` hook (exported from the package root) — a single
    `useSyncExternalStore`-based source of online/offline state.
  - The Geospatial stage now shows a persistent offline indicator when reached
    without a connection, and its error boundary explains the offline case
    (maps can't load) rather than a generic failure.
  - The error-boundary fallback's "Copy Debug Info" button no longer depends on a
    host `Toast.Provider`: it now confirms inline, so a stage crash in a host that
    doesn't mount its own toast provider (e.g. the package e2e host or Architect's
    preview) no longer throws a secondary error inside the fallback.

- a68b606: Add an opt-in `allowStageNavigation` prop to `Shell`. When enabled, clicking the
  interview progress bar expands into a searchable stages menu (with a timeline and
  per-stage cards) for jumping directly to any stage, mirroring the legacy app.
  Jumps run the same `beforeNext` validation as the next/back buttons and ask for
  confirmation before showing a stage that skip logic would otherwise hide. Off by
  default; no change to existing behaviour.

  Per-stage preview thumbnails in the menu are rendered by the package itself from
  `@codaco/interface-images`, so hosts don't supply them.

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

- 473d566: Unified Sociogram and Narrative onto a shared force-directed auto-layout engine.
  The engine measures each node to derive collision spacing (guaranteeing no node
  overlap), adds edge attraction, group cohesion that pulls same-group nodes into
  their convex hulls, and centering. Narrative additionally gains group-aware
  layout and is now fully read-only during the settled interaction.

### Patch Changes

- 7fdfdb9: Fix two layout bugs in name-generator side panels:

  - When two panels are open they now share the rail evenly (~50/50) instead of
    the panel with more content taking almost all the space and leaving its
    sibling a sliver.
  - A collapsed panel now keeps its full title bar visible instead of shrinking to
    nothing and hiding the title.

- 2e775eb: Narrative interface: the behaviours/drawing controls and the preset switcher now use the shared `SegmentedToolbar`, unifying them with the rest of the interview UI (toolbar semantics, roving focus, tooltips, and the interview-theme pressed state).
- Updated dependencies [97b0ef4]
- Updated dependencies [38de563]
- Updated dependencies [5869464]
- Updated dependencies [0f577dd]
- Updated dependencies [8439757]
- Updated dependencies [5b06420]
- Updated dependencies [ebaa737]
- Updated dependencies [617a920]
- Updated dependencies [f551a2e]
- Updated dependencies [79ccead]
- Updated dependencies [65b55f9]
- Updated dependencies [735fb6e]
  - @codaco/fresco-ui@3.0.0
  - @codaco/network-query@1.1.1

## 1.2.0

### Minor Changes

- fb8b47b: Add a server-safe `@codaco/interview/contract` entry point.

  Importing anything from the package root evaluates the React component graph
  (`Shell` and its module-level `createContext` calls), which throws when pulled
  into a server / React Server Component build. The new `@codaco/interview/contract`
  subpath is bundled separately and re-exports only the React-free contract — the
  `createInitialNetwork` and `isValidAssetType` utilities and the public payload /
  handler types — so host servers can import them without evaluating any React
  code.

  `createInitialNetwork` now lives in `src/contract/` alongside `isValidAssetType`
  (a single definition, still re-exported from the package root for existing
  consumers). No runtime behaviour changes for existing imports.

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
