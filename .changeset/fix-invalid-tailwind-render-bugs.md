---
'@codaco/fresco-ui': patch
'@codaco/interview': patch
---

Fix invalid Tailwind utility classes that silently rendered nothing: the Spinner's
backface-visibility (now `backface-hidden`), and the encrypted background's 3D
transform (`transform-3d`) and monospace font (`font-monospace`).
