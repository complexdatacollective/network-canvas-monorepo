# Family Pedigree — confirm each child's egg/sperm parent

**Date:** 2026-06-04
**Package:** `@codaco/interview` (`FamilyPedigree` interface)
**Status:** Design approved, pending implementation plan

## Problem

The "Add parent" menu action on a child opens a dialog offering invalid
options. In a nuclear-family scenario (participant + partner + two children),
clicking "Add parent" on a child offers "biological parent" and "donor" — both
impossible, because the child's egg parent and sperm parent are already known
(the participant and their partner).

The reported dialog behaviour is only a symptom. The root cause is the
quick-start wizard. It asks the participant "Do you have a current partner?"
then "How many children do you have with this partner?", and `egoCellTransform`
then hard-codes a `biological` parent→child edge from **both** the participant
and the partner to **every** child (`egoCellTransform.ts:282-324`). That bakes
in the assumption that the participant and partner are both genetic parents of
every child, without ever asking who contributed the egg and who contributed
the sperm. The data model therefore cannot represent donor conception, surrogacy,
same-sex couples, or social co-parents in the quick-start, and downstream
consumers (the add-parent dialog) cannot reason about genetic-slot availability.

## Background: the existing model

The codebase already has a correct model for capturing a child's biological
parentage — it is used by the **Add-child wizard** (`openAddChildWizard`):

- `BioTriadStep` (`components/wizards/steps/BioTriadStep.tsx`) asks, per child:
  - **Egg parent** — who provided the egg (an existing node, or a new person),
    "was this person an egg donor?", "did this person carry the pregnancy?".
  - **Gestational carrier** — shown only when the egg parent did not carry;
    who carried the pregnancy.
  - **Sperm parent** — who provided the sperm, "was this person a sperm donor?".
  - Supports a `preselection` (default egg/sperm/carrier choices) and an
    `existingNodes` list of candidate people.
- `childCellTransform` (`components/wizards/transforms/childCellTransform.ts`)
  turns those answers into edges: `biological` (or `donor` when flagged) from the
  egg and sperm sources, a `surrogate` edge with `isGestationalCarrier` when a
  separate carrier is named, `social` edges for additional parents, and `partner`
  edges between co-parents. It generates donor/surrogate/new-person nodes as
  required.

Relationship-type semantics (genetic vs not) are defined canonically in
`computeBioRelatives.ts`: only `biological` and `donor` edges are genetic;
`surrogate`, `social`, and `adoptive` are not. A child has at most two genetic
parents — the egg contributor and the sperm contributor.

### Live child-creation paths

| Path                                | Entry point                                                                          | State                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Quick-start "children with partner" | `EgoCellWizard` → `PartnerAndChildrenStep`/`ChildrenDetailStep` → `egoCellTransform` | **Naive** — hard-codes biological from ego + partner                                                             |
| Add-child wizard                    | context menu `child` → `openAddChildWizard` → `BioTriadStep` → `childCellTransform`  | **Correct** — already uses the triad model                                                                       |
| Simple "Add person → child" dialog  | `AddPersonFields` mode `'child'` + `handleAddPerson` `'child'` branch                | **Dead code** — the menu routes `child` to the wizard, so `handleAddPerson` is only ever called with `'partner'` |

## Goals

1. Every child-creation path captures the child's egg parent, sperm parent, and
   (when different) gestational carrier, via one shared model — generating
   donor/surrogate/additional-parent nodes as needed.
2. The "Add parent" dialog stops offering a genetic (biological/donor) parent
   type once a child already has both genetic slots filled.

## Non-goals

- Changing the Add-child wizard's user-facing flow (it is already correct).
- Revisiting the genetic-relationship model in `computeBioRelatives`.
- A lightweight/batch capture flow — the decision is to reuse the full
  `BioTriadStep` per child for consistency and code reuse.

## Design

### 1. Shared parentage helper (data layer)

Extract the per-child triad→edges logic currently embedded in
`childCellTransform` into a pure helper:

```text
buildChildParentage(childTempId, triadValues, variableConfig)
  → { nodes: CommitBatch['nodes']; edges: CommitBatch['edges'] }
```

It produces, from one child's triad answers:

- `biological` (or `donor` when "is donor") parent→child edges from the
  egg-source and sperm-source,
- a `surrogate` edge + `isGestationalCarrier` flag when a separate carrier is
  named (and the `isGestationalCarrier` flag on the egg parent when the egg
  parent carried),
- generated nodes for any "new person" / donor / surrogate sources.

The helper's scope is deliberately limited to **parent→child edges and the
nodes those parents require.** It does **not** emit `partner` edges between
co-parents: those are driven by explicit partnership form values and remain the
responsibility of each caller. `childCellTransform` keeps its partnership step
(unchanged), and the quick-start already creates the ego↔partner `partner` edge
in `egoCellTransform`'s existing partner handling — so emitting co-parent
partner edges from the helper would duplicate it. Keeping the helper to
parent→child edges avoids that and keeps it a single source of truth for "what
parent→child edges a child's parentage produces."

`childCellTransform` is refactored to call this helper for its triad edges (no
behaviour change). `egoCellTransform` calls the same helper for each quick-start
child.

The quick-start does **not** gain a per-child "other parents" (social) step or a
per-child co-parent partnership step — for quick-start children the only
co-parents are the participant and their (already-partnered) partner, or a
non-partner donor. Social/extra parents for a specific child can still be added
later via the Add-child wizard or the node menu. (YAGNI.)

### 2. `BioTriadStep` becomes namespace-aware

`BioTriadStep` currently uses flat field names (`egg-source`, `sperm-source`,
`egg-source-is-donor`, `egg-parent-carried`, `carrier-source`, `new-*`), so only
one instance can exist per form. Add an optional `prefix` prop; all field names
and `FieldGroup` watch keys derive from it. With no prefix the behaviour is
unchanged (Add-child wizard keeps working); with a per-child prefix, N instances
coexist in the quick-start form.

The transform helpers read triad values relative to the same prefix.

### 3. Quick-start change

`PartnerAndChildrenStep` is unchanged in its first questions (partner yes/no,
partner person fields, children count). `ChildrenDetailStep` keeps the per-child
name/`PersonFields` and **gains a per-child `BioTriadStep`** with:

- `prefix` = the child's namespace (e.g. `childWithPartner[i]`),
- `existingNodes` = **You** (always) and **Partner** (when a partner was
  entered), in addition to the built-in "Create a new person" option,
- `preselection` matching the Add-child wizard (egg = You, sperm = Partner,
  carrier = egg-source). Preselections render as **selectable radios the
  participant confirms or changes** — they are never silently committed.

`egoCellTransform` stops emitting hard-coded `biological` edges for children and
instead calls `buildChildParentage` for each child, merging the resulting nodes
and edges into the batch. The partner is no longer assumed to be a genetic
parent; their relationship to each child is whatever the triad resolves to
(genetic, social, or not a parent of that child).

### 4. Retire the dead naive path

Remove the unreachable simple child-creation code: `AddPersonFields` mode
`'child'` and the `'child'` branch (including the `partnerId` handling) in
`handleAddPerson` (`PedigreeView`). This deletes the second hard-coded-biological
code path so it cannot be revived.

`AddPersonFields` modes `'parent'` and `'sibling'` also appear unreachable (the
menu routes those actions to dedicated wizards). Confirm with `knip` and remove
whatever is genuinely unused; `AddPersonFields` is expected to be left handling
only `'partner'`.

### 5. Add-parent dialog guard

Define a node's genetic-parent count as the number of edges into it with
relationship type `biological` or `donor` (matching `computeBioRelatives`).

- When a node already has **two** genetic parents, `AddParentWizard`'s
  parent-type options exclude `biological` and `donor`, offering only the
  non-genetic types (`social`/adoptive and `surrogate`). This removes the
  reported invalid options.
- When a node has **fewer than two**, behaviour is unchanged: `DefineParentsWizard`
  still defines the missing genetic parents.

Implementation: pass the filtered option list (or a `geneticSlotsFull` flag) into
`AddParentWizard`'s `ParentDetailsStep`, computed from the node's edges. Align the
`handleAddParent` routing threshold to the genetic definition (`biological|donor`)
rather than the current "not partner / not social" count, which incorrectly
treats `surrogate` as genetic.

## Data flow

- **Quick-start:** per-child namespaced triad fields → `egoCellTransform` →
  `buildChildParentage` per child → batch edges + generated nodes.
- **Add-child wizard:** `BioTriadStep` (no prefix) → `childCellTransform` →
  `buildChildParentage` → batch.
- **Add-parent dialog:** node edges → genetic-parent count → filtered parent-type
  options.

## Edge cases

- **No partner:** the children step still asks egg/sperm with candidates = You +
  "Create a new person" (covers solo parent with a donor). `BioTriadStep` already
  collapses to a hidden "new" field when only that option exists.
- **Solo parent + donor:** egg = You, sperm = new donor → donor node generated.
- **Same-sex couple + donor:** e.g. egg = You (carried), sperm = new donor;
  partner recorded as a co-parent per the triad/partnership answers rather than an
  assumed biological parent.
- **Separate gestational carrier:** egg parent did not carry → carrier step →
  `surrogate` edge with `isGestationalCarrier`.

## Testing

- **Unit:** `buildChildParentage` — each role resolves to the correct edge type;
  donor/surrogate/new-person node generation; partner edges between co-parents.
- **Unit:** extended `egoCellTransform` tests covering nuclear, solo+donor,
  same-sex+donor, and surrogate scenarios produce the expected child edges.
- **Unit/logic:** add-parent option guard — a node with two genetic parents
  yields options without `biological`/`donor`; with fewer than two, they remain.
- **Storybook interaction tests:** update the existing `FamilyPedigree.stories.tsx`
  walkthroughs to match the new implementation — the quick-start scenarios now
  pass through the per-child egg/sperm `BioTriadStep`, so the existing step
  sequences and assertions (which drive the old "count → biological-from-both"
  flow) must be revised accordingly.
- **Optional:** add new interaction tests/stories demonstrating the new
  functionality (nuclear, solo+donor, same-sex+donor, surrogate) and the
  add-parent regression (offering only non-genetic options once both genetic
  slots are filled).

## Risks / notes

- `BioTriadStep` namespace-awareness must compose with `FieldGroup` `watch`
  conditions; verify watch keys resolve under the prefix during implementation.
- A pre-existing Storybook test (`FamilyPedigree.stories.tsx`, partnership-step
  wording) is currently failing due to unrelated in-progress copy edits; that is
  separate from this work.
