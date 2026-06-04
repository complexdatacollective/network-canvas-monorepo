# Family Pedigree — topology-aware parent candidate lists

**Date:** 2026-06-04
**Package:** `@codaco/interview` (`FamilyPedigree` interface)
**Status:** Design approved, pending implementation plan

## Problem

When adding a relative in the FamilyPedigree, the wizards that pick a parent for
the new/edited node either offer the wrong set of people or no choice at all:

- **Add child / add sibling** present a `BioTriadStep` whose egg/sperm candidate
  list is _every node in the pedigree_. Clicking "add sibling" on the
  participant offers the participant themselves, their children, and their
  grandparents as the sibling's egg or sperm parent — none of which can be a
  genetic parent of a sibling.
- **Add child** cannot reuse a previously-recorded **donor**; you must recreate
  the donor as a new person.
- **Add parent** offers no candidate list at all. The genetic path
  (`DefineParentsWizard`) only ever creates a new egg/sperm parent, and the
  non-genetic path (`AddParentWizard`) only ever creates a new social/surrogate
  parent. So you cannot, for example, record that a deceased child's aunt/uncle
  (already in the tree) became their adoptive parent — you would create a
  duplicate person.

## Background: current state

| Flow                                                                  | Picks                                        | Candidate list today                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Add child (`openAddChildWizard`)                                      | egg/sperm/carrier of a new child of A        | `BioTriadStep`, `buildNodeOptions` = **all** nodes                                              |
| Add sibling (`openAddSiblingWizard`)                                  | egg/sperm/carrier of a new sibling of A      | `BioTriadStep`, `buildNodeOptions` = **all** nodes                                              |
| Define parents (`openDefineParentsWizard`, A has < 2 genetic parents) | A's egg/sperm/carrier/other parents          | "Generic" steps that only **create new** people; `egoCellTransform`                             |
| Add parent (`openAddParentWizard`, A has 2 genetic parents)           | a non-genetic (social/surrogate) parent of A | `ParentDetailsStep` only **creates new**; parent-type guard already limits types to non-genetic |

Relevant existing pieces this design reuses:

- `BioTriadStep` (egg/sperm/carrier selector) with `BioTriadConfig.existingNodes`
  and `preselection`. It always appends a "Create a new person" option (which
  can be flagged a donor). The egg/sperm options already mutually exclude each
  other.
- `buildChildParentage(childTempId, triadValues, variableConfig)` turns triad
  answers into parent nodes + parent→child edges (used by add-child and the
  quick-start).
- `getNodeLabel(nodeId, nodes, edges, variableConfig)` — the relationship
  labeller used to label candidates ("Egg Parent", "Donor", "Rob's Parent", …),
  with ego rendered as "You" by the wizards.
- `getDisplayLabel`'s `bfsFromEgo` traverses the pedigree; the same downward
  traversal identifies a node's descendants.

The quick-start children flow (`ChildrenDetailStep`) already restricts
candidates to `You + partner`, so it needs no change.

## Design

One pattern — "select an existing person **or** create a new one" — applied to
every parent slot, with the candidate set filtered by **the role being filled**,
not by the wizard. There are two filters.

### Shared topology helper

A new pure module computes the candidate id set. Building blocks (all from the
local pedigree `edges`):

- `descendantIds(nodeId, edges, variableConfig)` — BFS down `parent`→`child`
  edges (non-`partner`) from the node; the set of its children, grandchildren, …
- `parentIds(nodeId, edges, variableConfig)` — direct parents (edges _into_ the
  node whose relationship type is not `partner`).
- `partnerIds(nodeId, edges, variableConfig)` — partners (either end of a
  `partner` edge).
- `donorIds(edges, variableConfig)` — every node that is the source of a `donor`
  edge (the reusable donor pool).

### Filter A — genetic (egg/sperm) — _tight_

Used by `BioTriadStep` in **add child**, **add sibling**, and the genetic
**define parents** flow. The candidate must be genetically plausible as the
target's parent.

```
geneticParentCandidates(anchorId, relation, edges, variableConfig):
  naturalCoParents =
    relation === 'child'         -> {anchorId} ∪ partnerIds(anchorId)
    relation === 'sibling'       -> parentIds(anchorId) ∪ partnersOf(parentIds(anchorId))
    relation === 'define-parents'-> partnersOf(parentIds(anchorId))      // partners of A's existing parents
  candidates = naturalCoParents ∪ donorIds()
  exclude    = descendantIds(anchorId) ∪ (relation === 'child' ? {} : {anchorId})
  return candidates \ exclude
```

- `partnersOf(set)` = union of `partnerIds(x)` for each x in the set.
- For **child**, the anchor _is_ a valid parent (kept). For **sibling** and
  **define-parents**, the anchor cannot be its own sibling's/own parent
  (excluded).
- Descendants are always excluded (a descendant cannot be a genetic parent),
  which also removes any donor who happens to be a descendant.

### Filter B — social / adoptive / surrogate — _loose_

Used by `AddParentWizard` (adding a non-genetic parent to A). A social parent has
no genetic-generation constraint — a grandparent, aunt/uncle, or unrelated person
can fill the role.

```
socialParentCandidates(anchorId, edges, variableConfig):
  return allNodeIds \ ({anchorId} ∪ descendantIds(anchorId) ∪ parentIds(anchorId))
```

Only the anchor, its descendants (cannot parent an ancestor), and people who are
already its parents (redundant) are excluded. This is what lets an existing
aunt/uncle or grandparent be selected as the adoptive parent.

### Per-wizard wiring

- **Add child / add sibling:** `buildNodeOptions` takes the precomputed
  candidate-id set and filters its node list to it (ego still labelled "You",
  others via `getNodeLabel`). `BioTriadStep` continues to append "Create a new
  person". Existing `getPreselection` / `derivePreselection` already pick within
  the set.
- **Define parents:** the genetic egg/sperm portion adopts the same
  `BioTriadStep` + candidate-list model as add-child (target = the focal node A,
  whose parents are being created), using `geneticParentCandidates(A,
'define-parents', …)`, and produces parents via the `buildChildParentage`
  helper targeting A. The carrier / other-parents / partnership steps are
  preserved. (This is the largest sub-change, replacing the "Generic" new-person
  egg/sperm steps and the `egoCellTransform`-for-a-focal-node path for this
  wizard.)
- **Add parent:** `ParentDetailsStep` gains a "Who is this parent?" selector
  listing `socialParentCandidates(A, …)` plus "Create a new person", before the
  existing parent-type field. When an existing person is selected, no new node
  is created — only the parent→A edge (of the chosen type) and any partnership
  edges.

## Edge cases

- **No existing candidates** (e.g. add sibling on a node with no recorded
  parents): the genetic list is just donors (if any) + "Create a new person".
- **A donor who is also a descendant** is excluded from the genetic list (a
  descendant can't be a genetic parent), even though donors are otherwise
  reusable.
- **Selecting an existing person who already has unrelated edges** must only add
  the new parent→A edge (and partnerships), never duplicate or mutate the
  existing node.
- A node that is _both_ a donor and (say) a grandparent stays out of the genetic
  list (descendant/anchor exclusions and the natural-co-parent whitelist govern;
  a grandparent is not a natural co-parent), but is available in the _social_
  list — consistent with the two-filter intent.

## Testing

- **Unit (topology helper):** `descendantIds`, `parentIds`, `partnerIds`,
  `donorIds`, and both candidate functions. Cover: add-sibling excludes
  anchor/children/grandparents and includes parents + their partners + donors;
  add-child includes anchor + partners + donors and excludes ancestors;
  social excludes anchor/descendants/existing-parents and includes
  grandparents/aunts-uncles.
- **Unit (transforms):** define-parents via `buildChildParentage` targeting an
  existing node produces parent→A edges (no new A node); add-parent with an
  existing selection produces only the parent→A edge of the chosen type.
- **Render:** the add-sibling `BioTriadStep` no longer lists the excluded nodes;
  the add-parent dialog lists an eligible existing relative.

## Risks / notes

- `DefineParentsWizard` is the biggest change: it currently runs the
  `egoCellTransform`-style "Generic" steps. Converting its genetic portion onto
  `BioTriadStep` + `buildChildParentage` unifies it with add-child/add-sibling
  and removes a parallel code path, but touches several step components and the
  wizard's `onFinish`. The carrier/other-parent/partnership behaviour must be
  preserved.
- The social candidate list can be long in large pedigrees (it is intentionally
  permissive). Labels come from `getNodeLabel`, so unnamed people still read as a
  relationship.
