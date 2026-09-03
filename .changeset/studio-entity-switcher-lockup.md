---
'@codaco/studio-client': minor
---

The header's two bespoke chips become one team ▸ study lockup. The team the
researcher is acting in and the study they have open now read as a single
object rather than as two controls that happen to sit next to each other, and
outside a study the second segment is absent rather than blank.

Both segments are configurations of the shared `EntitySwitcher`, so the
keyboard behaviour, the selection semantics, the failure handling and the
collapse rule live in one place. Every distinction the chips had is kept: the team named
is the one the committed URL names, falling back to the active-team setting
only where no route names a team; a team list that could not be read keeps its
switcher and offers a retry instead of vanishing or reading as "no teams"; a
list that fails while an earlier one is still in hand keeps showing that
earlier list, with the failure and its retry beneath it; choosing the team
already current does nothing; a researcher with no teams gets no switcher at
all; and a list that has not arrived shows a skeleton rather than letting the
header jump sideways when it does.

The study segment now names the study rather than showing its identifier
wherever the team's own studies list contains it, and offers that team's other
studies as siblings. Where it does not — a link into a study no team of this
researcher's answers for, which is what §6.3's `study.shell` will resolve — the
switcher still names the study by its identifier and offers no siblings, rather
than presenting another team's studies as this one's. Studies carry no status
dot: nothing in the protocol summary says whether a study is collecting, draft
or closed, and the dot arrives with the studies model.
