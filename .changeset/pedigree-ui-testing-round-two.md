---
'@codaco/protocol-validation': patch
'@codaco/interview': patch
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/development-protocol': patch
---

In the Family Pedigree, twins share one carrier: answering who carried one twin answers it for the other, and the add-child and add-sibling forms now require "Who carried the pregnancy?" to be answered. Continue on a step with a required question left unanswered now shows the same error Save does, instead of doing nothing visible. When participants add a partner, "Are they still together?" names the person ("Are they still together with “Dina”?"). "Yes, identical twins" is unavailable for two people recorded as female and male at birth, with a reason that says which sex at birth to change, through the new `unavailableIdenticalTwinSex` and `unavailableIdenticalTwinSexNew` wording. Questions no longer put a possessive after a quoted name ("Are they a twin of “Cara”?" instead of "Are they “Cara”’s twin?"), and the hint under an unavailable "Yes, identical twins" now names whose parents and donors to choose. A new sibling who would not share the person who carried someone cannot be their twin, so every "yes" answer to "Are they a twin of …?" is unavailable, with a reason naming who to choose, through the new `unavailableTwinCarrierNew` wording. When editing someone's twins, "Yes, identical" is unavailable for a twin recorded with a different sex at birth from another twin already answered identical, since all of them would then be identical. Editing someone no longer offers as their twin a sibling someone else carried, and adding a sibling checks "Yes, identical twins" against the sex at birth of every twin identical to the person. Adding a parent asks whether they carried the pregnancy only once their kind of parent is chosen. `validateField` in `@codaco/fresco-ui`'s form store takes a `showErrors` option that marks the field touched so its error shows.
