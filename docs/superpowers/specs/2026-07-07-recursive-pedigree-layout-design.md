# Recursive pedigree layout (kinship2 `align.pedigree` port)

**Date:** 2026-07-07
**Status:** in progress

## Why

The current `sugiyamaLayout` orders each generation with a barycentric
crossing-minimiser. It has no notion of keeping a _married-in family_ next to
its in-law, so a family that connects to the rest only by a marriage floats to
an arbitrary column, producing a long marriage bar that crosses unrelated
branches (see the NarrativePedigree comprehensive fixture: ego's partner Chris
and his Adler family float far from ego). Fixes to sibship-grouping and
couple-tightening (already landed) resolve sibling scatter and loose couples,
but the cross-family span is structural: it needs an ordering that orients
sibships toward their marriage connections and, where a person genuinely bridges
two founder trees, duplicates them (joined by an arc). That is precisely what
kinship2's `align.pedigree` recursion does.

## Approach

Replace the _ordering_ step (`minimizeCrossings`) with a faithful port of
kinship2's `alignped1/2/3` recursion, keeping the existing generation assignment
(`kindepth`, already a kinship2 port) and — for the first stage — the existing
`encodePedigreeLayout` for x-positions and the `fam`/`group`/`groupMember`
derivation. The recursion runs on the existing `PedigreeGraph` (partner groups,
family units, sibling groups, parents, layers), so no new sex/dad/mom input is
needed: a couple's left/right defaults to partner-index order.

## Algorithm reference

The complete, implementable specification (distilled from the kinship2 noweb
literate source and `R/alignped1-4.R`, cross-checked against pedigreejs) is the
research artefact captured in the session transcript for
2026-07-07. Key points:

- **`.5` tag**: during recursion the left member of a marriage pair is stored as
  `id + 0.5`; `floor()` recovers the person, the fraction means "next column is
  my spouse". Split into integer `nid` + `spouse`/`group` at the end.
- **`fam[level][col] = k`**: this person's parents are the two people at columns
  `k` and `k+1` on `level-1`. Merges must re-base these column pointers.
- **`alignped1(x)`**: place x plus the spouses x anchors (left/right split),
  recurse into each marriage's children via `alignped2`, splice levels.
- **`alignped2(sibs)`**: lay each sib's subtree (`alignped1`) side by side,
  skipping the lone re-appearance when two sibs marry each other.
- **`alignped3(x1, x2)`**: merge two subtrees side by side; the _overlap test_
  (`floor(last of x1) == floor(first of x2)`) collapses a shared person into one
  slot (keeping the parent-linked `fam` and the `.5`), otherwise both survive as
  a duplicate to be arc-joined.
- **Driver**: founder couples (neither has a father in the tree), sorted by
  hint/dataset order, each `alignped1`'d and merged.
- **Positions**: kinship2 uses a constrained QP (`solve.QP`) minimising
  sib-under-parents + spouse-together, subject to order + min-gap. Stage 1 reuses
  `encodePedigreeLayout`'s centring instead.
- **Consanguinity**: after placement, a spouse pair whose ancestor sets intersect
  is flagged `group=2` (doubled line) — already computed by the existing encoder.
- **Twins / autohint**: deferred; a deterministic dataset-order sibling hint is
  correct (just less pretty, more duplicate arcs) per the reference.

## Staging

1. **Recursion → ordering**, fed to the existing encoder. Verify the ego↔Chris
   span resolves on the comprehensive fixture and the structural layout tests
   still pass.
2. Duplicate rendering (ghost nodes) + arc polish where a bridge person cannot be
   linearised; consanguinity-loop handling.
3. Regenerate the FamilyPedigree e2e visual baselines (all pedigree coordinates
   change).

## Risk

This changes every pedigree's coordinates, so it regenerates all FamilyPedigree
e2e visual baselines and must not regress the 211 structural layout unit tests.
It is a large, self-contained change and is developed on its own branch.
