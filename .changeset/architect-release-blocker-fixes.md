---
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/protocol-validation': minor
'@codaco/shared-consts': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'@codaco/protocol-utilities': patch
'fresco': patch
---

This release improves the reliability, accessibility, and recovery of protocol editing and interviews.

- Stage edits are now transactional: cancelling restores Codebook changes, incomplete settings remain open with actionable errors, and Information blocks retain their drafts while switching media types.
- Architect's forms, rule builders, Codebook, timeline, dialogs, and resource library now provide accurate labels, keyboard operation, focus restoration, and layouts that work on smaller screens. Undo and Redo operate one change at a time without recording no-op edits.
- A second tab now shows a read-only protocol instead of accepting changes it cannot save. Closing the editing tab restores editing from the saved copy, and deleting a protocol clears its history and releases associated resources.
- Required interview questions no longer appear answered before the participant chooses a value. Submission moves to the first unanswered question, optional blanks no longer produce irrelevant validation errors, and rosters, location search, and external panels report loading and failure states clearly.
- Protocol validation now catches duplicate form variables, invalid references, and attempts to write attributes owned by Family or Narrative Pedigree interfaces. Existing protocols with these problems may now be reported as invalid; Architect explains proposed repairs and does not change the file without confirmation.
- Import, download, synchronization, and validation failures now use actionable messages instead of exposing internal errors. Fresco activity reporting is reliable again, while analytics omits researcher and participant descriptions.

For consumers of `@codaco/fresco-ui`, `ArrayField` no longer imposes a minimum width. It fills and shrinks with its container, so hosts that relied on the field to hold a column open must set that width themselves.
