---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
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
already in rather than on the first sibling. The trailing command sits in the
popup but outside the list, so the list holds only options — and the command
is still reachable, one Tab from the open list. A segment with nothing to
switch to and no command renders inert rather than taking a tab stop, and a
loading segment reserves the space its name will take, so the header does not
reflow. Which presentation a segment is in follows a container query, not the
viewport.

A segment's status is `ready` or `loading`, and there is no failure state.
A list that could not be read is the host's to report: one switcher carrying
its own error surface would put a second, quieter account of the same outage
beside the one the application already makes.

The trigger's accessible name is one interpolated message the host supplies
through `accessibleName`, rather than two separately translated strings this
component joins. Word order is a property of the sentence — English wants
"Team SONIC Lab" and Japanese the equivalent of "SONIC Lab team" — and no
order the component picks is right everywhere. It defaults to the previous
output, and warns in development when a supplied label does not contain the
visible name, which a control's accessible name has to (WCAG 2.5.3).

The listbox is rendered even when the list is empty. Without one, Base UI
moves `role="listbox"` onto the popup, which puts the trailing command inside
the listbox — a structure that holds options and nothing else, and one a
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

`@codaco/tailwind-config` ships alongside because the components need its CSS:
a `--text-2xs` step below `xs`, for the small uppercase word above each name,
and a radius scale that now derives every step from `--radius-base`. That
second change is a fix — only the bare `rounded` utility followed a theme
before, so `rounded-sm` and the rest resolved at `:root` and every themed
region got the default theme's numbers.
