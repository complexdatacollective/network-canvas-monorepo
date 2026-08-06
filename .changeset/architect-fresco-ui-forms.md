---
'@codaco/architect': minor
---

Architect's editors now run on the shared Fresco UI form system, replacing the unmaintained redux-form library that previously held every editor's state.

Field labelling is now consistent throughout: every field carries a real label, and the explanatory text that used to sit beside a field is attached to the field itself, so it is announced with the field by screen readers instead of floating next to it. Several fields that previously had no accessible name, or shared an identical one across repeated panels, are now labelled distinctly.

Fixes a number of editing bugs found along the way:

- Changing a family pedigree stage's node or edge type now clears the previous type's variable references instead of silently keeping them, and switching a narrative pedigree's source stage now resets its diseases.
- Turning a feature off — skip logic, filters, sort and search options, side panels — now reliably clears its configuration, where previously the old settings could reappear when the section was reopened.
- Card display options are no longer dropped from a saved stage when the roster they read from is slow to load or can no longer be parsed.
- An option list edited inside a dialog no longer reverts to its previous value when the dialog is saved.
- Undo and redo now cover edits made in sections that are currently collapsed.
