---
'@codaco/interview': patch
---

Node labels now resolve synchronously on first render whenever the label attribute is not encrypted. Previously every label — encrypted or not — was resolved through an asynchronous effect, which briefly exposed the node type's fallback name to assistive technology (and to name-based queries) each time a node mounted. The asynchronous path is now used only when an anonymisation-encrypted label genuinely needs decryption.
