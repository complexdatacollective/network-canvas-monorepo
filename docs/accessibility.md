# Accessibility

This document states the accessibility standard Network Canvas holds itself
to, which apps it covers, and what the automated checks in this repository do
and do not prove. Acceptance criteria elsewhere — in issues, specs and pull
requests — should link here rather than restate a level. The decisions behind
it are recorded on issues #1317 and #1318.

## Conformance target

**WCAG 2.2, level AA.** This replaces earlier references to "WCAG 2.1+" and to
a 2.1 AA baseline. WCAG 2.2 adds six criteria that an AA target must meet:

- 2.4.11 Focus Not Obscured (Minimum), level AA
- 2.5.7 Dragging Movements, level AA
- 2.5.8 Target Size (Minimum), level AA
- 3.3.8 Accessible Authentication (Minimum), level AA
- 3.2.6 Consistent Help, level A
- 3.3.7 Redundant Entry, level A

2.5.7 means every drag also has a way to do the same thing with single clicks
or taps, without dragging. A keyboard alternative alone does not meet it:
keyboard operation is a separate requirement (2.1.1), and both apply.

## Scope

- **Studio** (`apps/studio`) is held to the target.
- **The interview runtime** (`@codaco/interview`) is the participant-facing
  surface Studio hosts, and is named alongside Studio in the VPAT's scope.
  Interfaces whose task cannot be done without a pointer or without sight get
  accessible alternative tasks through #1316 and #1295; until those exist, those
  interfaces are known gaps, not conformance claims.
- **Architect and Interviewer** improve as they inherit shared
  `@codaco/fresco-ui` components, but are not independently held to the target.
- **Architect Classic and Interviewer Classic** are out of scope.

## Rules that apply to every researcher-facing screen

- **Keyboard parity.** Every researcher operation completes from the keyboard
  alone, and produces the same server mutation as the pointer path. Each
  workflow's end-to-end tests assert this.
- **Reorderable lists** use `useKeyboardReorder` and
  `useAccessibilityAnnouncements` from `@codaco/fresco-ui`. Arrow keys move the
  item, each move is announced with the item's new position, and focus stays on
  the moved item, including at both ends of the list. Architect's timeline is
  the reference implementation. Dragging also needs a click or tap alternative,
  such as move buttons or a menu, for 2.5.7.
- **Data tables** use `@codaco/fresco-ui/DataTable`. Sortable column headers
  carry `aria-sort`, headers are `<th scope="col">`, selected rows carry
  `aria-selected`, page changes are announced, a horizontally scrolling table
  sits in a named, keyboard-reachable region, and every table has an accessible
  name.
- **Validation problems** are controls that move focus to the field they
  describe, and a change in the number of problems is announced politely.
- **Lock and presence state.** A change that affects what the researcher can do
  (gaining or losing the edit lock, a section becoming read-only) is announced
  politely, once per settled change. A list of who else is present can be
  reached on demand but is not announced.
- **Charts and other data visualisations** ship a table or text summary of the
  same data.
- **Unavailable controls with an explanation.** A `disabled` control leaves the
  tab order, so an explanation attached to it through `aria-describedby` is not
  read when someone tabs through the screen. When the reason matters, either
  keep the control focusable with `aria-disabled` and a handler that does
  nothing, so the explanation is read on focus, or show the reason as visible
  text beside it. `NavItem` in `@codaco/fresco-ui` takes the second route for a
  destination that cannot be entered: the row is plain text with its reason on
  its own line, not a disabled link.

## What the automated checks prove

The repository runs several automated accessibility checks:

- the `jsx-a11y` lint rules in `tooling/oxlint/react.json`
- axe in each Storybook project's interaction tests
- committed ARIA-tree snapshots and accessible-name audits in the end-to-end
  suites

Not all of these block a merge yet. Most Storybook projects still report axe
violations without failing (`a11y.test: 'todo'`), and the end-to-end suites do
not yet scan pages with axe. #1318 turns both into blocking checks.

These catch a minority of WCAG failures by construction. They verify structure
and a limited set of programmatic properties: that a control has a name, that
an attribute is valid, that contrast is sufficient for the colours axe can see.
They do not verify that a task can actually be done with a screen reader, with
a switch, at 400% zoom, or by someone who cannot see the screen.

So the claim the automated checks support, once they all block, is narrow:
**no new automated violations, and no unreviewed change to the committed ARIA
trees.** Until then it covers only the checks that already fail CI. It is never
"WCAG conformant". Only the independent audit and testing with assistive
technology users, both organised under #1318, can support a conformance claim,
and the VPAT reports what they find.
