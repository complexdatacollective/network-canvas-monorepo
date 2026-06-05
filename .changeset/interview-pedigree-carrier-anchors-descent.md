---
'@codaco/interview': patch
---

`FamilyPedigree`: a donor-conceived child carried by a gestational carrier (e.g.
a single parent using two donors) now renders a line of descent. The layout drew
a descent only for children with a primary (biological/social/adoptive) parent,
so a child whose parents were all auxiliary (gamete donors plus a surrogate)
showed no edges. Following standard pedigree nomenclature — the carrier's line of
descent is solid and the pregnancy sits below whoever carried it — the
gestational carrier now anchors the descent when the child has no primary parent,
with the donors attached as auxiliary lines. Children with a primary parent are
unchanged.
