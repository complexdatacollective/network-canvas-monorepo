---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Text boxes lay out what is typed in its own direction. A Latin name typed in
an Arabic interface keeps its punctuation at its end ("team-b!", not
"!team-b"), and Arabic typed in an English interface does the same; each line
of a longer text, and each paragraph of rich text, follows its own first
letter. Phone numbers, numbers, email addresses, web addresses and passwords
stay left to right. Text still starts on the interface's side, and an empty
box shows its placeholder there.

For hosts, `@codaco/fresco-ui/form/textEntryDirection` gives the direction
and class for a box they draw themselves, and the `text-own-direction` and
`text-interface-side` utilities are in the shared Tailwind config.
