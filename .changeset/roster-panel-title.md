---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/sample-protocol': patch
'@codaco/development-protocol': patch
---

A Name Generator for Roster Data stage now has a required panel title, the
heading above the people a participant can add, which the interview used to
show as built-in "Available to add" text. Researchers can change and translate
it like any other protocol text, in a new **Roster panel** section of the stage
editor, and Architect's protocol summary lists it. A new roster stage starts
with "Available to add" in each of the protocol's languages that Network Canvas
has wording for, and Architect fills it into a language added later, or a
language the protocol's text is corrected to, while the researcher has not
changed it in the default language. Upgrading a protocol from schema 8 gives
each roster stage the heading the interview has always shown, and the bundled
sample and development protocols carry it.
