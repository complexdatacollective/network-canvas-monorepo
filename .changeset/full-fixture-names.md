---
'@codaco/protocol-utilities': minor
---

Generated networks now draw realistic full names ("First Last") for name variables, falling back to a first name only when a declared maximum length has no room for one, and adding a middle name only when a minimum demands it. The set of variables treated as names now mirrors the interview runtime's label resolution — anything whose name contains "name" — so every value a node would actually display exercises label fitting. Seeded output changes as a result: the same seed draws different values than previous releases.
