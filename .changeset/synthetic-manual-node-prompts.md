---
'@codaco/protocol-utilities': minor
---

`SyntheticInterview.addManualNode` accepts an optional `{ promptIndices }`
argument naming the prompts of its stage that nominated the node. Name
generators list only the people nominated on their current prompt, so a
manually seeded node without prompt indices exists in the network but does not
appear on the name generator that created it.
