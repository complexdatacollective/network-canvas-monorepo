# Narrative Pedigree storybook — comprehensive example design

**Date:** 2026-07-07
**Status:** implemented (engine-verified)

## Goal

Improve the `@codaco/interview` NarrativePedigree storybook:

1. Replace the interface's story set with **one args-driven default story**
   (`showAtRiskStatuses` arg, default **On**).
2. Seed a **single realistic family** in which each of the six conditions from
   the condition key has a genetically-coherent, interesting manifestation.
3. Ensure **every notation symbol** appears in at least one scenario — including
   the two the previous fixtures never surfaced in the shown view: **"will
   develop this condition"** (`obligateAffected`) and **"two copies"** (the
   at-risk-homozygous marker).
4. Use realistic North-American first + last names that respect patrilineal
   surname inheritance.

## Scope of the storybook change

- Consolidate the seven `Interfaces/NarrativePedigree` stories **and** the
  separate `AllInheritancePatterns` story into a single `Default` story.
- Repoint the required `Capture/NarrativePedigree` story to the new pedigree.
- `comprehensivePedigreeFixture.ts` becomes the single source of truth
  (`addComprehensivePedigree` mutator + `buildComprehensivePedigree` convenience).
- `Examples/CEGRM`, `Examples/Pedigree Flow`, and the component-level stories are
  left in place; Pedigree Flow simply picks up the richer family.
- Tests: `geneticRealism.test.ts` becomes the comprehensive genetics guard (per
  condition + full symbol coverage + egg-donation escape + consanguinity wiring);
  the determinism test is renamed `comprehensivePedigreeFixture.test.ts`; the
  redundant `allPathways.test.ts` is removed.
- The `NarrativePedigree.*.webp` interface images are regenerated.

## The family

One integrated five-generation pedigree centred on ego ("You"). Surnames follow
North-American patrilineal convention (a wife takes her husband's surname,
children take their father's, married-in spouses keep their own). The two CF
cousins carry different surnames (Marsh vs Doyle) precisely because one descends
through a son and the other through a daughter of the shared grandparents — the
surname pattern is part of the demonstration.

### Branches (each condition on its own readable branch)

| Condition                  | Pattern | Branch                                                                                                         |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| Huntington's               | AD      | Maternal Marsh line: Arthur → Rose affected; the whole descent at risk.                                        |
| Mitochondrial myopathy     | mt      | Matriline from Eleanor; males (Frank/George) do not transmit, females (Nancy) do.                              |
| Y-linked hearing loss      | Y       | Sullivan male line Harold → David → Ben; Owen inferred "will develop it".                                      |
| Haemophilia A              | XLR     | Two affected Marsh brothers → Eleanor obligate carrier → carrier females to ego + daughter; ego's son at-risk. |
| X-linked hypophosphataemia | XLD     | Walter Adler → all daughters affected (Paula "will develop it"), son Chris spared → ego's children spared.     |
| Cystic fibrosis            | AR      | Consanguineous first-cousin union (Michael Marsh × Laura Doyle) → Sophie affected + Daniel "two copies".       |

One **egg-donation branch**: Margaret Marsh (at risk down the maternal line)
conceives via an unaffected egg donor (Ivy) with her husband Paul; their daughter
Chloe inherits from the donor, not from Margaret, so she escapes the family's
maternal-line conditions. Modelled with a `donor` edge (genetic) from Ivy, a
`biological` edge from Paul, and a non-genetic `social`/gestational edge from
Margaret.

### Verified status coverage (real engine, at-risk on)

| Symbol                          | Where                                        |
| ------------------------------- | -------------------------------------------- |
| affected                        | every condition's nominated members          |
| will develop (obligateAffected) | Y-line (Owen), XLD daughters (Paula)         |
| carries (obligateCarrier)       | CF cousins, haemophilia (Eleanor)            |
| may develop (atRiskAffected)    | HD descent, mito matriline, haemophilia sons |
| may carry (atRiskCarrier)       | haemophilia carrier females, CF collaterals  |
| two copies (at-risk-homozygous) | CF cousins' unaffected child Daniel          |
| not known (unknown)             | married-in spouses; the egg-donation child   |

All assertions are guarded by `geneticRealism.test.ts` running the real
`computeStatuses` / `computeAtRiskHomozygous` engine on the fixture.

## Why one composite family

A single family carrying six Mendelian conditions is a deliberate didactic
composite (the prior fixture did the same). Conditions are explored one at a time
in the interface, so per-node overlap is invisible while a condition is selected;
the "all conditions" overview is the only place overlap shows, and that is
expected. This keeps every condition's individual pathway clean and realistic
while covering the whole notation set in one navigable pedigree.
