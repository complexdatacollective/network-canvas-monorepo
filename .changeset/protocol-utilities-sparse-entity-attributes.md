---
'@codaco/protocol-utilities': major
---

Synthetic interview attribute setters now accept only defined `VariableValue` values, and generated networks no longer fill unanswered attributes with null placeholders.

This is a breaking API change. Use `unsetNodeAttribute` or `unsetEdgeAttribute` when a generated entity should keep an attribute absent.
