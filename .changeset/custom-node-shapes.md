---
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

A node type can now be drawn with your own shapes. In Architect, use "Add a shape" under a node type's "Custom shapes" to import an SVG file or choose an SVG image already among the protocol's resources, then choose a shape as the type's default or map shapes to the values of an attribute, as with the built-in shapes. Each shape is saved as a resource of the protocol.

An SVG keeps its own colours, or follows the interview theme by using theme colour variables such as `var(--node-color)` (the node type's colour), `var(--text)` or `var(--primary)`. A rectangle with the id `label-area` says where the node's label is drawn, and its fill sets the label's colour. A rectangle with the id `label-plate` behind it grows downwards when a long label needs more lines. Selected, highlighted and linking states are shown on a rounded rectangle around the shape. Architect checks a file when it is added: one that cannot be used as a shape is refused with the reason, and scripts, embedded images, styles, filters and links are removed, with a notice saying what was left out.
