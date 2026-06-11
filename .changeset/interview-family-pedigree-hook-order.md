---
'@codaco/interview': patch
---

Move `allNodes`, `allEdges`, and `stageMetadata` selector calls before the
`variableConfig` object in `FamilyPedigree` so hook call order is consistent
across renders. Also trims the `getStageIndex` JSDoc to its essential
invariant.
