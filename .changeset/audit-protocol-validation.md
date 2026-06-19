---
'@codaco/protocol-validation': minor
---

Tighten the protocol schema and add migrations to fix conformance gaps found in a release audit of the interview module:

- Reject form fields that reference a variable with no renderable `component` (or a `layout`/`location` variable).
- Validate that a NameGeneratorQuickAdd `quickAdd` references an existing text variable on the subject node type.
- Require `otherOptionLabel` when a CategoricalBin prompt sets `otherVariable`.
- Reject FamilyPedigree node-form variable ids that collide with reserved wizard keys, and the reserved `scaffolding` prompt id.
- Remove the vestigial Information `loop` flag and FamilyPedigree `biologicalSexVariable`, with migrations dropping them from existing protocols.
