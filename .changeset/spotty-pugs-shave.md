---
'@codaco/protocol-utilities': minor
---

Add an `inProgressStageIndex` option to `generateNetwork` that treats one stage as in progress rather than complete. For interaction-driven stages (OrdinalBin, CategoricalBin, Sociogram) a subset of subject nodes is left without a value for the stage's prompt variables, so previews of those stages still have unplaced nodes to interact with. Architect's preview passes the previewed stage index, leaving all other stages fully populated.
