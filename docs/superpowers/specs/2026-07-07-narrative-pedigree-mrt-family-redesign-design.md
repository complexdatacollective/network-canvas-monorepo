# NarrativePedigree — MRT-via-inference + ego-centric family redesign

**Date:** 2026-07-07
**Status:** approved (design pass in-session)

## Goals

1. **Faithfully model mitochondrial donation (MRT / "three-parent IVF")** — a
   child whose nuclear genome comes from the intended mother but whose mtDNA
   comes from a donor egg, so the mother's maternal-line mitochondrial condition
   does **not** descend to the child, while her autosomal/X conditions still do.
2. **Ego-centric routing** — all six conditions reach ego, ego's partner, or
   ego's offspring (three currently dead-end before the household).
3. **Consanguinity at ego's parents** — the recessive lesson centred on ego.

No schema change, no shim, no migration; ships as one deliverable.

## Decision: infer mtDNA source from existing data (no new schema)

mtDNA comes from the **egg's cytoplasm**; sperm carry none. The engine's bug is
that it uses parent **sex** as the mtDNA proxy ("female parent = mtDNA source")
rather than the egg-cytoplasm source. Everything needed to fix that already
exists per-edge: `gameteRole` (egg/sperm) and `relationshipType`
(biological/donor). No new locked variable.

### Inference rule (per child)

Let the child's genetic parent edges (`relationshipType ∈ {biological, donor}`)
be split by `gameteRole`:

- **0 egg edges** (existing protocols with no `gameteRole`): fall back to today's
  behaviour — nuclear parents = **all** genetic parents; mtDNA parents = the
  **female-resolved** parents. → byte-identical to current output, no migration.
- **1 egg edge** (normal birth, standard egg donation): nuclear parents = all
  genetic parents; mtDNA parent = that egg. (A lone donor egg is still a full
  genetic mother — unchanged.)
- **≥2 egg edges** (MRT): the mtDNA egg is the `donor` egg (the enucleated donor
  egg keeps its cytoplasm), else the first egg. mtDNA parent = that donor egg;
  nuclear parents = all genetic parents **except** the donor egg (it contributed
  no nucleus). The `biological` egg is the nuclear (intended) mother.

### Engine change (genetics package only)

The split is introduced at the narrowest point so the pattern files barely move:

- **`geneticEdge.ts`** — add `readGameteRole(edge, gameteRoleVariable)` (mirrors
  `readRelationshipType`, tolerates the single-element-array categorical form).
- **`geneticGraph.ts`** — `GeneticGraphConfig` gains optional
  `gameteRoleVariable`. `buildGeneticGraph` collects each child's parent edges
  with `{relType, gameteRole}`, then builds **two** adjacencies:
  - `parentMap`/`childMap` become the **nuclear** adjacency (all genetic parents
    minus a displaced mtDNA-only donor egg). `parentsOf`/`childrenOf`/
    `ancestors`/`descendants`/`*SiblingsOf` therefore serve the nuclear patterns
    unchanged.
  - new `mitoParentMap`/`mitoChildMap` (the egg-cytoplasm adjacency), exposed as
    `mitochondrialParentsOf(id)` / `mitochondrialChildrenOf(id)`.
  - For non-MRT fixtures (no multi-egg child) `parentMap` is identical to today,
    so every existing `geneticGraph`/pattern test still passes.
- **`patterns/uniparental.ts` → `computeMitochondrial`** — walk up via
  `mitochondrialParentsOf` and down via `mitochondrialChildrenOf` instead of the
  female-parent / `childrenOf` proxy. Males have no mito children, so the
  daughter-only recursion falls out for free. `computeYLinked` and the autosomal
  / X-linked patterns are untouched (they consume the nuclear adjacency).
- **`resolveSex.ts`** — unchanged (already reads `gameteRole`).
- **`NarrativePedigreeView.tsx`** — pass `gameteRoleVariable` into the
  `buildGeneticGraph` config (already available on `sourceConfig.config`).

New `geneticGraph` unit tests cover the MRT case: dual egg → mtDNA from the
donor, nuclear excludes the donor; and the single-donor-egg case is unchanged.

## Family structure

Five generations, ego ("You") female with partner Chris and children Noah (son)

- Ava (daughter). Three structural moves:

1. **Consanguinity at ego's parents drives CF.** Rose (mother) × David (father)
   are **first cousins**, both descending from shared great-grandparents
   Arthur ⚭ Eleanor Marsh where Eleanor is a CF carrier. The allele descends both
   lines → Rose and David both carriers. Ego has an **affected CF sibling** → Rose
   - David obligate carriers → **ego at-risk-homozygous** → offspring at-risk
     carriers. (Collapses the old isolated cousin-CF branch into the spine.)
2. **XLH through ego; Y-linked through the partner.** David (father) is
   XLH-affected → **ego "will develop it" (obligateAffected)** → both kids
   at-risk. Y-linked moves to the partner's Adler line: Walter → Chris → **Noah
   "will develop it."**
3. **Mitochondrial matriline + MRT escape.** Eleanor (GGM) mito-affected;
   descends Nancy → Rose → ego → both kids. Ego's maternal aunt **Margaret**,
   also at-risk, uses **MRT**: Margaret = `biological` egg (nucleus), unaffected
   donor Ivy = `donor` egg (mtDNA), husband Paul = sperm → child **Chloe escapes
   the mito condition but still inherits Margaret's autosomes**. (Contrast with
   standard egg donation, which drops every maternal condition.)

### Condition routing (each reaches ego / offspring)

| Condition         | Pattern | Enters at                       | Household path                                      | Symbols                                                    |
| ----------------- | ------- | ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Huntington's      | AD      | George (maternal grandfather)   | Rose → ego → kids                                   | affected, atRiskAffected                                   |
| Cystic Fibrosis   | AR      | Eleanor (GGM) via consanguinity | affected sib → Rose+David → ego → kids              | affected, obligateCarrier, atRiskHomozygous, atRiskCarrier |
| Haemophilia A     | XLR     | maternal uncle (affected)       | Nancy → Rose → ego → Noah                           | affected, obligateCarrier, atRiskCarrier, atRiskAffected   |
| Hypophosphataemia | XLD     | David (father)                  | ego obligateAffected → kids                         | affected, obligateAffected, atRiskAffected                 |
| Y Hearing Loss    | Y       | Walter Adler (partner's father) | Chris → Noah obligateAffected                       | affected, obligateAffected                                 |
| Mito Myopathy     | mito    | Eleanor (GGM)                   | Nancy → Rose → ego → kids; aunt's MRT child escapes | affected, atRiskAffected, + MRT escape (unknown)           |

All seven notation symbols covered (both `obligateAffected` instances +
`atRiskHomozygous`). Ego is a deliberately dense hub — the "everything reaches
your household" goal.

## Verification

- New `geneticGraph` MRT unit tests (adjacency split) go red without the change.
- `geneticRealism.test.ts` re-expressed against the real engine: every routing
  row above asserted (including Chloe escaping mito while inheriting Margaret's
  autosomes, and every notation symbol surfaced).
- Determinism guard (`comprehensivePedigreeFixture.test.ts`) retained; every
  boolean seeded so `getNetwork()` cannot randomise unset attributes.
- Regenerated NarrativePedigree interface image; verify the rendered pedigree
  (not just unit tests).

## Scope & changesets

One PR off `main`: engine inference change + rewired fixture + regenerated
`geneticRealism.test.ts` + regenerated interface image. Two library-lane
changesets:

- `@codaco/interview` — **minor** (mtDNA-source inference / MRT support is a new
  capability; back-compat by fallback).
- `@codaco/interface-images` — **patch** (regenerated preview).
