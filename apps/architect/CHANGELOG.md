# @codaco/architect

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
