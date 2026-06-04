---
'@codaco/interview': patch
---

Fix the `FamilyPedigree` checklist requiring grandparents for parents who are not genetic relatives of the participant. When the participant was adopted, the checklist asked for the adoptive parents' own parents to be defined and blocked finalizing until they were — even though an adoptive parent's ancestry carries no genetic information about the participant. The same gap meant a gestational surrogate's parents were demanded at the finalize gate, while a gamete donor's parents were treated inconsistently between the checklist and the gate.

Grandparents (a parent's own parents) are now an optional, non-blocking checklist nudge rather than a hard requirement, and the nudge is only shown for genetic parents (`biological` and `donor` edges). A parent's ancestry may be genuinely unknown — anonymous gamete donors being the common case — so it is never forced. The only hard structural requirement is that the participant has at least two parents defined; finalizing is no longer blocked on grandparents for anyone.
