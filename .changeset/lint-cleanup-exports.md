---
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': patch
---

`@codaco/protocol-validation` now exports the version 9 protocol schema as a named value, `ProtocolSchemaV9`, alongside the type of the same name. In `@codaco/fresco-ui`, the `options` prop of `RichSelectGroup` and `ToggleButtonGroup` is now optional, which matches how both components already behaved: without options they render an empty group.
