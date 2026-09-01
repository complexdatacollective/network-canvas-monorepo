# @codaco/development-protocol

## 2.0.6

### Patch Changes

- c599dac: This release improves the reliability, accessibility, and recovery of protocol editing in Architect.

  - Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
  - Forms, rule builders, the Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
  - A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
  - Protocol names, resource cards, variable identifiers, and stage editors are bounded on narrow screens. Duplicate resource filenames are distinguishable without changing the names stored in the protocol.
  - Invalid imports, blocked edits, migration conflicts, preview completion, and deleted protocol routes now explain what happened and provide a safe recovery path.
  - Recent protocols in the library now show their description, and starter templates show their stage, node type, and edge type counts.
  - The CEGRM starter template now uses an available color for its Narrative Pedigree condition. Protocol colors are constrained to typed node, edge, ordinal, or categorical palette references; Narrative Pedigree and Geospatial resolve those references through the active theme. A protocol created from the previous release's CEGRM template will report a validation error on its condition color — open the stage editor and select one of the available colors to fix it. A downloaded protocol file with this problem must be corrected before it can be imported again. Neutral dialog actions remain distinct from white dialog surfaces.

## 2.0.5

### Patch Changes

- c49e702: Synchronize the packaged development protocol after removing Network Composer
  form fields that conflict with its unvalidated group-membership writer.

## 2.0.4

### Patch Changes

- eb0df29: Add examples of the four previously-missing stage types (Network Composer, Geospatial, Family Pedigree, and Narrative Pedigree) so the development protocol now contains a working example of every stage type.

## 2.0.3

### Patch Changes

- a171f96: Unify the Sociogram and Narrative stage behaviours into a single shared schema, and flatten the `automaticLayout` behaviour to a plain boolean (was `{ enabled }`). The Narrative interface gains a configurable `automaticLayout` behaviour (a force-directed layout that positions nodes). It is only active when explicitly enabled, so existing protocols keep their hand-authored static layouts; new Narrative stages created in Architect enable it by default. The v7->v8 migration flattens any existing Sociogram `automaticLayout` value.

## 2.0.2

### Patch Changes

- d96450e: Bring the bundled protocols into conformance with the current schema 8 so they open in Architect without a "Protocol Validation Failed" dialog. These protocols are tagged schema version 8, so the open path skips migration and stale legacy keys are never stripped.
  - Sample Protocol: removed `size` from Information **text** items (schema 8 only allows `size` on asset items).
  - Development Protocol: removed `size` from text items, dropped the no-longer-supported `form.title` on the ego/alter/alter-edge forms, removed the unused `loop` flag on the `withSound` asset, dropped the no-longer-supported `highlight` block from the Sociogram prompt that also created edges (the two are mutually exclusive), and renamed the venue node type's `name_variable` to `venue_name_variable` so variable record keys are unique across entity types.

## 2.0.1

### Patch Changes

- f1dbd8d: Add node shape support with variable-to-shape mapping. NodeDefinition now includes a required `shape` field with a default shape (circle, square, or diamond) and optional dynamic mapping that maps variable values to shapes. Supports discrete mappings for categorical/ordinal/boolean variables and breakpoint mappings for number/scalar variables. Renames `iconVariant` to `icon` on node definitions.

## 2.0.0

### Major Changes

- 84d09e3: Implement validation of variable ID uniqueness across entities. Replaces broken implementation.
