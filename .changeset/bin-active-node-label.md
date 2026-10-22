---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/architect': minor
'fresco': minor
'@codaco/interviewer': minor
---

A schema 9 Ordinal Bin or Categorical Bin set to tap to place (`behaviours.interactionMode: 'select'`) can name the node being placed in its prompts. The prompt offers that node's label (`node.$label`) and attributes (`node.<id>`) under Contextual Attributes in Architect's insert menu, and the interview fills them in as the participant moves from node to node. Once every node is placed there is no node being placed, so the label can be missing there and the prompt needs an "If not known" version for it, which the interview shows at that point. A bin set to drag and drop still offers no node values, and neither does the label of a Categorical Bin's "other" bin, which is now stage text rather than a prompt.
