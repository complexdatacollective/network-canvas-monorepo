---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The screen error message, the interview text shown when a task cannot be
displayed, can now be formatted. Architect's translation table edits it with
the rich text editor, so a researcher can add bold or italic text, lists and
links, for example to a page where participants can get help. The interview
and the printable protocol summary show it formatted. The wording Network
Canvas supplies, and the wording of protocols upgraded from schema 8, reads
as before.

For developers: the schema 9 `interfaceText.messages.stageError` is a
localized markdown string, and an interface text entry may declare its
`format`.
