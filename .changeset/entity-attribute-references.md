---
'@codaco/protocol-validation': minor
---

Make the v8 schema the single source of truth for entity-attribute (codebook variable) references.

Fields that hold the id of a codebook variable are now tagged at their schema definition with `entityAttributeReference({ subject, requireType? })`, which brands the field type and records how to resolve the variable's subject. A new `collectEntityAttributeReferences(protocol)` walker derives every reference — with its resolved subject and any required type — directly from the tagged schema, and `validateProtocol` uses it to check that each referenced variable exists on its subject and is of an allowed type. This replaces the hand-placed existence checks that were duplicated across `superRefine`, removing the drift that previously let a variable referenced only by certain validation rules be reported as unused (and invalid references slip through). The walker tolerates structurally-invalid stages/filter rules so references inside in-progress protocols are still detected.

New public exports: `entityAttributeReference`, `asEntityAttributeReference`, `collectEntityAttributeReferences`, and the `EntityAttributeReferenceHit` type.
