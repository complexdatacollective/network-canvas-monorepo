# Reproductive role and sex recorded at birth

## Decision

Family Pedigree records reproductive role separately from the participant's
answer to the biological-sex question:

| Fact                      | Storage                                      | Meaning                                                        |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Sex recorded at birth     | Node `biologicalSex` attribute               | The answer to “What sex was this person recorded as at birth?” |
| Egg or sperm contribution | Parent edge `gameteRole` attribute           | The gamete contributed to this conception                      |
| Gestation                 | Parent edge `isGestationalCarrier` attribute | The person who carried this pregnancy                          |

Reproductive role does not determine the answer to the sex-at-birth question,
and sex at birth does not determine eligibility for a reproductive role. The
interface therefore:

- never filters egg-parent, sperm-parent, or gestational-carrier candidates by
  `biologicalSex`;
- asks the complete biological-sex question when a new person is created in
  any of those roles, including all five configured answers;
- may use a known binary value to choose a convenient initial egg/sperm
  selection, but leaves both candidate lists complete and editable;
- excludes a person from the gestational-carrier follow-up only when that
  person was the subject of the immediately preceding “Did this person carry
  the pregnancy?” question and the participant answered “No”; and
- never replaces a captured biological-sex answer with a value inferred from a
  reproductive role.

The edge roles remain available to downstream genetics code. In particular,
sex-linked inheritance can use an egg/sperm role when a binary genetic lineage
signal is required without changing the person's recorded node attribute. See
[Narrative Pedigree modelling decision 5b](../NarrativePedigree/genetics/MODELLING_DECISIONS.md#5b-resolvesex-sex-blocked--unknown-with-an-inclusive-gamete-role-fallback).

## Rationale

Sex is a multidimensional construct. A birth assignment, sex characteristics,
gonadal or chromosomal variation, gamete contribution, and capacity to carry a
pregnancy are related but not interchangeable observations. Treating one as a
proxy for another would manufacture data the participant was never asked to
provide and would prevent the pedigree from representing some intersex people.

This separation also follows the broader pedigree-design principle used
throughout the interface: record the fact that was elicited on the entity to
which it belongs. A reproductive role belongs to a particular parent-child
edge; sex recorded at birth belongs to the person node.

## Literature

- Bennett RL, French KS, Resta RG, Austin J. [Practice resource-focused
  revision: Standardized pedigree nomenclature update centered on sex and
  gender inclusivity](https://pubmed.ncbi.nlm.nih.gov/36106433/). _Journal of
  Genetic Counseling_. 2022;31(6):1238-1248.
  [doi:10.1002/jgc4.1621](https://doi.org/10.1002/jgc4.1621). The revision
  clarifies the distinction between sex assigned at birth and gender in
  standardized human pedigrees and explicitly addresses intersex-inclusive
  practice.
- National Academies of Sciences, Engineering, and Medicine. [_Measuring Sex,
  Gender Identity, and Sexual
  Orientation_](https://doi.org/10.17226/26424). Washington, DC: The National
  Academies Press; 2022. The consensus report describes sex as
  multidimensional and recommends measuring the component relevant to the
  research purpose rather than treating sex-related measures as
  interchangeable.
- American Society for Reproductive Medicine. [Inclusive language and
  environment to welcome lesbian, gay, bisexual, transgender, queer,
  questioning, intersex, and asexual+
  patients](https://www.asrm.org/practice-guidance/practice-committee-documents/inclusive-language-and-environment-to-welcome-lesbian-gay-bisexual-transgender-queer-questioning-intersex-and-asexual-patients/). 2024. The guidance distinguishes sex assigned at birth from intersex status
  and other sex characteristics.
- Zhang H, et al. [Successful live birth after interstitial ectopic pregnancy
  in a patient with Swyer syndrome following IVF: a case
  report](https://pmc.ncbi.nlm.nih.gov/articles/PMC13261976/). 2026. This case
  illustrates why gestational capacity and individual sex-related
  characteristics cannot safely be collapsed into one inferred categorical
  answer.
