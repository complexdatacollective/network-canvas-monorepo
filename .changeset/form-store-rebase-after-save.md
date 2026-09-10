---
'@codaco/fresco-ui': patch
'@codaco/protocol-builder': patch
---

The stage editor's dirty indicator now clears once a save actually takes. Previously, a successfully saved stage kept reporting unsaved changes, so a host that warns before leaving a dirty form (Studio's navigation blocker) would ask a researcher to confirm discarding work that had already been saved. The form store gained a `rebaseForm` action that moves every field's baseline to its current value without discarding it, and the stage editor now calls it after a save the protocol accepts.
