---
'@codaco/protocol-utilities': patch
---

Synthetic family pedigree edges now record a relationship. Every parent-child
edge `generateNetwork` builds carries the relationship type and active flag its
stage's `edgeConfig` names — `biological` and `true`, which is what the
interview writes on every parent-child edge it commits and what every reader
already assumes when the values are missing. Previously those edges were created
with no attributes at all, so anything reading synthetic pedigree data saw a
relationship the protocol had no value for.

The two gamete-side variables (`isGestationalCarrier`, `gameteRole`) stay
unwritten: they record which parent supplied which gamete and who carried the
pregnancy, and a pedigree without those features carries no such value in a real
interview either.

The values are written rather than drawn, so a seeded run produces the same
people, the same parentage and the same values as before — the new attributes
are all that is added. Feasibility counts them like any other written value, so
a `unique` rule on one of those two variables is now measured against the edges
that really hold it.
