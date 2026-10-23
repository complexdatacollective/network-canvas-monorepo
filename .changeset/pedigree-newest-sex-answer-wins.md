---
'@codaco/protocol-validation': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/development-protocol': patch
---

In the Family Pedigree, a sex at birth saved by mistake can now be corrected from the person's own panel. Previously a parent recorded as having carried the pregnancy could not be changed to male, and a genetic parent could not be given the same sex at birth as the other genetic parent, so swapping two parents' answers meant changing a relationship first. Now the newest answer wins: every sex at birth stays available, and saving one that contradicts another record clears that record so it can be answered again. The record that the person carried a pregnancy is removed, and the other genetic parent's sex at birth is cleared. The hint under the field says what saving will change before the participant saves, and Undo reverses it. Only a surrogate still cannot be recorded as male. The stage wording `unavailableSameSexAsCoParent` is replaced by `sexChangeClearsCoParentSex` and `sexChangeEndsCarrying`, and `unavailableCarried` now applies only to surrogates.
