---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': major
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/development-protocol': patch
---

An Anonymisation stage's explanation is now one text. Its title, which was a
separate field, is the explanation's first line, written as a heading, so the
stage has one text to edit and translate. Architect shows a single
Explanation field in the Task explanation section, with Heading 1 in its
toolbar for the title, and the title no longer has a length limit.
Participants see the same screen as before.

Upgrading a protocol from schema 8 moves each Anonymisation title to the
start of its explanation as a heading, escaped so it shows exactly as it was
written. The migration notes describe this in every supported language.

For developers: the schema 9 Anonymisation stage's `explanationText` is a
localized markdown string rather than `{ title, body }`, and
`SyntheticInterview` takes it as one string.
