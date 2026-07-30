---
"@codaco/protocol-utilities": patch
---

Synthetic networks no longer contain duplicate edges of one type between one
pair. `generateNetwork` now looks a pair up before drawing an edge for it and
reuses the one already there, the way the interview does — so two prompts, two
censuses, or a census and a sociogram all asking about the same people leave a
single edge behind rather than one apiece. A reused pair is recorded as an
answered "yes" rather than as a negative response, and a tie strength census
writes its ordinal value onto the existing edge instead of adding another.
Family pedigree edges keep their own rule: several edges of one type between one
pair are meaningful there, so a pedigree still draws each parent-child link
without looking for an existing one.

Because fewer edges are drawn, the feasibility check for `unique` edge variables
now counts one set of pairs per subject node type instead of one per prompt, so
protocols it previously refused for needing more distinct values than the draw
actually spends are accepted. Seeded output for any protocol whose stages share
an edge type changes.
