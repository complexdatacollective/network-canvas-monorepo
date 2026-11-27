---
'@codaco/fresco-ui': patch
---

A form now submits through the submit handler it was last rendered with. Before, a form kept the handler it had when it first appeared, so a form whose handler changed afterwards (for example, after the interview's language changed) submitted with the old one.
