---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/network-query': minor
'@codaco/network-exporters': minor
'@codaco/shared-consts': minor
---

Store categorical attribute values consistently as arrays of selected option values.

Previously the CategoricalBin interface wrote a bare scalar while CheckboxGroup / ToggleButtonGroup wrote arrays, and consumers carried bridging helpers to tolerate both shapes. Categorical attributes are now always arrays (a single selection is a one-element array), and the bridges have been removed:

- `interview`: `CategoricalBin` writes a single-element array; the node-shape resolver, categorical sorter, and bin matcher read the array contract directly.
- `network-query`: `EXACTLY` / `NOT` use deep equality and `OPTIONS_*` use array length — the scalar-categorical fallbacks (`categoricalEqual`, scalar `optionsLength`) are gone.
- `network-exporters`: `isCategoricalOptionSelected` checks array membership only.
- `shared-consts`: `VariableValue` types categorical as an array of option values.
- `protocol-validation`: the v7→v8 migration wraps existing scalar categorical filter / skip-logic rule operands (`EXACTLY` / `NOT` / `INCLUDES` / `EXCLUDES`) in a single-element array.
- `interview` (FamilyPedigree): the `relationshipType` edge variable (a categorical) is now written and read as a single-element array, conforming to the contract so its values export and query correctly.
- `shared-consts`: adds the canonical `RelationshipType` type and `RELATIONSHIP_TYPE_OPTIONS`, shared between Architect (which locks the categorical edge variable's options) and the FamilyPedigree interface so they cannot drift.

Collected interview networks holding scalar categorical values must be migrated by the host application (tracked for Fresco).
