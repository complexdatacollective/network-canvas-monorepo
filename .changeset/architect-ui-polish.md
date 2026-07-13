---
"@codaco/architect": patch
---

Fixed a range of protocol-editor UI issues:

- The install banner and the "this protocol is already open in another tab"
  banner now both appear as strips at the top of the screen, with white,
  intent-coloured action buttons.
- The "Create/Edit Field" dialog is split into distinct sections (Variable,
  Question, Input Control, Categorical/Ordinal Options, Validation), and the
  Validation list now uses inline editing with a collapsed summary per rule.
- Categorical/ordinal option rows and the protocol description field use cleaner,
  consistent styling with no clashing background or border layers.
- Empty toggleable sections centre their "enable this feature" message correctly.
- Selecting a node type for a stage no longer clears itself when you edit another
  field or save, so stages can no longer be saved in an invalid state.
