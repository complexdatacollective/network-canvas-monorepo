---
"@codaco/protocol-validation": minor
---

Contradictory variable validation rules are now unexpressible. The schema
rejects inverted `min`/`max` pairs, `minSelected` above the option count,
`sameAs`+`differentFrom` naming one target, comparator structures no data can
satisfy (impossible cycles, comparisons inside a `sameAs` group, comparisons
with disjoint bounds), cross-type validation references, count-valued rules
below their floors, and malformed or inverted DatePicker `min`/`max`
parameters. The v7→v8 migration strips or normalises all of these in existing
protocols (see the migration notes). Protocols already at schema version 8
that carry a contradiction will now fail validation — the interview forms
they produced were already unsubmittable.
