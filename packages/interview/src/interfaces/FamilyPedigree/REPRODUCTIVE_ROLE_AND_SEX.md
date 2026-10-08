# Which gamete a parent gave, and sex assigned at birth

## Decision

The Family Pedigree asks each person's sex assigned at birth, and never asks
which gamete a genetic parent (a biological parent or a donor) gave. The
gamete is derived from sex assigned at birth by one rule, `inferGametes` in
`gametes.ts`, which everything that needs it reads: the kinship words (egg
parent, sperm parent, biological mother, egg donor), the Narrative Pedigree's
genetics engine, and the documentation analysts read.

For each genetic parent of a child:

1. Recorded female at birth: they gave the egg. Recorded male: the sperm. Sex
   at birth governs, whatever the person's gender identity, so a trans man
   recorded female at birth gave the egg.
2. Recorded otherwise (intersex, don't know, prefer not to say, or not
   answered), when the child's one other genetic parent is recorded female or
   male: they gave the other gamete, by elimination.
3. Anything else is not known: a single genetic parent who is neither female
   nor male, or two genetic parents who are both neither.

The interface allows a child at most two genetic parents, at most one recorded
female at birth and at most one recorded male, so the rule never meets two
eggs or two sperm.

## Why

A separate gamete question (as schema 8 had, on each parent relationship) is a
second answer that can contradict sex at birth: a parent recorded female at
birth who gave the sperm, or two parents who both gave the egg. Each such
contradiction is either a rare variation the interface would have to
interpret, or a mistake it would have to catch. Deriving the gamete leaves one
answer per person, asked once, and nothing for the two to disagree about. It
also keeps the question participants find hardest to answer about a relative
(which gamete they gave) out of the interview, while the question they can
answer (the sex recorded at birth) carries the same information in nearly
every family.

## What the model cannot record

- **Both genetic parents neither female nor male at birth.** Their gametes are
  not known, so they are not named egg parent or sperm parent, and the
  genetics engine falls back to its sex rule (which treats them as unknown).
- **A known gamete with an unknown sex at birth**, where elimination cannot
  supply it: for example an anonymous sperm donor recorded as "don't know",
  for a child whose other genetic parent is not recorded female or male
  either. The participant knows the donor gave sperm, but the model has
  nowhere to put it.
- **Differences of sex development where binary sex at birth and gamete
  disagree**, such as a person recorded male at birth who gave an egg. These
  are rare. The interface forbids recording them (it will not accept two
  genetic parents recorded male) rather than misrecording which gamete each
  gave. Recording such a person's sex at birth as intersex lets elimination
  derive their gamete instead.
- **Mitochondrial donation**, which needs three genetic contributors (the
  nuclear egg, the donor egg's cytoplasm and the sperm). The interface allows
  two genetic parents. The genetics engine can model a third contributor (see
  `../NarrativePedigree/genetics/MODELLING_DECISIONS.md` §2–3), but the Family
  Pedigree never produces one.

## For analysts

A pedigree file format with "father" and "mother" columns, such as the PED
format used by linkage and segregation software, means the sperm-giver and the
egg-giver. Export those columns from the derived gamete, not from gender
identity, and leave them unknown where the rule above does.

## Literature

- Bennett RL, French KS, Resta RG, Austin J. [Practice resource-focused
  revision: Standardized pedigree nomenclature update centered on sex and
  gender inclusivity](https://pubmed.ncbi.nlm.nih.gov/36106433/). _Journal of
  Genetic Counseling_. 2022;31(6):1238-1248.
  [doi:10.1002/jgc4.1621](https://doi.org/10.1002/jgc4.1621). The revision
  distinguishes sex assigned at birth from gender in standardized human
  pedigrees and addresses intersex-inclusive practice.
- National Academies of Sciences, Engineering, and Medicine. [_Measuring Sex,
  Gender Identity, and Sexual
  Orientation_](https://doi.org/10.17226/26424). Washington, DC: The National
  Academies Press; 2022. The consensus report describes sex as
  multidimensional and recommends measuring the component relevant to the
  research purpose rather than treating sex-related measures as
  interchangeable. Here the component is sex assigned at birth, and the
  gamete is derived from it rather than measured a second time.
