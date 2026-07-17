---
'@codaco/architect': patch
---

Renaming an ego variable to a name already in use now shows an inline "already in use" message on the field, matching how node and edge variables behave. Previously it slipped past the inline check and surfaced a confusing "Misconfigured Protocol" dialog instead.
