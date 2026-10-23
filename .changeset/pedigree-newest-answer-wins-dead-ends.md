---
'@codaco/protocol-validation': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/development-protocol': patch
---

In the Family Pedigree, more answers saved by mistake can now be corrected without deleting anyone. The newest answer wins:

- Recording, when adding a parent or connecting two people, that someone carried the pregnancy (a Surrogate included) is no longer unavailable when another parent is recorded as having carried it. That parent is left with nothing recorded about carrying.
- Choosing a biological parent or donor while a biological parent with the same sex at birth is recorded is no longer unavailable. The form asks how the participant would define that parent's relationship instead.
- Answering that two twins are identical gives both of them the same biological parents and donors, where that is possible.

A hint under the answer says what choosing it will change, and Undo reverses it once saved. The question about a parent's kind now reads "How would you define the relationship of “Julie” to you?" instead of "Julie is your…". The stage wording gains `carrierReplaced`, `geneticParentReplaced` and `identicalTwinSharesParents`.
