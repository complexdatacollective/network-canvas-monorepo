# Behavioural Influence Networks — author notes

A reusable, **behaviour-agnostic** Network Canvas template for studying the social influence
and diffusion ("contagion") of health behaviours: obesity-related behaviours, smoking/vaping,
physical activity, diet, and alcohol. It is a _measurement scaffold_, not a single-study
instrument — fork it and keep only the behaviours you study.

## Rationale & design

The foundational social-contagion work (Christakis & Fowler on obesity, 2007, and smoking,
2008, in the Framingham Heart Study; the "three degrees of influence" idea) and a large
adolescent peer-influence literature on vaping and alcohol motivate a generic egocentric design
that any behavioural-health researcher can adapt.

The **signature technique** is twofold:

1. **Behaviour-specific (multiplex) name generators.** A single `NameGenerator` stage carries
   four prompts — people you _exercise with_, _eat meals with_, _smoke or vape with_, and
   _drink alcohol with_. The same alter can be named on more than one prompt, so the elicited
   network is multiplex: it records _which_ shared behaviours bind ego to each alter. We then
   reify the overlap explicitly with a `shared_domains` (categorical, multi-select) variable in
   a `CategoricalBin`, so the shared-behaviour membership is a first-class, analysable attribute
   rather than only an artefact of which prompt named the person.
2. **An ego self-report reference point for homophily.** The opening `EgoForm` captures the
   ego's _own_ behaviour on every domain (activity minutes/week, smoking status, vaping status,
   diet quality, alcohol frequency). Pairing ego self-report with the per-alter perceived
   behaviours (`alter_smokes`, `alter_activity`, `alter_diet`, `alter_drinks`) lets researchers
   compute ego–alter concordance (homophily) and perceived behavioural exposure.

`closeness` is collected in an `OrdinalBin` because influence is widely held to be moderated by
tie strength — closer ties exert (or are perceived to exert) stronger behavioural pull. The
closing `Narrative` stage lets the interviewer and participant review behavioural clustering,
with presets that group/colour the network by a behaviour variable (smoking, activity, drinking)
and highlight shared-behaviour membership.

### Stage sequence

1. `ego-behaviours` (EgoForm) — the ego's own behaviours; the homophily reference point.
2. `ng-behaviours` (NameGenerator) — four behaviour-specific prompts; collects `alter_name`.
3. `alter-behaviours` (AlterForm) — `shared_domains` (which behaviours ego shares with each
   alter, recorded per alter as a multi-select because a person can share several), `relationship`,
   and each alter's perceived behaviours. (Shared behaviours are captured here in a checkbox form
   rather than a CategoricalBin, which can only assign one value per person.)
4. `ordbin-closeness` (OrdinalBin) — `closeness` (tie strength moderates influence).
5. `narrative-clustering` (Narrative) — review clustering, grouped by each alter's behaviours.

## Instruments & sources

Wording was adapted faithfully from established public-health instruments rather than invented.

- **Physical activity (ego `activity_minutes_week`).** Framed on the **International Physical
  Activity Questionnaire (IPAQ) short form**, which asks respondents to report minutes of
  moderate- and vigorous-intensity activity "done for at least 10 minutes at a time" over the
  last 7 days (e.g. _"During the last 7 days, on how many days did you do vigorous physical
  activities…"_). We collapse IPAQ's multi-item structure to a single self-reported
  minutes-per-week figure for a lightweight reference point; researchers wanting MET-minutes
  scoring should restore IPAQ's separate vigorous / moderate / walking items.
  - IPAQ self-administered short form (LOINC panel 77582-5):
    https://loinc.org/77582-5/panel
  - IPAQ telephone short form (LOINC panel 88412-2): https://loinc.org/88412-2/panel
  - IPAQ overview / scoring (MOJYPT): https://medcraveonline.com/MOJYPT/MOJYPT-05-00063A4.pdf
  - PhenX Toolkit physical-activity protocol: https://www.phenxtoolkit.org/protocols/view/661901
- **Smoking status (ego `smoking_status`).** Uses the **CDC / NHIS standard three categories**:
  _current_ (smoked ≥100 cigarettes in lifetime and now smokes every day or some days),
  _former_ (≥100 lifetime, not now), _never_ (<100 lifetime).
  - CDC FastStats, Cigarette Smoking & Electronic Cigarette Use:
    https://www.cdc.gov/nchs/fastats/smoking.htm
  - NHIS Adult Tobacco Use — Smoking Status Recodes:
    https://archive.cdc.gov/www_cdc_gov/nchs/nhis/tobacco/tobacco_recodes.htm
  - NHIS Adult Tobacco Use — Glossary:
    https://archive.cdc.gov/www_cdc_gov/nchs/nhis/tobacco/tobacco_glossary.htm
- **Vaping status (ego `vaping_status`).** Follows the **CDC e-cigarette** convention (current
  users = ever tried, now using every day / some days), expanded to _daily / some days / tried
  but not now / never_ for symmetry with smoking status.
  - CDC, E-Cigarette Use Among Adults: https://www.cdc.gov/tobacco/e-cigarettes/adults.html
  - CDC, E-Cigarettes (Vapes): https://www.cdc.gov/tobacco/e-cigarettes/
- **Alcohol frequency (ego `alcohol_frequency`).** Adapted from the **AUDIT-C / AUDIT item 1**
  frequency response set (_Never / Monthly or less / 2–4 times a month / 2–3 times a week /
  4+ times a week_), the standard first item of the WHO Alcohol Use Disorders Identification
  Test.
- **Diet quality (ego `diet_quality`, alter `alter_diet`).** A single self-rated diet-quality
  item on a 5-point scale (_Poor → Excellent_), mirroring the widely used self-rated general-health
  response format applied to diet.
- **Behaviour-specific name-generator phrasing.** The "people you {exercise / eat / smoke or
  vape / drink} with" framing follows the social-contagion / behaviour-sharing tradition seeded
  by Christakis & Fowler and elaborated in adolescent peer-influence network studies, which
  elicit behaviour-specific companions rather than generic "close friends."
  - Christakis & Fowler, _The Spread of Obesity in a Large Social Network over 32 Years_, NEJM
    2007 (open PDF): https://www.albany.edu/~ravi/pdfs/christakis_fowler_2007.pdf
  - Christakis & Fowler, _The Collective Dynamics of Smoking in a Large Social Network_, NEJM
    2008: https://www.nejm.org/doi/full/10.1056/NEJMsa0706154
  - Network dynamics of social influence on e-cigarette use among adolescents (Nicotine &
    Tobacco Research, 2025): https://academic.oup.com/ntr/article/27/9/1583/8079086
  - _My friends made me do it: Peer influences and different types of vaping in adolescence_
    (Addictive Behaviors, 2024): https://pmc.ncbi.nlm.nih.gov/articles/PMC11480947/
  - Selection homophily and peer influence for adolescents' smoking and vaping norms (Humanities
    & Social Sciences Communications, 2023): https://www.nature.com/articles/s41599-023-02124-9
  - Mercken et al., peer selection and influence on adolescent alcohol use (stochastic
    actor-based model): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3469361/

## Methodological caveat — homophily/exposure, not proven contagion

Egocentric data of this kind measures **homophily** (the tendency for connected people to be
behaviourally similar) and **perceived exposure** (how much of an ego's network shares a
behaviour) cleanly. It does **not**, on its own, demonstrate **causal contagion** — that one
person's behaviour _causes_ a change in another's.

From observational personal-network data, three processes are confounded and generally cannot be
separated: (a) **influence/contagion** (alters change ego, or vice versa), (b) **homophily/
selection** (people befriend others already like them), and (c) **shared environment/context**
(connected people are exposed to the same neighbourhood, workplace, prices, norms). The original
Christakis–Fowler contagion estimates were specifically challenged on these grounds — notably by
Cohen-Cole & Fletcher (confounding by shared environment) and Shalizi & Thomas (showing
homophily and contagion are generically confounded in observational network data). A further
limitation here is that alter behaviours are **ego-reported perceptions**, subject to projection
and misperception, not direct measurement of the alters.

**Frame all outputs as network composition / exposure / homophily, not as evidence of causal
contagion.** Causal claims need longitudinal designs (repeated waves with sociometric, not just
egocentric, data), and ideally exogenous variation.

## Adolescent in-school variant (roster-based)

For adolescent / in-school designs, the recommended modification is to **swap free recall for a
fixed-choice roster nomination**, which is the dominant approach in school peer-influence
research (e.g. ADVANCE, MECHANISMS): students nominate their closest friends from a pre-loaded
roster of all eligible classmates/grade-mates.

Concretely, in a forked copy:

- Replace the `ng-behaviours` `NameGenerator` with one or more **`NameGeneratorRoster`** stages
  whose `dataSource` is a class/grade roster asset attached in Architect (a CSV/JSON of eligible
  students). Use `cardOptions`/`searchOptions`/`sortOptions` to make the roster searchable.
- Keep the behaviour-specific framing as prompts/`additionalAttributes` (e.g. "Which of these
  classmates do you usually vape with?"), so nominations stay behaviour-specific while drawing
  from a bounded, comparable choice set.
- The rest of the scaffold (EgoForm reference point, AlterForm perceived behaviours, OrdinalBin
  closeness, Narrative review) is unchanged.

Roster nomination yields bounded, cross-comparable networks suited to whole-network /
stochastic-actor-based (SIENA-style) analysis that can begin to disentangle selection from
influence — which free-recall egocentric data cannot. See the development protocol's
`NameGeneratorRoster` stages (`packages/development-protocol/protocol.json`) for the exact shape,
including `cardOptions`, `searchOptions`, and `sortOptions`.

## Suggested imagery (do not embed)

The template intentionally ships **without** an `assetManifest` (per the authoring guide: a
malformed manifest fails validation, and the validator does not cross-check asset references).
If a designer wants to add openly-licensed imagery in Architect — for the EgoForm/AlterForm
introduction panels or an `Information` cover stage — these public-domain / permissive sources
are suitable. Attach them as assets in Architect rather than embedding URLs in `protocol.json`.

- Unsplash (free to use, no attribution required) — search "friends exercising", "sharing a
  meal", "people socialising": https://unsplash.com/
- Pexels (free, permissive licence): https://www.pexels.com/
- CDC Public Health Image Library (PHIL), public domain (tobacco/health imagery):
  https://phil.cdc.gov/
- Wikimedia Commons (check each file's licence; many CC-BY / public domain):
  https://commons.wikimedia.org/
