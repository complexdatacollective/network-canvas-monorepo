---
'@codaco/fresco-ui': minor
---

Two new components for naming where a researcher is: `IdentityMark` and
`navigation/TeamAndStudySwitcher`.

`IdentityMark` gives an entity a stable visual identity — a monogram on a fill
chosen by hashing the entity's id. The fill derives from the id alone, so the
same entity is the same colour in every session with nothing persisted, and
renaming it never recolours it. The fill and foreground pairings are measured
rather than assumed: mustard, sea green and sea serpent take the dark
foreground, because white on them is 1.82:1, 2.27:1 and 2.23:1. The mark is
`aria-hidden` — every caller renders the entity's real name beside it.

`TeamAndStudySwitcher` is the control that names the team whose work is on
screen and the study open inside it, and moves between siblings of either. One
component rather than a frame composed around separate switchers: the frame and
the segments have to agree about radius, height and where a painted surface
stops, and as separate components they disagreed about each in turn. The frame
owns the border, the radius and the clip; the segments have no corners of their
own.

It is a listbox rather than a menu, so opening lands on the entity you are
already in rather than on the first sibling. The trailing command and the
failure retry sit in the popup but outside the list, so the list holds only
options — and the command is still reachable, one Tab from the open list. A
segment with nothing to switch to, no command and no failure renders inert
rather than taking a tab stop; a segment whose list failed keeps its place and
offers a retry, because a control that vanishes strands the researcher; and a
loading segment reserves the space its name will take, so the header does not
reflow. Which presentation a segment is in follows a container query, not the
viewport.

The trigger's accessible name is one interpolated message the host supplies
through `accessibleName`, rather than two separately translated strings this
component joins. Word order is a property of the sentence — English wants
"Team SONIC Lab" and Japanese the equivalent of "SONIC Lab team" — and no
order the component picks is right everywhere. It defaults to the previous
output, and warns in development when a supplied label does not contain the
visible name, which a control's accessible name has to (WCAG 2.5.3).

A failed list renders its listbox even when empty. Without one, Base UI moves
`role="listbox"` onto the popup, which put the failure message and its retry
inside the listbox — a structure that holds options and nothing else, and one a
screen reader may skip or misannounce.

The supporting line under a name keeps full strength on the selected row.
Dimmed, it composites toward `--selected` and falls to 2.90:1 against it.

Every text run in the control sits on its caps and baseline rather than on its
line box, matching the rest of the library. Two spacings that the leading used
to provide by accident — between the kicker and the name, and between a name
and its supporting line — are now stated, and a name that has to shorten clips
sideways only, because a cap-height box would otherwise lose its descenders.

The type scale gains `text-2xs`, one step below `xs`, for the small uppercase
labels that qualify a value rather than being one.
