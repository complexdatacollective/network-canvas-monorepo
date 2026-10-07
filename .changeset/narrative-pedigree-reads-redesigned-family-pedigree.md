---
'@codaco/protocol-validation': major
'@codaco/protocol-utilities': major
'@codaco/interview': minor
'@codaco/development-protocol': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

The Narrative Pedigree reads the redesigned Family Pedigree.

In schema 9, each Narrative Pedigree disease names the boolean person
attribute that marks who has it as `attribute` (it was `variable`), matching
the Family Pedigree's nomination prompts. `NarrativeDiseaseEntry` in
`@codaco/protocol-utilities` takes `attribute` too, and the Family Pedigree
stage handle of `SyntheticInterview` lists the attribute each nomination
prompt sets as `nominations`.

In the interview, the Narrative Pedigree draws the participant and everyone
connected to them through the source pedigree's relationships, on the Family
Pedigree's pan-and-zoom canvas. People are labelled as the Family Pedigree
labels them ("You", their name, or how they are related), and encrypted names
are read through the passphrase prompt. Sex-linked inheritance reads sex
assigned at birth: an intersex person is treated as uncertain, and a parent
whose sex is not known is placed by the gamete their co-parent's sex implies.
The family can be operated from the keyboard: it is a single tab stop, the
arrow keys move between people, Enter or Space focuses on someone, and + and −
zoom. Arrow keys no longer start a drag of the Family Pedigree's canvas, so
Enter after an arrow key reaches the person it selects. The interface for the
released schema 8 Family Pedigree is removed.

Architect offers the Narrative Pedigree again, summarises it in the protocol
summary, and does not let a Family Pedigree's person type change while a
Narrative Pedigree reads it. The development protocol has a Narrative
Pedigree stage again.
