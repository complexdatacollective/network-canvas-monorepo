---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
---

A removed row of an `ArrayField` stays mounted while it animates away, and for
that moment it was still a row: in the accessibility tree, in the tab ring, and
answering to every query for one of its controls. It is `aria-hidden` and
`inert` for the rest of its life now, so nothing that asks the list what it
contains can reach a row that has gone.

That window was long enough to send focus to a control that no longer exists.
Architect's list field decides where focus goes after a removal by asking the
list which Remove controls it holds — the row that took the removed one's place
— and asked inside the window it counted the dying row and answered with its
own Remove button. Focus landed on a node destroyed a fraction of a second
later and fell back to the page header, which is the outcome naming a target
exists to prevent.
