---
'@codaco/architect': patch
---

Closed several ways a protocol could be left in a state the validator rejects, where saving previously appeared to work but the stage silently reverted:

- Mapping a variable to a node shape now requires a variable to be chosen, and a breakpoint mapping requires at least one threshold with strictly increasing values. New thresholds start above the previous one, and an incomplete mapping blocks saving with an explanation instead of reverting without warning.
- Changing the node type of a Family Pedigree stage is now blocked, with an explanation, while a Narrative Pedigree stage depends on it — preventing a broken reference to a variable that no longer exists on the new type.
- The map stage now reads feature properties from every feature in a GeoJSON file rather than only the first, so the property selector appears whenever any feature has properties. When no feature has any, saving is blocked with a clear message rather than failing validation later.
- The codebook's "used in" display now names shape settings as a place a variable is used.
