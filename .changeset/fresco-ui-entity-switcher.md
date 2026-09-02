---
'@codaco/fresco-ui': minor
---

Add three components for naming where a researcher is: `IdentityMark`,
`navigation/EntitySwitcher` and `navigation/SwitcherLockup`.

`IdentityMark` is a small tile giving an entity a stable visual identity: a
monogram of its name over an appearance derived from a hash of the entity id
alone. Derived, never stored, so the same team looks the same in every session
with nothing persisted anywhere, no assignment table to keep in sync, and a
rename that changes the monogram and nothing else. It is `aria-hidden`: a
two-letter monogram identifies nothing to a reader who cannot see it, and every
caller renders the entity's real name beside it.

`EntitySwitcher` is the control that names the entity being acted in and offers
its siblings — a team switcher and a study switcher are two configurations of
it, not two components. Siblings are `menuitemradio`s, so exactly one being
current reaches a screen reader without a visual tick, and choosing the one
already current is a no-op rather than a re-navigation. The trigger's
accessible name is the whole translated kicker qualifying the entity name,
joined by the accessible-name algorithm over two `aria-labelledby` references
rather than by a template that would bake English word order in. A failed list
keeps its trigger and offers a retry alongside any items already in hand,
because an errored list is not an empty one and a switcher that vanishes tells
the researcher nothing. With nothing to switch to, no command and no failure to
retry, the trigger renders inert rather than spending a tab stop on a menu that
names only where you already are. Loading reserves the name's width so a header
does not reflow when the query settles.

`SwitcherLockup` joins one or two switchers into a single bordered object that
reads as a path. A conditional second child leaves a lockup with one segment
rather than one with an empty second. Collapse is a container query rather than
a viewport breakpoint, so the same pair behaves correctly in a wide app header
and in a narrow panel.
