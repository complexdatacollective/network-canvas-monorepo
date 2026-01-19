---
"@codaco/protocol-validation": major
"architect-vite": minor
---

Split Family Tree sexVariable into egoSexVariable and nodeSexVariable.

This is a breaking change for existing protocols that reference the old sexVariable field. Protocols with Farmily Tree interfaces require that the egoSexVariable and nodeSexVariable be defined separately.
