---
'@codaco/protocol-validation': patch
'@codaco/interview': patch
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/development-protocol': patch
---

In the Family Pedigree, twins share one carrier: answering who carried one twin answers it for the other, and the add-child and add-sibling forms now require "Who carried the pregnancy?" to be answered. Continue on a step with a required question left unanswered now shows the same error Save does, instead of doing nothing visible. When participants add a partner, "Are they still together?" names the person ("Are they still together with “Dina”?"). "Yes, identical twins" is unavailable for two people recorded as female and male at birth, with a reason that says which sex at birth to change, through the new `unavailableIdenticalTwinSex` and `unavailableIdenticalTwinSexNew` wording. `validateField` in `@codaco/fresco-ui`'s form store takes a `showErrors` option that marks the field touched so its error shows.
