# @codaco/development-protocol

## 2.0.3

### Patch Changes

- a171f96: Unify the Sociogram and Narrative stage behaviours into a single shared schema, and flatten the `automaticLayout` behaviour to a plain boolean (was `{ enabled }`). The Narrative interface gains a configurable `automaticLayout` behaviour (a force-directed layout that positions nodes). It is only active when explicitly enabled, so existing protocols keep their hand-authored static layouts; new Narrative stages created in Architect enable it by default. The v7→v8 migration flattens any existing Sociogram `automaticLayout` value.

## 2.0.2

### Patch Changes

- d96450e: Bring the bundled protocols into conformance with the current schema 8 so they open in Architect without a "Protocol Validation Failed" dialog. These protocols are tagged schema version 8, so the open path skips migration and stale legacy keys are never stripped.
  - Sample Protocol: removed `size` from Information **text** items (schema 8 only allows `size` on asset items).
  - Development Protocol: removed `size` from text items, dropped the no-longer-supported `form.title` on the ego/alter/alter-edge forms, removed the unused `loop` flag on the `withSound` asset, dropped the `highlight` block from the Sociogram prompt that also created edges (the two are mutually exclusive), and renamed the venue node type's `name_variable` to `venue_name_variable` so variable record keys are unique across entity types.

## 2.0.1

### Patch Changes

- f1dbd8d: Add node shape support with variable-to-shape mapping. NodeDefinition now includes a required `shape` field with a default shape (circle, square, or diamond) and optional dynamic mapping that maps variable values to shapes. Supports discrete mappings for categorical/ordinal/boolean variables and breakpoint mappings for number/scalar variables. Renames `iconVariant` to `icon` on node definitions.

## 2.0.0

### Major Changes

- 84d09e3: Implement validation of variable ID uniqueness across entities. Replaces broken implementation.
