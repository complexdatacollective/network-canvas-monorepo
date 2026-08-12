---
'@codaco/protocol-utilities': major
'@codaco/architect': minor
---

Rebuild synthetic interview generation around declared `synthetic` metadata rather than around stage-specific tuning.

`generateNetwork` now analyses what each stage can create and write, plans the network the interview ends with — populations from each creating stage's declared count, values from the variables' declared distributions, edges from a topology target over the pairs that stage can actually reach — and then replays that plan through the stage sequence. Entities appear where the interview creates them carrying only what that interaction writes, later writers land the planned final value while earlier ones hold compatible intermediates, and census metadata follows from the final graph, so an unlinked pair becomes an explicit negative nomination. Every draw comes from a semantic seeded substream, so adding a variable no longer perturbs unrelated values.

Because a count belongs to the stage that asks, there is nothing to apportion: three name generators over one node type each nominate their own people, and a type no stage creates simply has no people. A stage's own `minNodes`/`maxNodes` still bind, since they are what the interface will actually hold.

An under-provisioned roster is now reported instead of silently producing a smaller network. A stage that **declares** more people than its roster can supply raises `SyntheticDataConstraintError` naming that stage and what it was set to add; where several stages draw from overlapping pools, rows are assigned most-constrained-first so a wide pool cannot take the rows only a narrow one could have used. A stage that declares nothing is only carrying the generic default, which says nothing about that roster, so it takes what the pool offers rather than refusing.

**Breaking:** `GenerationConfig` keeps only run-level controls (`dropOutFactor`, `inProgressClearRatio`, `today`). The stage-specific count and probability options — `nodeCount`, `rosterDrawRatio`, `sociogramEdgeProbability`, `sociogramLayoutRange`, `censusEdgeProbability`, `networkComposerEdgeProbability`, `familyPedigreeNodeCount` — are replaced by `synthetic` metadata and its defaults. A Family Pedigree is no longer sized by anything in the protocol; its optional branches are bounded by the generator's own ceiling, which a host may raise or lower through its `familyPedigree` options. The result shape and the `generateNetwork` signature are unchanged.

Architect gains the authoring UI for that metadata: a variable pill now anchors a popover holding the full variable editor, with an optional synthetic-data section initialised from the same defaults the generator resolves, and every entity-creating stage editor gains an optional "Synthetic data" section for the people it adds, the density it links them at, or both. Each section is off by default and stores nothing until enabled.
