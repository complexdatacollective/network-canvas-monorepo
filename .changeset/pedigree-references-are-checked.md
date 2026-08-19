---
'@codaco/protocol-validation': minor
'@codaco/architect': patch
'@codaco/interviewer': patch
---

A Family Pedigree's own questions are now checked against the codebook, like
every other part of a protocol.

Until now, the attributes a Family Pedigree names in its nomination prompts and
in its family-member form — and the attributes a Narrative Pedigree maps its
diseases to — were never checked for existence. Deleting one of those attributes
from the codebook left the pedigree pointing at nothing, and the protocol still
opened and still exported clean. The interview then collected the nomination
into an attribute the codebook does not describe, so the answers never reached
the data, and the narrative pedigree drew everybody as unaffected. Every one of
those references is now resolved and checked, so the problem is reported where
it is, when the protocol is opened, instead of surfacing as missing data after
fieldwork.

This means a protocol that opened yesterday may be reported as invalid today.
Nothing about it changed: the reference was always broken, and Architect can now
say so. Each report names the attribute and takes you to the prompt or field
that names it, so it can be pointed at an attribute that exists or removed.

Two further rules are tightened for the same reason:

- A Narrative Pedigree disease may no longer be mapped onto a variable the
  Family Pedigree derives from the family tree itself — the participant marker,
  the relationship to the participant, or the kind of each relationship. Doing
  so painted the participant, or every relative, as affected by that condition
  in every interview.
