---
'@codaco/protocol-validation': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
---

An older protocol whose form asked for the same thing twice can be opened again.

A form may no longer collect one variable twice — the two fields always shared a
single answer, so whichever the participant filled in last overwrote the other,
and the second field was never recording anything of its own. That rule now
holds for protocols being brought forward from an earlier schema version too,
and until now a protocol that broke it simply stopped: upgrading it failed
outright, with a validation error naming the repeated variable, and there was no
way to open it at all.

Upgrading now repairs the form instead of refusing it. The first field asking for
that variable is kept, exactly as written, and the later repeats are dropped —
the same repair Architect already offers for a protocol that is already on the
current schema version, and the same choice of which field survives. Nothing a
participant could have answered is lost, because the repeated fields were never
collecting a separate answer. The change is listed in the upgrade notes shown
when the protocol is opened.
