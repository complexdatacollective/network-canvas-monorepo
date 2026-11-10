---
'@codaco/protocol-validation': minor
'@codaco/shared-consts': major
'@codaco/architect': minor
---

Two options of one attribute can no longer have labels that read the same in
any language a participant can see, including where one label has no
translation and falls back to another language's text. This covers
categorical, ordinal and yes-or-no attributes. Validation refuses such a
protocol, and upgrading a protocol to schema 9 keeps the first label and adds
each later option's value, or its position, in parentheses, so the labels
differ. Option values are not changed.

Architect's translation table now applies the same rules to each translation
as the editor that owns the text. A repeated disease name or option label, a
stage name longer than 50 characters, and interview text with no words in the
default language are each shown in the cell. Saving checks the whole protocol
first: if the translations would leave it broken, nothing is saved, and
Architect shows the cell at fault, even when a search or a hidden language
column was hiding it. The two answers of a yes-or-no attribute must now differ
by more than capital letters.

`@codaco/shared-consts` no longer exports `isUnwrittenLabel` or
`hasDuplicateOptionLabels`. Use `findDuplicateOptionLabels` from
`@codaco/protocol-validation` instead.
