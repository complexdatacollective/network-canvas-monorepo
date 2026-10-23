---
'@codaco/protocol-validation': minor
'@codaco/architect': minor
---

A Categorical Bin prompt can now show at most 10 bins, which is as many as the
interview screen can lay out. The follow-up "other" bin counts towards the 10
when it is turned on.

**Protocols (`@codaco/protocol-validation`)**

- Schema 9 rejects a Categorical Bin prompt whose attribute has more values
  than fit, counting the "other" bin when `otherVariable` is set. The limit is
  exported as `CATEGORICAL_BIN_MAX_BINS`.
- An older protocol that goes over the limit can no longer be upgraded to
  schema 9. Remove values in Architect 8 first, then open it again.

**Architect**

- The Categorical Bin prompt editor shows an error once a prompt would draw
  more than 10 bins, and refuses to save it until values are removed. This
  replaces the earlier warning at eight bins.
- When a list of attribute values has an error, the red outline around each
  value now follows its rounded corners instead of being cut off at them.
