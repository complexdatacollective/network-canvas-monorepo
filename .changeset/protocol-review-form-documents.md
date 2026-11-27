---
'@codaco/protocol-review-worker': patch
---

The protocol reference given to the reviewing model describes a form as it is now stored: one localized Markdown string in `content`, which places each field as a field block. It also describes logic blocks, which the model is told to keep exactly as written while it edits the words inside their versions, and a stage's dynamic attributes, whose default-language wording the model may rewrite but whose logic it must not change. The reference also says that a logic block cannot depend on a field inside it, or on a field in another version of a logic block that contains it.
