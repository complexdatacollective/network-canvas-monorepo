---
'@codaco/studio-client': minor
'@codaco/studio-rpc': minor
'@codaco/studio-server': minor
---

The header's two bespoke switchers are replaced by the shared
`TeamAndStudySwitcher`, so the team and the study read as one path rather than
as two controls that happen to sit beside each other.

The team shown is the one the URL names, falling back to the active-team
setting only where no route names a team, so the header cannot announce the
team a researcher is leaving — and that fallback is resolved through the
membership list, so a setting that outlived its membership names nothing
rather than offering to administer a team the researcher has left. A team list
that fails while an earlier one is still in hand goes on offering that one.
Choosing the team already current does nothing. A researcher who belongs to no
team gets no segment at all, and a loading list shows a skeleton rather than
reflowing the header.

Reporting a team list that could not be read at all belongs to the shell, not
to the switcher, which shows what it was given and nothing about why.

The study segment is absent, not empty, on routes that open no study.

Two things it shows are placeholders, in one module that says so, because
nothing can answer them yet: a team's study count, and a study's status. A
team's role is not among them — it is shown for the team whose membership is
actually known and omitted elsewhere, because a made-up role would be a false
claim about what a researcher may do.

`me` carries the caller's memberships now — every team they belong to, and
their role in it — which is why `@codaco/studio-rpc` and
`@codaco/studio-server` are versioned alongside the client. Better Auth's own
team list joins the member table and then returns only the organization, so
nothing else could tell the switcher what a researcher is in each of their
teams. The role travels as a plain string rather than the role enum, because
a legacy membership is stored as one comma-separated value and an enum would
fail the whole response over it.
