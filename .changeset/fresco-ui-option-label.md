---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Add `OptionLabel` and `optionLabelText` (`@codaco/fresco-ui/OptionLabel`), the shared way to show an option label: the component renders its markdown, and the helper gives the same label as plain text for an accessible name or other attribute. Every Fresco UI option field now renders its labels through them.

Screen readers now read a toggle-button option and the chosen value of a Likert scale as the words shown, rather than as their markdown or escaped characters.
