---
'@codaco/fresco-ui': patch
---

`ArrayField` no longer deletes a row when the list stopped accepting changes while its delete confirmation was open. A confirmation is a window the list can change under — a section whose prerequisite has just been unset, an editing lock lost to a collaborator — and the row was removed anyway, because the confirmation only checked at the moment Delete was first pressed. It now checks when the confirmation is answered, and says nothing was removed rather than closing over a deletion of a list that is no longer editable.
