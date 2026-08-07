---
'@codaco/protocol-utilities': major
'@codaco/architect': minor
---

Rebuild synthetic interview generation around the codebook rather than around stage-specific tuning.

`generateNetwork` now analyses what each stage can create and write, plans the network the interview ends with — populations from codebook counts, values from declared distributions, edges from a topology target over the pairs each stage can actually reach — and then replays that plan through the stage sequence. Entities appear where the interview creates them carrying only what that interaction writes, later writers land the planned final value while earlier ones hold compatible intermediates, and census metadata follows from the final graph, so an unlinked pair becomes an explicit negative nomination. Every draw comes from a semantic seeded substream, so adding a variable no longer perturbs unrelated values.

**Breaking:** `GenerationConfig` keeps only run-level controls (`dropOutFactor`, `inProgressClearRatio`, `today`). The stage-specific count and probability options — `nodeCount`, `rosterDrawRatio`, `sociogramEdgeProbability`, `sociogramLayoutRange`, `censusEdgeProbability`, `networkComposerEdgeProbability`, `familyPedigreeNodeCount` — are replaced by codebook `synthetic` metadata and its defaults. The result shape and the `generateNetwork` signature are unchanged.

Architect gains the authoring UI for that metadata: a variable pill now anchors a popover holding the full variable editor, with an optional synthetic-data section initialised from the same defaults the generator resolves, and entity type editors gain optional population and topology sections. Each section is off by default and stores nothing until enabled, and both editors validate what they are about to save against the protocol schema itself, so a population whose minimum exceeds its maximum, a probability outside 0–1, or an all-zero set of option weights is reported on the field that owns it rather than saved as an invalid protocol.
