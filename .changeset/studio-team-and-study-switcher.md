---
'@codaco/studio-client': minor
---

The header's two bespoke switchers are replaced by the shared
`TeamAndStudySwitcher`, so the team and the study read as one path rather than
as two controls that happen to sit beside each other.

Every behaviour the pair had is kept. The team shown is the one the URL names,
falling back to the active-team setting only where no route names a team, so
the header cannot announce the team a researcher is leaving. A team list that
fails keeps its segment and offers a retry rather than disappearing, and a list
that fails while an earlier one is still in hand goes on offering that one.
Choosing the team already current does nothing. A researcher who belongs to no
team gets no segment at all, and a loading list shows a skeleton rather than
reflowing the header.

The study segment is absent, not empty, on routes that open no study.

Two things it shows are placeholders, in one module that says so, because
nothing can answer them yet: a team's study count, and a study's status. A
team's role is not among them — it is shown for the team whose membership is
actually known and omitted elsewhere, because a made-up role would be a false
claim about what a researcher may do.
