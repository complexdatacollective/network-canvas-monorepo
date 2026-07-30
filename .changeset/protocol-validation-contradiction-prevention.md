---
"@codaco/protocol-validation": minor
---

Contradictory variable validation rules are now unexpressible. The schema
rejects inverted `min`/`max` pairs, `minSelected` above the option count,
`sameAs`+`differentFrom` naming one target, comparator structures no data can
satisfy (impossible cycles, comparisons inside a `sameAs` group, comparisons
with disjoint bounds), cross-type validation references, count-valued rules
below their floors, and malformed or inverted DatePicker `min`/`max`
parameters. Required text and categorical variables also cannot set their
maximum answer size to zero. The v7→v8 migration strips or normalises all of
these in existing protocols (see the migration notes). Protocols already at
schema version 8 that carry a contradiction will now fail validation — the
interview forms they produced were already unsubmittable.

Three further unanswerable configurations are rejected for the same reason: a
Network Composer form listing one variable in two fields (both fields render
under the same form value), a Network Composer field whose input control
cannot render its variable's type (for example a date picker on a numeric
variable), and a boolean variable whose `options` list is empty (the control
renders no choices at all). The migration removes an empty boolean `options`
list so existing protocols keep the standard Yes/No choices.

The contradiction check now also evaluates the participant-facing controls on
Ego, node, edge, name-generator, and Family Pedigree forms. Its date reasoning
recognises stable single-value coarse picker windows, equality forced by
non-strict comparisons between full-date fields, and singleton values that
propagate through a chain of `differentFrom` rules.
