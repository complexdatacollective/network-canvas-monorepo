---
'@codaco/protocol-utilities': minor
---

`SyntheticInterview.getNetwork()` now answers the ego's variables instead of leaving them blank.

The ego previously came back with no attributes at all, whatever its codebook declared. An ego form built from synthetic data therefore rendered empty every time, a required ego variable arrived unanswered, and rules written between ego variables — same as, different from, and the greater/less than (or equal to) comparisons — were ignored entirely.

Ego attributes are now drawn through the same solver the nodes and edges already used, so they satisfy the rules its codebook declares and a protocol whose ego rules cannot all be met at once is refused with the same `SyntheticDataConstraintError`. Ego is drawn after the nodes and edges, so adding an ego variable to an existing fixture does not disturb the values its nodes and edges were already given.
