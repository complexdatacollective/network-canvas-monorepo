# Proposed Template Protocols for Architect

> **Status:** Proposal for discussion. Six candidate template protocols to add to the
> Architect "Use this template" library / Protocol Gallery, drawn from a review of the
> social-network-analysis and public-health literature and an audit of the existing gallery.
>
> Each template is named for the **general method/construct it exemplifies** (not a single
> study), and each is sketched as a sequence of **≥5 stages** using real schema-v8 stage types.
>
> **Audience:** Network Canvas team / protocol design leads.

## 1. Background

Network Canvas is an **interviewer-assisted, visual, _egocentric_ (personal-network)**
data-collection suite: a respondent (ego) names network members (alters), reports attributes
of each alter, and — where the design calls for it — reports the ties _among_ alters. A good
template must therefore be expressible as a sequence of name generators, interpreters, and
sociogram/visualisation stages.

The software's primary users are **NIH-funded researchers** studying disease spread, social
contagion of health states/behaviours, and migrant-community integration. These six templates
give those researchers credible, literature-aligned starting points to fork, while each
showcases a distinct Network Canvas technique.

### 1.1 The proposed slate

| #   | Template (general case)              | Exemplar / population                                                    | Signature technique it showcases                                                         |
| --- | ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | **Transnational Networks**           | Migrant / immigrant integration                                          | `Geospatial` origin-mapping + paired host/transnational name generators                  |
| 2   | **Mental Health Networks**           | Support & strain in mental-health management                             | **Dual-tone** name generators (supportive _and_ difficult ties) + disclosure mapping     |
| 3   | **Social Connection & Isolation**    | Loneliness / ageing                                                      | Concentric `OrdinalBin` closeness + `EgoForm` with validated isolation/loneliness scales |
| 4   | **Behavioural Influence Networks**   | Health-behaviour contagion/diffusion (obesity, smoking/vaping, activity) | Multiplex behaviour-specific generators + ego/alter homophily capture                    |
| 5   | **Care & Support Networks**          | Functional support around a care episode (perinatal exemplar)            | Function-typed support generators + `CategoricalBin` formal-vs-informal sources          |
| 6   | **Sexual & Injection Risk Networks** | HIV / STI / bloodborne transmission                                      | Partnership enumeration with **start/end dates → concurrency** + `Anonymisation`         |

**How this fills gaps in the current gallery.** The existing gallery (Test-to-PrEP, JCOIN,
GATE, KAYA, Sixhumene, ROBUST) is concentrated on HIV-testing/PrEP and substance use, with
nothing for migration, mental health, ageing/loneliness, maternal/care support, or a reusable
behavioural-influence design. Template 6 deliberately differs from **Test-to-PrEP** (which maps
PrEP-information reach via a dyad census): it focuses on the ego's **partnership portfolio and
transmission risk**, including partnership _timing_ for concurrency. A respiratory
contact-diary template (POLYMOD-style) remains a strong future addition but is out of scope for
this slate per current priorities.

### 1.2 Capabilities these build on

Stage types (schema v8, `packages/protocol-validation/src/schemas/8/stages/`): `EgoForm`,
`Information`, `NameGenerator`, `NameGeneratorQuickAdd`, `NameGeneratorRoster`, `FamilyPedigree`,
`DyadCensus`, `OneToManyDyadCensus`, `TieStrengthCensus`, `Sociogram`, `Narrative`, `OrdinalBin`,
`CategoricalBin`, `AlterForm`, `AlterEdgeForm`, `Geospatial`, `Anonymisation`.

Variable types: `text`, `number`, `boolean`, `ordinal`, `categorical`, `datetime`, `scalar`,
`layout`, `location`. Components: `Text`/`TextArea`, `Number`, `Boolean`/`Toggle`,
`RadioGroup`/`CheckboxGroup`/`ToggleButtonGroup`, `LikertScale`, `VisualAnalogScale`,
`DatePicker`/`RelativeDatePicker`.

---

## 2. Templates & stage sketches

Each template lists **why / who**, its **signature technique**, key **codebook** elements, and a
**stage sketch** (the minimum viable sequence; all are ≥5 stages and can be trimmed or extended).

---

### Template 1 — Transnational Networks

_General case of: personal networks that span a host society and one or more origin/other
countries (migrant integration, structural assimilation vs transnationalism)._

**Why / who.** Personal-network measures of host-country ties vs origin-country ties predict
integration outcomes above and beyond individual traits (Vacca, Solano, Lubbers, Molina &
McCarty, _Social Networks_, 2018); transnational ties have mixed mental-health effects; a 2025
_International Migration_ review centres support and social capital. Users: migration
sociologists, immigrant-health and refugee-resettlement researchers.

**Signature technique.** Two parallel name generators (host vs transnational) plus the `Geospatial`
map stage — the gallery's first real use of map-based ego networks.

**Codebook.** _Ego:_ country of birth, arrival year, residency context, language proficiency,
acculturative-stress items. _Node `person`:_ relationship, alter country of origin, current
location (`location`), co-ethnic (`boolean`), shared language, how/where met, support provided.
_Edge `knows`:_ alter–alter ties (density).

**Stage sketch.**

1. `Information` — study intro, consent framing.
2. `EgoForm` — migration history & background.
3. `NameGenerator` — **host-country** important ties.
4. `NameGenerator` — **transnational** ties (origin country / elsewhere abroad).
5. `Geospatial` — place each alter on a world map (origin and/or current residence).
6. `CategoricalBin` — sort alters by support type / co-ethnicity.
7. `Sociogram` (`knows` prompt) — alter–alter ties for network density.
8. `Narrative` — review the integrated local↔transnational picture.

---

### Template 2 — Mental Health Networks _(new)_

_General case of: how personal networks both support and strain people managing a mental-health
condition — supportive ties, difficult/draining ties, disclosure, and help-seeking pathways._

**Why / who.** People managing mental-health problems often have smaller, "fractious" networks;
they actively seek effective confidants while fearing stigma and rejection, and may restrict
ties during acute periods (BMC Psychiatry, 2020, _Negotiating support…_; multilevel studies of
support networks in severe mental disorders). Support is multidimensional (emotional,
informational, instrumental, appraisal) and **negative ties independently harm wellbeing** —
so a credible design must capture both poles. Users: psychiatric-epidemiology, recovery/peer-support,
and mental-health-services researchers.

**Signature technique.** **Dual-tone elicitation** — separate generators for _supportive_ and
_difficult/draining_ ties (the same alter can appear in both → ambivalent ties), plus
disclosure ("who knows") and a formal-vs-informal help-seeking split. No current template
captures negative ties.

> _Sensitivity note for the template:_ include interviewer framing and a safety/closing screen;
> this is an emotionally sensitive topic.

**Codebook.** _Ego:_ a brief validated distress/wellbeing screen (e.g. K6-style `ordinal`
items), self-rated mental health, treatment status. _Node `person`:_ relationship, support types
provided (`categorical` multi: emotional/informational/instrumental/appraisal), is a
formal/clinical source (`boolean`), knows about my condition / disclosure (`boolean`), contact
frequency, closeness, **is a source of stress/conflict** (`boolean`).

**Stage sketch.**

1. `Information` — intro, sensitive-topic framing, consent.
2. `EgoForm` — background + brief distress/wellbeing screen.
3. `NameGenerator` — **supportive ties** ("people you can talk to / who support you").
4. `NameGenerator` — **difficult/draining ties** ("people who are a source of stress or conflict").
5. `AlterForm` — per alter: relationship, support types, disclosure, formal/clinical, frequency.
6. `OrdinalBin` — closeness / reliance.
7. `CategoricalBin` — sort help sources into **informal vs formal/clinical** (help-seeking pathways).
8. `Narrative` — review supportive vs difficult ties (preset highlighting) + closing/safety screen.

---

### Template 3 — Social Connection & Isolation

_General case of: distinguishing objective social isolation (network structure) from subjective
loneliness, with validated scales (ageing/loneliness is the lead exemplar)._

**Why / who.** Isolation and loneliness are distinct and both predict heart disease, depression,
and cognitive decline (National Academies, 2020; U.S. Surgeon General advisory, 2023; NIA
portfolio); ~28% of older adults live alone but aren't necessarily lonely — so capture both the
structure and validated subjective measures. Users: NIA-funded ageing researchers,
social-prescribing/befriending evaluations.

**Signature technique.** Concentric `OrdinalBin` closeness map + standardised scales embedded in
`EgoForm` (UCLA-3, De Jong Gierveld 6-item, Lubben LSNS-6), so structure and subjective
loneliness sit in one dataset.

**Codebook.** _Ego:_ loneliness/isolation scale items (`ordinal` `LikertScale`), living
situation, self-rated health. _Node `person`:_ relationship, contact frequency, contact mode
(`categorical` multi: in-person/phone/digital), lives with ego (`boolean`), provides
emotional/practical support (`boolean`), age band. _Edge `knows`:_ alter–alter ties (fragmentation).

**Stage sketch.**

1. `EgoForm` (A) — demographics + living situation.
2. `NameGenerator` — confidants & important others.
3. `OrdinalBin` — drag alters into concentric closeness bands ("very close → not close").
4. `AlterForm` — contact frequency, mode, support, co-residence, age band.
5. `Sociogram` (`knows` prompt) — alter–alter ties → isolated vs connected core.
6. `EgoForm` (B) — UCLA-3 / De Jong Gierveld / LSNS-6 scale items.

---

### Template 4 — Behavioural Influence Networks

_General case of: social influence/diffusion of health behaviour ("contagion") — obesity,
smoking/vaping, physical activity, diet, alcohol._

**Why / who.** The foundational social-contagion work (Christakis & Fowler, _NEJM_ 2007 on
obesity; 2008 on smoking; "three degrees of influence") and a large adolescent-network
literature (vaping, alcohol; cohesion vs structural equivalence; influence vs homophily) motivate
a reusable, behaviour-agnostic measurement scaffold — distinct from ROBUST's single obesity
_intervention_. Users: obesity/behavioural-health researchers; NIDA adolescent substance-use/vaping
studies; activity/nutrition interventionists.

> _Methodological note for the template:_ egocentric data measures **homophily and perceived
> exposure** cleanly; _causal_ contagion from observational network data is contested
> (Christakis–Fowler estimates were challenged on confounding grounds). Frame outputs as
> exposure/composition, not proof of contagion.

**Signature technique.** Behaviour-specific name generators (the same alter recurs across
behaviours → multiplex), with per-behaviour alter attributes and an ego self-report reference
point for homophily.

**Codebook.** _Ego:_ own behaviour measures (e.g. activity minutes/week, smoking/vaping status,
diet). _Node `person`:_ relationship, closeness, and **per-behaviour perceived status**
(`alter_smokes` `categorical`, `alter_active` `ordinal`, `alter_diet` `ordinal`, …).

**Stage sketch.**

1. `EgoForm` — ego's own behaviours (homophily reference).
2. `NameGenerator` — behaviour-specific prompts ("people you **exercise** with," "**eat** with,"
   "**smoke/vape** with," "**drink** with"). _(For in-school adolescent designs, swap to a
   `NameGeneratorRoster` against a class/grade list for fixed-choice peer nomination.)_
3. `CategoricalBin` / `AlterForm` — record each alter's perceived behaviour per relevant domain.
4. `OrdinalBin` — closeness / contact frequency (moderates influence).
5. `Sociogram` or `Narrative` — review behavioural clustering across the network.

---

### Template 5 — Care & Support Networks

_General case of: who provides which functions of support across formal and informal sources
during a care episode (perinatal/maternal health is the lead exemplar; reusable for caregiving,
chronic-disease self-management, recovery)._

**Why / who.** Maternal/perinatal health is an NIH equity priority (maternal-mortality crisis;
IMPROVE initiative); stronger perinatal support predicts lower postpartum depression and better
infant social-emotional outcomes, and support spans informal (partner, family, peer parents) and
formal (OB/midwife, doula, CHW, home-visiting nurse) sources across functions (emotional,
informational, instrumental, financial). Users: maternal-and-child-health, perinatal-mental-health,
home-visiting/doula-program researchers.

**Signature technique.** Function-typed support generators (same person recurs across functions;
unfilled functions surface as **support gaps**) + a formal-vs-informal `CategoricalBin` split.

**Codebook.** _Ego:_ care-episode stage (e.g. pregnancy/postpartum via `RelativeDatePicker`),
brief mood screen (EPDS-style `ordinal`), living situation. _Node `supporter`:_ relationship,
formal vs informal (`categorical`), support functions provided (`categorical` multi:
emotional/informational/practical-childcare/financial), proximity (`categorical`: same household/
nearby/distant/online), contact frequency, reliance/closeness.

**Stage sketch.**

1. `EgoForm` — care-episode context + brief mood screen.
2. `NameGenerator` — function-typed prompts ("who gives **emotional** support," "who you ask for
   **information/advice**," "who helps with **practical/childcare** tasks," "who provides
   **financial** help").
3. `CategoricalBin` — sort supporters into **formal vs informal** (and by function).
4. `AlterForm` — proximity, frequency, reliance per supporter.
5. `OrdinalBin` — reliance/closeness banding.
6. `Narrative` — review the support map and visible gaps with the participant.

---

### Template 6 — Sexual & Injection Risk Networks _(new)_

_General case of: mapping an ego's transmission-relevant partnerships (sexual and/or injection)
with the attributes and **timing** that drive HIV/STI/bloodborne spread._

**Why / who.** Egocentric partnership data — number, attributes, and **timing** of partnerships —
underpins HIV/STI transmission inference (e.g. the ARTnet study of MSM egocentric sexual networks).
Key drivers include partner **concurrency** (overlapping partnerships), unknown/serodiscordant
**serostatus mixing**, relationship type (condom use differs for "serious" vs "casual"), age/race
mixing, and injection-equipment sharing. Users: HIV/STI epidemiologists, "Ending the HIV Epidemic"
programmes, harm-reduction researchers. _(Distinct from Test-to-PrEP, which maps PrEP-information
reach via a dyad census.)_

**Signature technique.** Partnership enumeration capturing **start & end dates per partnership**
(`DatePicker`) so researchers can derive concurrency, plus the `Anonymisation` stage to protect
sensitive partner identifiers.

**Codebook.** _Ego:_ demographics, HIV status, PrEP/ART use, testing history, injection status.
_Node `partner`:_ partner type (`categorical`: main/casual/exchange), age, gender, perceived
HIV/STI serostatus (`categorical`: pos/neg/unknown), condom use (`ordinal`), injection-equipment
sharing (`boolean`), partnership **start** & **end** dates (`datetime`).

**Stage sketch.**

1. `Information` — intro, confidentiality/anonymity framing, reference period (e.g. past 6–12 months).
2. `Anonymisation` — passphrase to encrypt partner identifiers.
3. `EgoForm` — demographics, HIV/PrEP/ART/testing status, injection status.
4. `NameGenerator` (or `NameGeneratorQuickAdd`) — enumerate **sexual partners** in the reference period.
5. `NameGenerator` — enumerate **injection partners** (people injected with) _(optional, study-dependent)_.
6. `AlterForm` / `AlterEdgeForm` — per partnership: type, partner age/gender, serostatus, condom use,
   equipment sharing, **start/end dates** (for concurrency).
7. `Sociogram` or `DyadCensus` — optional: ties among partners / network overlap.

---

## 3. Build & shipping notes

Templates are **URL-referenced `.netcanvas` files** (not bundled): URLs live in
`apps/architect/src/config/index.ts`; the library UI is in
`apps/architect/src/components/Home/{Home,LibraryPanel}.tsx`. A `.netcanvas` is a ZIP of
`protocol.json` (schema v8) + `assets/`; the richest worked reference is
`packages/development-protocol/protocol.json` (all stage/variable types exercised).

**To ship:** author each `protocol.json` against the v8 Zod schema (validate with
`@codaco/protocol-validation`; sanity-check shapes with `@codaco/protocol-utilities`
`generateNetwork`), package as `.netcanvas`, host on `assets.networkcanvas.com`, and register in
the Architect library config + gallery (lead each gallery entry with its signature technique).

**Suggested build order:** **3 (Social Connection & Isolation)** and **2 (Mental Health Networks)**
first — broad reuse, self-contained, no external rosters; then **6 (Sexual & Injection Risk)** and
**5 (Care & Support)**; then **1 (Transnational)** — needs `Geospatial`/Mapbox config — and **4
(Behavioural Influence)** with both free-recall and roster variants.

---

## 4. References

- Vacca R, Solano G, Lubbers MJ, Molina JL, McCarty C. _A personal network approach to the study
  of immigrant structural assimilation and transnationalism._ Social Networks. 2018;53:72–89.
- Vacca R, et al. _Social networks in migration and migrant incorporation: New developments and
  challenges._ International Migration. 2025.
- _Negotiating support from relationships and resources: a longitudinal study examining the role of
  personal support networks in the management of severe and enduring mental health problems._ BMC
  Psychiatry. 2020;20:50.
- _The structure of social support: a multilevel analysis of the personal networks of people with
  severe mental disorders._ (PMC9661735.)
- National Academies of Sciences, Engineering, and Medicine. _Social Isolation and Loneliness in
  Older Adults: Opportunities for the Health Care System._ 2020.
- Office of the U.S. Surgeon General. _Our Epidemic of Loneliness and Isolation._ 2023.
- De Jong Gierveld J, Van Tilburg T. _A 6-item scale for overall, emotional, and social
  loneliness._ Research on Aging. 2006. (Also UCLA 3-item scale; Lubben LSNS-6, The Gerontologist,
  2006.)
- Christakis NA, Fowler JH. _The Spread of Obesity in a Large Social Network over 32 Years._ NEJM.
  2007;357:370–379.
- Christakis NA, Fowler JH. _The Collective Dynamics of Smoking in a Large Social Network._ NEJM.
  2008;358:2249–2258.
- Weiss RE, et al. _Egocentric Sexual Networks of Men Who Have Sex with Men in the United States:
  Results from the ARTnet Study._ (medRxiv / Epidemics, 2020.)
- Morris M, Kretzschmar M. _Concurrent partnerships and the spread of HIV._ AIDS. 1997 — on
  partnership concurrency and transmission.
- Hogan B, et al. _Network Canvas: Key decisions in the design of an interviewer-assisted network
  data collection software suite._ Social Networks. 2021.

(Perinatal social-support studies linking support to postpartum depression and infant outcomes,
and adolescent vaping/substance-use network studies, also informed Templates 5 and 4; full
citations available on request.)
