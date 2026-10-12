---
'@codaco/studio-web': patch
---

Dialogs no longer close as if nothing happened while the work they started
carries on:

- The attribute window in the stage editor cannot be dismissed while it is
  adding a new attribute to the codebook.
- The interview's finish confirmation cannot be cancelled once the interview
  has started finishing, because the finish completes regardless.
