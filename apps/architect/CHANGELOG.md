# @codaco/architect

## 8.0.0-beta.10

### Minor Changes

- Open protocol previews in a dedicated window instead of a browser tab. When Architect is installed as an app, the preview opens in its own app window.
- Synthetic preview sessions now draw roster-stage people from the protocol's
  actual roster assets instead of inventing them, so a preview lines up with the
  roster file the way a real interview would. A roster that is missing or
  unreadable — including a half-built draft stage — falls back to generated
  people, so a roster problem never blocks a preview.
- Allow Narrative stages to use custom image backgrounds, accept SVG image resources, preview canvas backgrounds at their full interview size and color, render resource cards responsively with contextual surface shading, and link every canvas background selector to responsive SVG guidance.

### Patch Changes

- Stop the stage editors from silently discarding variable settings they don't manage. Adding an editable attribute to a Network Composer stage no longer clears the input control from the variable in your codebook, which previously broke every other stage that used the same variable. Interface-owned option sets, such as the Family Pedigree biological sex values, also keep their locked state when you edit a form field that uses them.

  Day offsets on a relative date picker can no longer be set to a negative number, and edge rules are no longer offered on side panels that draw their data from an external file, where they can never match. Switching an existing panel to an external file now offers to remove any edge rules its filter already contains.

- Renaming an ego variable to a name already in use now shows an inline "already in use" message on the field, matching how node and edge variables behave. Previously it slipped past the inline check and surfaced a confusing "Misconfigured Protocol" dialog instead.
- Closed several ways a protocol could be left in a state the validator rejects, where saving previously appeared to work but the stage silently reverted:

  - Mapping a variable to a node shape now requires a variable to be chosen, and a breakpoint mapping requires at least one threshold with strictly increasing values. New thresholds start above the previous one, and an incomplete mapping blocks saving with an explanation instead of reverting without warning.
  - Changing the node type of a Family Pedigree stage is now blocked, with an explanation, while a Narrative Pedigree stage depends on it — preventing a broken reference to a variable that no longer exists on the new type.
  - The map stage now reads feature properties from every feature in a GeoJSON file rather than only the first, so the property selector appears whenever any feature has properties. When no feature has any, saving is blocked with a clear message rather than failing validation later.
  - The codebook's "used in" display now names shape settings as a place a variable is used.

- Make Architect's large startup spinner match the motion and colours of the loading indicator used throughout the app.
- Fix the loading spinner covering the protocol upgrade dialog, which made the "Create upgraded copy" button unclickable when opening an older protocol.
- Fix the update dialog so Install and reload opens the new version immediately and shows progress while the update is applied.
- Clarify that protocols and settings are saved locally on this device, whether Architect is open in a browser tab or installed as an app.

## 8.0.0-beta.9

### Patch Changes

- Prevent the browser Back button from opening an empty, invalid protocol after returning to the start screen.
- Bundled template protocols now set an explicit dialog title on their name
  generators ("Add Person") and an explicit scale color and canvas background
  where these were previously implicit defaults, so they satisfy the tightened
  protocol schema.
- Ensure automatically generated stage names start with a capital letter when they begin with user-defined text.
- Add a “Return and download now” option when leaving the protocol editor, so researchers can download the active protocol and return to the start screen in one step.
- Remove the redundant skip-destination note from timeline stages while retaining the skip-logic icon.
- Show browser-specific protocol storage risk in the install banner, request
  persistent storage after the first user interaction, and keep the Install action
  matched to the warning level.

## 8.0.0-beta.8

### Minor Changes

- Let researchers choose where an interview continues when a stage is skipped:
  the next available stage, a specific later stage, or the interview finish
  screen.
  Architect now shows these routes in the timeline and protocol summary and
  protects referenced destinations from invalid deletion or reordering.
  Preview only applies its one-stage skip override when routing could actually
  make the selected stage unavailable.
  The bundled Mental Health Networks and Transnational Networks templates now
  collect explicit consent and route declined consent to the finish screen.

  Interviewer follows the live route as answers change, keeps unavailable screens
  from flashing during recovery, and allows a skipped or bypassed screen to be
  opened once after confirmation.

### Patch Changes

- Show the install prompt with a warning palette, restore the Home screen action hierarchy with medium sea-green Create and slate-blue Open buttons, and keep filled Download and Finished Editing toolbar actions sea green when hovered.
- Update Architect action toolbars to use the shared SegmentedToolbar default theme, medium sizing, restrained floating shadow treatment, and explicit colors for primary preview/download actions. Apply the same restrained shadow to the top navigation bar, remove redundant shared theme overrides, set Architect primary actions to sea-green while keeping neutral buttons visually neutral, align timeline row interaction states with the selected token, let shared dialogs keep their default white popover surface, and refactor stage editor sections onto the shared Surface nesting system.
- Migrate Architect's dynamic list editors to fresco-ui ArrayField, preserving Redux Form state, validation, animated rounded dialogs, reordering, limits, dependent controls, and semantic Fresco fields throughout array rows.
- Color and resize Codebook edge type icons to match the selected edge type.
- Fix three protocol-editor bugs surfaced while building end-to-end coverage: selecting a node or edge type no longer clears when the field loses focus; creating an edge type inline within a Tie-Strength Census prompt no longer writes an invalid value that corrupts the codebook; and choosing a roster data source no longer force-expands the optional Search Options section and blocks saving.
- Fix the Family Pedigree stage delete guard. It previously read a pruned stage list that never contained the reference field, so deleting a Family Pedigree stage that a Narrative Pedigree depends on silently did nothing; it now correctly shows a blocking dialog instead.
- Audited and hardened Architect's migration to the fresco-ui field system, and reworked the "map variable to shape" editor.

  Form fixes: clearing a numeric field (e.g. a maximum-alters limit) no longer stores an empty string over the intended empty value; integer fields reject exponent/decimal input that previously stored a silently wrong number; categorical rule operands in filters and skip logic keep their selected values instead of being dropped on save; and dialog editors no longer let a native browser validation bubble pre-empt the styled, scrollable error display. Rule editors, protocol notes and stage previews now render markdown through the shared renderer, and the query-rule editors use a lighter controlled field wrapper.

  Styling and accessibility: field error states use a border cue rather than repainting whole rows, several date and relative-date inputs gained accessible names, and dead legacy styling was removed.

  Map variable to shape: the threshold editor is now a fresco editable list — add, remove, and inline-edit thresholds, capped by the number of available shapes. Threshold inputs are configured per variable type (scalar variables step across their normalised 0–1 range; number variables use their own range). The default-shape row, threshold rows, and shape choosers were restyled to match, with a node-coloured selection ring on the shape and colour pickers.

  Field labels: across the stage and codebook editors, a field label that merely restated its section heading (e.g. a "Prompts" list under a "Prompts" heading, or "Node type" under "Node Type") is now visually hidden while remaining the control's accessible name, so each field is named once instead of twice. Where a section holds several fields, duplicated labels were renamed to add information rather than hidden, and a couple of fields that had an empty or missing label gained a proper accessible name.

- Complete the fresco form-field migration with consistent custom chooser styling and accessibility, reliable validation, and correct add, edit, remove, and reorder behavior.
- Replace additional Architect form controls with fresco-ui field components while preserving redux-form state.
- Move Architect heading and lead text styling onto shared fresco-ui typography components and variants, retire the local heading utility classes from the Architect theme, switch codebook variable tables to the shared DataTable, tune variable pills to match shared button sizing with surface-token colors and an animated accent border, and color the finished editing action sea-green.
- Align the start screen library metadata with the Recent and Templates tabs, restore the panel to the base white surface, and publish that surface color so collection scroll fades match the panel background.
- Fix creating a new layout variable from a Narrative stage preset. The handler destructured a `dispatch` prop that react-redux's object-shorthand `mapDispatchToProps` never provides, so the action threw; it now calls the already-dispatch-bound action creator directly.
- Remove the unintended green tint from tables in printable protocol codebooks while preserving the intended row and column striping.
- Render Resource Library media previews on the interview background so transparent image and video assets keep their interview-time contrast.
- Fixed a range of protocol-editor UI issues:

  - The install banner and the "this protocol is already open in another tab"
    banner now both appear as strips at the top of the screen, with white,
    intent-coloured action buttons.
  - The "Create/Edit Field" dialog is split into distinct sections (Variable,
    Question, Input Control, Categorical/Ordinal Options, Validation), and the
    Validation list now uses inline editing with a collapsed summary per rule.
  - Categorical/ordinal option rows and the protocol description field use cleaner,
    consistent styling with no clashing background or border layers.
  - Empty toggleable sections centre their "enable this feature" message correctly.
  - Selecting a node type for a stage no longer clears itself when you edit another
    field or save, so stages can no longer be saved in an invalid state.

- Use the fresco-ui RichSelectGroup for choosing sociogram background types.
- Show linked text as plain text in item previews to keep it readable against colored backgrounds.
- Use the fresco-ui Likert scale for roster search accuracy settings.
- Load the newest app shell on fresh online launches while preserving the precached offline startup path and keeping in-progress interviews on the active offline-safe shell.
- Improve printed protocol summaries with neutral table colors.
- Replace Architect alert-like panels and editor tips with the shared fresco-ui Alert component.
- Use responsive shared dialogs throughout Architect while preserving Interviewer's purpose-built home modal sizing.

## 8.0.0-beta.7

### Minor Changes

- Add a developer authoring mode for source-linked template protocols, including a toolbar action that saves edited template, sample, and development protocols back to the canonical protocol source package.
- Use the shared rich text editor for protocol text fields and add support for inserting hyperlinks.

## 8.0.0-beta.6

### Minor Changes

- Architect now uses the shared Network Canvas design system — the same theme foundation as Interviewer. Interface elements shared between the apps, including the app update dialog, confirmation dialogs, and form fields, now display correctly. Architect's appearance is otherwise unchanged, with a few small refinements: fonts are bundled with the app rather than loaded from Google Fonts (better offline support and privacy), timeline stage cards show a subtle highlight when hovered, and badge text on dark backgrounds is easier to read.

### Patch Changes

- The Narrative Pedigree stage editor's at-risk help text no longer references the removed "may be affected" (homozygous) marker. At-risk relatives are now described only as "may develop" or "may carry" a condition, and the copy clarifies that a solid, filled symbol indicates a clinically affected individual (per Bennett et al., 2022 nomenclature), so at-risk relatives always appear as unfilled symbols marked with a "?".

## 8.0.0-beta.5

### Minor Changes

- Replace the update toast with a version indicator that shows when an update is available or has just been applied, and displays the release changelog. Updates now apply automatically on a fresh load when no work is in progress.

### Patch Changes

- Fix minor styling from invalid Tailwind classes: button colour transitions, the
  search field's clear-icon colour, and the ordered-list error text colour.
- Close a batch of data-durability, privacy and safety gaps surfaced by the pre-release audit follow-up:
  - **Encrypted variables:** editing a field in the Network Composer or Family Pedigree editors no longer strips the variable's `encrypted` flag.
  - **Analytics privacy:** import-validation failure analytics no longer embed protocol-derived strings (codebook keys, variable names, entered values) — only structural error codes/paths are sent.
  - **Asset export:** distinct assets whose names sanitise to the same archive entry no longer silently overwrite each other, and the primary Download button now warns when a `.netcanvas` is exported with unresolved assets.
  - **Validation timing:** an edit that lands while a validation is in flight is no longer dropped, and auto-undo no longer reverts a valid newer edit or stacks dialogs.
  - **Undo/persistence:** inline-created variables with an invalid name show a friendly error instead of throwing; a mismatched rehydrated protocol id/content pair can't autosave the wrong content into a library row; a `sessionStorage` quota failure now surfaces the storage-unavailable banner instead of silently going in-memory.
  - **Preview:** assets held in the Safari-private in-memory fallback are now transferred to the preview tab, so media/roster protocols preview correctly.
  - **PWA updates:** the update auto-apply now also defers during the autosave-debounce window after a stage edit and during bundled-template imports, so a fresh-load auto-update can't reload mid-write.
  - **Storage GC:** orphaned asset blobs are now removed within a transaction that includes the assets table, so the delete no longer throws and leaves the blob behind.
  - **Stage editor:** a multi-step browser Back from a dirty stage editor now prompts before discarding the draft, and the unsaved-variable dialog confirms before a backdrop dismiss.

## 8.0.0-beta.4

### Patch Changes

- Fixed a memory leak in the protocol summary where an asset preview's object URL was never released if the asset finished loading after the preview had already closed or switched to a different asset.

## 8.0.0-beta.3

### Minor Changes

- Renamed the app from "Architect Web" to "Architect". The browser tab now reads **Architect** and the package is `@codaco/architect`. Your protocols, saved work, and workflow are unchanged.

## 8.0.0-beta.2

### Minor Changes

- You can now work on more than one protocol at a time in separate browser tabs.
  Each tab keeps its own open protocol and edits, so opening a second protocol in a
  new tab no longer disturbs the first, and reloading a tab keeps the protocol you
  were editing. Opening a fresh tab starts at the start screen. If you open the
  same protocol in two tabs, the second becomes a read-only view that tells you the
  protocol is already open elsewhere, so the two tabs can't overwrite each other's
  changes.

### Patch Changes

- Pre-release audit fixes across the protocol designer. Your work is protected in
  more places: the undo history no longer quietly fills up browser storage, an
  interrupted export now tells you which resources were skipped instead of failing
  silently, exported protocols keep same-named resources distinct, and reloading
  for an update warns you before discarding an in-progress edit. Deleting and
  editing entries in the codebook is safer — encrypted variables stay encrypted,
  in-use resources can no longer be removed by mistake, and clearer prompts appear
  when a change would affect another part of your protocol. The Family Pedigree,
  Narrative Pedigree, and Network Composer editors handle diseases, edge types,
  labels, and source-stage changes correctly; Family Pedigree's fixed value sets
  (such as biological sex) stay read-only after they're created; and previewing is
  more robust (clearer errors instead of a preview that never loads). Option labels no longer
  pick up stray blank lines. Privacy is tightened: analytics no longer transmits
  your protocol's text, and a Content-Security-Policy is applied to the deployed
  app.

  Starting up is nicer too: a loading animation now appears while the app opens
  instead of a blank screen, and the "install Architect" banner disappears on its
  own as soon as you install the app, without needing to refresh.

## 8.0.0-beta.1

### Patch Changes

- Fix the Information stage editor producing invalid protocols. Text blocks could previously be resized, which set a display size that is no longer valid for text. Content blocks are now managed as a reorderable list with no limit on how many you can add, and a display size (Small, Medium, Large, or full size) can be set on image and video blocks only.

## 8.0.0-beta.0

- Start of the changeset-driven beta release line.

## 7.0.0-beta.1

### Patch Changes

- Updated dependencies [02c4314]
  - @codaco/fresco-ui@2.12.2
  - @codaco/art@0.1.0

## 7.6.0

### Minor Changes

- 7775d5f: Replace FamilyTreeCensus stage editor with FamilyPedigree, matching restructured protocol schema. The new editor organizes configuration into Node Configuration and Edge Configuration sections, simplifies the census prompt, and generalizes disease nomination prompts into generic nomination prompts.

### Patch Changes

- Updated dependencies [f1dbd8d]
  - @codaco/protocol-validation@11.4.0

## 7.5.2

### Patch Changes

- Updated dependencies [b8b9fb0]
  - @codaco/protocol-validation@11.2.0

## 7.5.1

### Patch Changes

- Updated dependencies [4f2d778]
  - @codaco/protocol-validation@11.1.1

## 7.5.0

### Minor Changes

- 273bcbe: Add optional showTransit and allowSearch configuration options to geospatial interface mapOptions:
  - showTransit: When enabled, Fresco displays transit layers on the map
  - allowSearch: When enabled, participants can search the map for locations

  Both options default to false (disabled).

- Updated dependencies [273bcbe]
  - @codaco/protocol-validation@11.1.0

## 7.4.0

### Minor Changes

- 8f91391: Remove `introductionPanel` from Geospatial interface schema.

  This is a breaking change for existing protocols that include an `introductionPanel` on Geospatial stages. Protocols with Geospatial interfaces no longer support or require an introduction panel.

### Patch Changes

- Updated dependencies [8f91391]
  - @codaco/protocol-validation@11.0.0

## 7.3.0

### Minor Changes

- b713317: Add greaterThanOrEqualToVariable and lessThanOrEqualToVariable validations for number, datetime, and scalar variable types

### Patch Changes

- Updated dependencies [b713317]
  - @codaco/protocol-validation@10.1.0

## 7.2.0

### Minor Changes

- 23b675c: Migrate from direct PostHog usage to @codaco/analytics package for consistent analytics across all Network Canvas apps

## 7.1.0

### Minor Changes

- 01448c8: Split Family Tree sexVariable into egoSexVariable and nodeSexVariable.

  This is a breaking change for existing protocols that reference the old sexVariable field. Protocols with Farmily Tree interfaces require that the egoSexVariable and nodeSexVariable be defined separately.

### Patch Changes

- Updated dependencies [01448c8]
  - @codaco/protocol-validation@10.0.0

## 7.0.3

### Patch Changes

- Updated dependencies [cc2adc3]
  - @codaco/protocol-validation@9.0.0

## 7.0.2

### Patch Changes

- Updated dependencies [9958b67]
  - @codaco/protocol-validation@8.0.2

## 7.0.1

### Patch Changes

- Updated dependencies [84d09e3]
  - @codaco/protocol-validation@8.0.1
