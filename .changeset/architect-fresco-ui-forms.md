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
- Opening a second editor dialog immediately after saving one no longer leaves its save button inert. The closing dialog briefly remains on screen, and the new dialog's button could attach itself to the dialog on its way out, so pressing it did nothing at all.
- A name generator's side panels are now saved with their identifiers intact, including a panel added after turning the side panel feature off and on again. Previously such a stage could be written in a state the protocol validator rejects, reporting the protocol as misconfigured. Deleting the last panel now removes the setting cleanly instead of leaving an empty panel behind, and no longer closes the section while you are still working in it.
- Returning to the start screen straight after an edit now offers to save that edit. Within a moment of typing, Architect could still regard the stage as unchanged and quietly discard the change.
- Deleting one of a name generator's two side panels no longer empties the panel that remains. Its title and data source were lost as the list closed up, leaving a panel the protocol validator rejects.
- A sociogram prompt that creates an edge now saves the edges it displays. The section that lists them stayed shut when the new edge type was added automatically, and its setting was dropped from the saved prompt — contradicting the note the section itself shows, that the edge being created is always displayed.
- Creating one new variable straight after another no longer carries the first one's type over. Where the two types were incompatible the window became impossible to save and had to be abandoned; where they were not, the variable was quietly stored with the wrong type and nothing on screen said so.
- Creating one new node or edge type straight after another no longer starts the second one from the first one's name, colour, shape and icon. Reopening a type you had abandoned mid-edit no longer brings those abandoned edits back either.
- Turning a node type's shape mapping off and straight back on no longer saves the type with the mapping still missing while the switch reads as on.
- Switching a form field's date control away and back no longer leaves "Use interview date" switched off with an empty anchor date, demanding a value for a field nobody changed.
- Undo now works on the background of a sociogram or narrative stage. Undoing a switch between concentric circles and an image left the old chooser on screen, so the stage could not be saved until the researcher switched modes by hand. Adding the first side panel is likewise undoable now, and undoing a later edit to it no longer removes the whole panel.
- An app update arriving moments after an edit no longer reloads over it. Architect checks for unsaved work again at the instant it would apply the update, rather than relying on a reading taken a fraction of a second earlier.

Half-finished settings can no longer be saved. Previously the field showed an error but "Finished Editing" accepted it anyway, and the problem resurfaced later as a protocol-wide "Misconfigured Protocol" message far from the field that caused it:

- a sort rule or card display property with only one of its two columns filled in;
- an assigned variable with no variable chosen, or no True/False value;
- an option value containing characters other than letters, numbers and `._-:`.

These restore checks that existed before this release. If an existing protocol already contains one of these — most likely an option value with a space in it, or a blank card display label — the editor will now ask you to correct it before saving that variable. Changing an option value changes the corresponding column name in exported data, so where data collection is already under way, consider whether to keep the existing value.
