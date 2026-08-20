---
"@codaco/fresco-ui": patch
"@codaco/interview": patch
---

Stop offering click affordances for nodes that cannot be clicked. A collection with no selection, a node list with no tap handler, and a name generator stage with no form each handed their items a click handler that did nothing, so nodes showed a pointer cursor and press feedback for a tap that could never have an effect.
