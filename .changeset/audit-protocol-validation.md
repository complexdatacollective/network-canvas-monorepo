---
'@codaco/protocol-validation': minor
---

Tighten the protocol schema and add migrations to fix conformance gaps found in a release audit of the interview module:

- Reject form fields that reference a variable with no renderable `component` (or a `layout`/`location` variable).
- Validate that a NameGeneratorQuickAdd `quickAdd` references an existing text variable on the subject node type.
- Require `otherOptionLabel` when a CategoricalBin prompt sets `otherVariable`.
- Remove the vestigial Information `loop` flag, with a migration dropping it from existing protocols.
- A `minValue`, `minLength`, or `minSelected` validator no longer implies a field is required. A migration sets `required: true` on every existing codebook variable (node, edge, or ego) that has one of these validators without an explicit `required: true`, preserving the effective behaviour of protocols authored before the change.
