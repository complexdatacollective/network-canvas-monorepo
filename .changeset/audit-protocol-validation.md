---
'@codaco/protocol-validation': minor
---

Tighten the protocol schema and add migrations to fix conformance gaps found in a release audit of the interview module:

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
