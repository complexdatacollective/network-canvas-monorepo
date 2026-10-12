---
'@codaco/protocol-validation': patch
'@codaco/architect': patch
---

A Narrative Pedigree stage must now come after the Family Pedigree stage it
reads. Schema 8 validation refuses a protocol whose Narrative Pedigree runs
before its source, which would otherwise show the participant an empty family.
Architect's timeline refuses a drag or keyboard move that would put the source
after the stage that reads it, and says which two stages are involved, in the
same way it already guards skip destinations.
