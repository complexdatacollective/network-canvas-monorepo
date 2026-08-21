---
'@codaco/architect': minor
---

Architect's editors now use the shared Fresco UI form system instead of redux-form.

- Fields have consistent labels, descriptions, required states, and errors that are announced with the control and focused when saving is blocked.
- Disabling a feature or changing a roster, entity type, or source stage clears settings that no longer apply. These multi-field changes are recorded as one Undo step rather than a sequence of invalid intermediate states.
- Repeated sections and editor dialogs retain the correct options, identifiers, and values when items are added, removed, reordered, or reopened. Newly created variables and entity types start clean instead of inheriting the previous editor's state.
- Unsaved edits are detected when navigating, refreshing, closing the browser, or applying an app update. Undo and Redo also cover collapsed sections, backgrounds, side panels, and automatic stage naming.
- Half-finished sort, display, assignment, and option settings can no longer be saved as a misconfigured protocol.

Existing protocols containing option values with spaces or blank display labels must be corrected before those variables can be saved. Changing an option value also changes its column name in exported data, so projects already collecting data should choose the replacement carefully.
