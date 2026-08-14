---
'@codaco/interview': patch
'@codaco/architect': patch
---

Fixed a crash when editing a person in a Family Pedigree. Selecting someone in the pedigree and choosing "Edit" ended the interview screen with an error instead of opening their details, and recovering from that error discarded the pedigree that had been built so far. Editing a person now opens normally, saves both their name and any details the protocol asks for, and leaves the rest of the pedigree untouched. Saving a person's details is also now announced to screen readers, as adding and removing family members already was.

The same crash affected every Family Pedigree, so it applies to interviews as well as to Architect's stage preview.
