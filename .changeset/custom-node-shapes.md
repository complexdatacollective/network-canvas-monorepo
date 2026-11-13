---
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

A node type can now be drawn with your own shapes. In Architect, add SVG files to a node type under "Custom shapes", then choose one as the type's default shape or map shapes to the values of an attribute, as with the built-in shapes. The shapes are stored in the protocol.

An SVG keeps its own colours, or follows the interview theme by using theme colour variables such as `var(--node-color)` (the node type's colour), `var(--text)` or `var(--primary)`. A rectangle with the id `label-area` says where the node's label is drawn, and its fill sets the label's colour. Selected, highlighted and linking states are shown on a rounded rectangle around the shape. Scripts, embedded images, styles, filters and links are removed from a file when it is added, and Architect says what was left out.
