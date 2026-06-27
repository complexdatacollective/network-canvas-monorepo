# Family Pedigree — interface fixes (add-sibling discoverability, first-cousin demonstration)

**Date:** 2026-06-26
**Package:** `@codaco/interview` (`FamilyPedigree` interface)
**Status:** Design approved, pending implementation plan

This is **Feature #2 of three** in the family-pedigree redesign. It is the small,
low-risk one: a discoverability fix (F) and a demonstration/verification of an
existing capability (G). The other two features — (#1) configurable framing and
(#3) the Narrative Pedigree interface — have their own specs.

## Problem

**F — "Add sibling" appears to be missing.** The node context menu only renders
the "Add sibling" item when `canAddSibling` is true, where
`canAddSibling = isEgo || the person has a non-partner, non-social parent edge`
(`pedigree-layout/components/PedigreeView.tsx`,
`pedigree-layout/components/NodeContextMenu.tsx`). For any non-ego person with no
recorded parent, the option is **hidden entirely**, so it reads as missing.

The guard is not arbitrary. A sibling is defined by a **shared parent**:
`siblingCellTransform` builds the new sibling and attaches it to the parents the
author selects in `BioTriadStep`, whose candidate list is the anchor's existing
parents (`geneticParentCandidates(anchorId, 'sibling', …)`). The transform does
**not** use the anchor itself (`_anchorNodeId`, `_edges` are unused) — so if the
anchor has no parents to share, there is nothing to attach a genuine sibling to.
Hiding the item prevents creating a disconnected non-sibling.

**G — Can first cousins be represented and created?** Representation already
works: `getDisplayLabel` maps the path `parent,parent,child,child → 'cousin'`
("Cousin"), and `PedigreeLayout.stories.tsx` already lays out cousin nodes.
Creation via the wizards works too, but only through the natural path — add a
grandparent to ego's parent, then add a sibling (aunt/uncle) to that parent, then
a child (the cousin) — which is **blocked today** by exactly the F guard: ego's
parent usually has no parents recorded, so "Add sibling" is hidden on them.

## Design

Keep the structural rule; make the capability **discoverable** rather than
invisible; then prove the cousin path end-to-end with stories.

### F — Discoverable "Add sibling"

- **Keep** the `canAddSibling` predicate and `siblingCellTransform` unchanged. A
  sibling still requires an existing shared parent; correct graph structure is
  preserved.
- In `NodeContextMenu.tsx`, **always render** the "Add sibling" item. When
  `canAddSibling` is false, render it **disabled and non-actionable** with an
  **inline explanatory hint** ("Add a parent first") as muted caption text on the
  item — not a hover tooltip. Rationale: interviews run on touch tablets, where
  hover tooltips are unreliable and disabled items do not receive hover events; an
  inline hint conveys the same "why" and works on touch.
- Ensure `DropdownMenuItem` (`@codaco/fresco-ui/DropdownMenu`, a Base UI
  `Menu.Item` wrapper) forwards a `disabled` prop; add the passthrough if it does
  not already exist. Disabled items must not fire `onAction`.
- Applies to ego and non-ego alike: ego's `canAddSibling` is always true (enabled);
  a parentless non-ego person shows the disabled-with-hint item. The capability is
  therefore visible everywhere, so it can never read as "missing."

### G — First-cousin demonstration + verification

Two Storybook stories at the FamilyPedigree interface level, built with
`SyntheticInterview` + `StoryInterviewShell`, following the existing
`FamilyPedigree.stories.tsx` conventions:

1. **Representation story** — a pre-built network containing a first cousin
   (ego → two parents → both grandparents on one side → an aunt/uncle sharing
   those grandparents → the aunt/uncle's child). Asserts the cousin node renders
   with the **"Cousin"** relationship label (via `getDisplayLabel`) and that the
   layout places the branch correctly.

2. **Creation story** (`play` function) — starting from ego with two parents,
   drive the wizards via `userEvent`:
   1. On one of ego's parents, "Add parent" twice (or the define-parents flow) to
      record **both grandparents**.
   2. "Add sibling" on that parent — now **enabled** (exercising the F change) —
      selecting the shared grandparents, to create the **aunt/uncle**.
   3. "Add child" on the aunt/uncle to create the **cousin**.
   4. Assert a node labelled **"Cousin"** is present in the rendered pedigree.

   This demonstrates first cousins are "created by the wizard" and verifies the
   disabled→enabled transition of "Add sibling" once the grandparents exist.

If a story surfaces a genuine layout or labelling bug (e.g. cousin placement or a
mislabel), fix it within this feature's scope rather than deferring.

## Edge cases / notes

- **Half- vs full first cousin.** Sharing only one grandparent with the
  aunt/uncle yields a half-relationship; the creation story records **both**
  grandparents and selects both so the cousin is a full first cousin. The
  `parent,parent,child,child` path classifies as "Cousin" regardless.
- **No change to the genetic-relationship or layout engines** is anticipated; G is
  verification. Any fix that does prove necessary is reported, not silently
  absorbed.
- This feature is independent of Feature #1; if #1 lands first, the stories simply
  run under whichever framing the story's stage config selects (default gamete).

## Testing

- The two Storybook stories above are the primary tests (interactive `play`
  assertions for creation; render assertion for representation).
- A focused unit/interaction test that `NodeContextMenu` renders the "Add sibling"
  item **disabled with the hint** when `canAddSibling` is false, and **enabled**
  (firing `onAction('sibling')`) when true.

## File-level change map

| File                                                                         | Change                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pedigree-layout/components/NodeContextMenu.tsx`                             | always render "Add sibling"; disabled + inline hint when `canAddSibling` is false |
| `fresco-ui/src/DropdownMenu.tsx`                                             | ensure `DropdownMenuItem` forwards `disabled` (if not already)                    |
| `FamilyPedigree.stories.tsx` (or a new `FamilyPedigree.cousins.stories.tsx`) | representation story + creation `play` story                                      |
| (only if a real bug is found) `pedigree-layout/*` / `getDisplayLabel.ts`     | targeted cousin layout/label fix                                                  |

## Out of scope

- Relaxing the shared-parent rule or making `siblingCellTransform` create+link new
  shared parents to the anchor (the rejected alternative; we keep the rule).
- Anything in Features #1 (framing) and #3 (Narrative Pedigree).
