---
'@codaco/interview': minor
'@codaco/architect': patch
---

Location search keeps the keyboard with you and says what it found, and creating a Mapbox API key finishes properly instead of quietly repeating itself.

**Choosing a place no longer drops the keyboard.** Picking a suggestion closed the search and left nothing focused, so the next Tab skipped straight past "Search location" and landed on the zoom controls. Focus now returns to the search control that opened the panel, whether the suggestion was chosen with Enter, with the space bar, or with a click. Closing the panel because focus moved somewhere else deliberately leaves it there — tabbing out of the search still goes forwards.

**Search now says what happened.** Moving the map to a chosen place, failing to load one, and matching nothing at all are each announced to screen readers, and a search that matches nothing now shows "Nothing matched your search." rather than an empty panel. A search that could not run at all — offline, or a key the map server rejected — says so instead, because it never established that anything failed to match. A late response from a search that has already been cleared is discarded instead of refilling the list, and choosing a place no longer wipes a query typed since.

**Creating an API key in Architect now selects it and closes the dialog.** It used to leave both fields filled with no confirmation of any kind, so pressing Create again added another key with the same name and the same value, distinguishable only by an internal id — and the dialog that created them could not delete them. Creating a key now applies it to the stage, closes the dialog, and announces what was created. Picking an existing key from the Resource Library announces that too, so the field never reads out a key it no longer holds. A name already in use is refused with a message on the name field rather than silently duplicated, and names and values are stored without surrounding whitespace.

Also fixed in Architect: the API key guidance misspelled "retrieving", and the API Key Browser marked two section headings as required when neither was a control anyone had to fill in.
