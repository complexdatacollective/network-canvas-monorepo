---
'@codaco/protocol-review-worker': patch
---

The automated protocol review now knows that every schema 9 protocol object, including each option of an ordinal or categorical variable, has a UUID id that is unique across the protocol, and points its suggested fixes at form fields, additional attributes and options by id. A new option in a suggested fix gets an id of its own. The review also describes piped text as it is now stored: a placeholder names its value directly by id, such as `{ego_<variable id>}` or `{node_label}`, in place of a stage's `dynamicValues`.
