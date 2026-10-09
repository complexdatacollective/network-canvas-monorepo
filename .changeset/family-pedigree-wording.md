---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/fresco-ui': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
'@codaco/development-protocol': patch
---

A Family Pedigree's name question and the wording of its checklist are now
stage settings that researchers can change and translate, instead of
built-in interview text. The name question and its hint are new
`nodeConfiguration.nameField.prompt` and `hint` settings, and the checklist's
items, its "none" buttons, the side panel's questions about brothers, sisters
and children, and the note under a recommended checklist are new
`completeness.itemText` and `completeness.recommendedNote` settings. A new
stage, or a checklist switched on, starts with the wording the interview used
to show, in each of the protocol's languages Network Canvas has it in, and
Architect fills it into a language added later while the researcher has not
changed it in the default language. Upgrading a protocol from schema 8 gives
each Family Pedigree the wording it has always shown.

Most of the checklist's texts read differently when they are about the
participant and when they are about someone else, and can show the person's
name or the number of parents missing. A localized message may now use the
arguments its setting declares (`select`, `plural` and plain text arguments),
and `messageVariants`, `composeMessage` and `findMessageArgumentProblem` let
an editor show and write a message as its versions. Architect's stage editor,
translation table and protocol summary show each version separately, with
placeholders as named chips. `@codaco/fresco-ui`'s rich text editor takes a
`tokens` prop to insert such placeholders.
