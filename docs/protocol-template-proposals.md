# Proposed Template Protocols for Architect

> **Status:** Proposal for discussion. Five candidate template protocols to add to the
> Architect "Use this template" library / Protocol Gallery, drawn from a review of the
> social-network-analysis and public-health literature and an audit of the existing gallery.
>
> **Audience:** Network Canvas team / protocol design leads.

## 1. Background

Network Canvas is an **interviewer-assisted, visual, _egocentric_ (personal-network)**
data-collection suite: a respondent (ego) names network members (alters), reports attributes
of each alter, and — where the design calls for it — reports the ties _among_ alters. This
shapes what makes a good template: it must be expressible as a sequence of name generators,
interpreters, and sociogram/visualisation stages, not as a whole-network roster of a closed
population (though roster-based "lookup" designs are supported too).

The software's primary users are **NIH-funded researchers** studying:

- **disease spread** through social, behavioural, and physical-proximity ties;
- **social contagion** of health states and behaviours (obesity, smoking, etc.);
- **migrant / immigrant community** integration, support, and transnational ties.

The goal of these templates is to give those researchers a credible, literature-aligned
_starting point_ they can fork and adapt, while each template also showcases a distinct
Network Canvas data-collection technique.

### 1.1 What the gallery already covers (audit)

From `protocolgallery.networkcanvas.com`:

| Existing protocol | Domain | Signature technique |
|---|---|---|
| **Test-to-PrEP** | HIV testing / PrEP information reach | Dyad census over all alter pairs + per-alter edge forms |
| **JCOIN** | Substance-use disorder, justice-involved | Support + drug-use network structure |
| **GATE** | Opioid treatment, prison re-entry | Multiple name generators across relationship domains; ego–alter pair attributes |
| **KAYA** | Dementia caregiving, rural South Africa | Side panels within successive name generators (reduce burden) |
| **Sixhumene** | Youth sexual health, South Africa | Longitudinal lookup rosters; whole-network across 3 waves |
| **ROBUST** | Obesity reduction via social ties | Narrative interface as a visualisation tool |

**Coverage gaps.** The gallery is heavy on **HIV/STI** and **substance use** (3 of 6
protocols) and on **sub-Saharan-African field studies**. It has **nothing** for:

- **migrant / immigrant networks** — despite this being a named core user base;
- **respiratory / airborne infectious-disease contact patterns** (the dominant paradigm
  for transmission modelling since COVID-19);
- **social isolation & loneliness in ageing** — a top-tier NIH/NIA and Surgeon-General
  priority;
- **maternal & perinatal** health and support — a flagship NIH equity priority;
- a **reusable behavioural-contagion measurement design** that isn't tied to one behaviour
  (ROBUST is specifically an obesity _intervention_ visualisation).

The five proposals below target exactly these gaps.

### 1.2 Network Canvas capabilities these proposals build on

For reference, the stage types available in schema v8 (`packages/protocol-validation/src/schemas/8/stages/`)
and used below:

`EgoForm`, `Information`, `NameGenerator`, `NameGeneratorQuickAdd`, `NameGeneratorRoster`,
`FamilyPedigree`, `DyadCensus`, `OneToManyDyadCensus`, `TieStrengthCensus`, `Sociogram`,
`Narrative`, `OrdinalBin`, `CategoricalBin`, `AlterForm`, `AlterEdgeForm`, `Geospatial`,
`Anonymisation`.

Variable types: `text`, `number`, `boolean`, `ordinal`, `categorical`, `datetime`, `scalar`,
`layout`, `location`. Components include `Text`/`TextArea`, `Number`, `Boolean`/`Toggle`,
`RadioGroup`/`CheckboxGroup`/`ToggleButtonGroup`, `LikertScale`, `VisualAnalogScale`,
`DatePicker`/`RelativeDatePicker`.

---

## 2. The five proposed templates

| # | Working title | Population / domain | Signature technique it showcases |
|---|---|---|---|
| 1 | **Pathways** — Migrant Integration & Transnational Networks | Immigrants / migrants | `Geospatial` origin-mapping + paired host/transnational name generators |
| 2 | **Daily Contacts** — Respiratory Contact-Pattern Diary | Infectious-disease transmission | High-volume `NameGeneratorQuickAdd` + `RelativeDatePicker` reference day + `CategoricalBin` settings |
| 3 | **Circles** — Social Connection & Loneliness in Older Adults | Ageing / social isolation | Concentric `OrdinalBin` closeness + `EgoForm` with validated loneliness scales |
| 4 | **Ripple** — Health-Behaviour Social Influence | Behavioural contagion (multi-behaviour) | Multiplex behaviour-specific name generators + ego/alter homophily capture |
| 5 | **Beginnings** — Perinatal & Maternal Support Networks | Maternal / perinatal health | Function-typed support generators + `CategoricalBin` formal-vs-informal sources |

Each section gives: **why** (literature + who would use it), **what it measures**, the
**Network Canvas build** (codebook + stage sequence + key variables), and **distinctiveness**
versus the existing gallery.

---

### Template 1 — *Pathways*: Migrant Integration & Transnational Networks

**Why.** Personal-network analysis is the dominant method for studying how migrants
integrate into a host society while maintaining ties to their origin country. The canonical
design measures **structural assimilation** (the share/strength of host-country ties) against
**transnationalism** (ties back to the origin country), and shows these network features
predict integration outcomes *over and above* individual characteristics like nationality,
age, years since migration, and education (Vacca, Solano, Lubbers, Molina & McCarty, *Social
Networks*, 2018). Transnational ties cut both ways for mental health — visits and remittances
can be protective *or* a source of strain, e.g. for depression among Latino immigrants — so
researchers need to capture tie *direction and composition*, not just count. A 2025 *International
Migration* review (Vacca et al.) frames social support and social capital as the dominant
lenses and calls for designs that connect **local and transnational** networks. This community
(McCarty, Molina, Lubbers, Vacca — the EgoNet lineage) is a natural Network Canvas audience and
is currently unserved by the gallery.

**Who uses it.** Migration sociologists; immigrant-health and health-equity researchers;
refugee-resettlement and acculturative-stress studies.

**What it measures.** Network composition (co-ethnic vs host-national vs other-origin),
geographic spread of ties (here vs origin country vs third countries), support by type
(emotional, informational, practical, financial), tie origin (how/where met), and the
density/structure of the personal network.

**Network Canvas build.**

- **Codebook**
  - Ego variables: country/region of birth (`categorical`), year of arrival
    (`datetime`/`RelativeDatePicker`), legal/residency context (`categorical`), language
    proficiency (`ordinal` `LikertScale`), a short acculturative-stress / wellbeing scale
    (`ordinal`), generation.
  - Node type **person** with variables: relationship (`categorical`), alter's
    country of origin (`categorical`), where the alter currently lives (`location`),
    co-ethnic (`boolean`), language spoken together (`categorical`), how/where they met
    (`categorical`: in origin country / on arrival / through work / family / etc.), support
    provided (`categorical` multi-select), closeness (`ordinal`).
  - Edge type **knows** for alter–alter ties (to compute density / clustering).
- **Stage sequence**
  1. `Information` — study intro & consent framing.
  2. `EgoForm` — migration history & background.
  3. `NameGenerator` (host-country ties) — "people here who are important to you."
  4. `NameGenerator` (transnational ties) — "people in [origin country] or elsewhere abroad
     who are important to you." *(Two parallel generators make the host/transnational split a
     first-class structural variable.)*
  5. `Geospatial` — **signature step:** place each alter on a world map (origin and/or current
     residence), producing the local↔transnational geometry that defines this literature.
  6. `CategoricalBin` — sort alters by support type / co-ethnicity.
  7. `Sociogram` with a `knows` edge prompt — capture alter–alter ties for density.
  8. `Narrative` — review the integrated picture with the participant.

**Distinctiveness.** No existing gallery protocol is about migration, and **`Geospatial` is
essentially unused** in the gallery — this template would be the flagship demonstration of
map-based ego-network data and of the host-vs-transnational dual-generator pattern.

---

### Template 2 — *Daily Contacts*: Respiratory Contact-Pattern Diary

**Why.** Transmission models for airborne/close-contact infections (influenza, RSV,
SARS-CoV-2, TB, measles) are built on **social contact surveys** — the "who-meets-whom"
mixing matrices pioneered by POLYMOD (Mossong et al., *PLoS Medicine*, 2008; 5(3):e74) across
eight European countries, and since standardised by a systematic review of contact surveys
(Hoang et al., *Epidemiology*, 2019). Network Canvas's own positioning papers explicitly pitch
it as a tool for **contact-network data** for epidemiology, yet the gallery's only
transmission-adjacent protocol (Test-to-PrEP) is HIV/sexual-network, not respiratory. A
contact-diary template directly serves NIH pandemic-preparedness and respiratory-disease
modelling work and is highly reusable across pathogens and settings.

**Who uses it.** Infectious-disease epidemiologists and modellers; pandemic-preparedness
programmes; school/workplace transmission studies.

**What it measures (per the standardised contact-survey design).**

- **Contact definition** offered to interviewers two ways: *physical* (skin-to-skin —
  handshake, hug) and *conversational* (a two-way exchange of ≥3 words within ~2 m).
- **Reference period:** the **previous day** (POLYMOD standard), ideally one weekday + one
  weekend day — implemented with a `RelativeDatePicker` anchored to "yesterday."
- **Per-contact attributes** (the review's most-collected fields): age (`number`/`ordinal`
  band) and sex (`categorical`) of contact — recorded by ~56%+ of surveys; **setting/location**
  (~77%): home / work / school / transport / leisure / other; **duration** (~67%); **frequency**
  (~52%: daily / weekly / first time); whether **physical**; and optional **mask/PPE use** and
  **symptoms**.
- Typical volume ~8–14 contacts/day (much higher in school settings), so capture must be fast.

**Network Canvas build.**

- **Codebook:** node type **contact** with the attribute set above; ego variables for
  age band, household size, occupation, and the diary day.
- **Stage sequence**
  1. `Information` — defines what counts as a "contact" (physical vs conversational), with the
     2 m / 3-word rule shown to the interviewer.
  2. `EgoForm` — demographics + `RelativeDatePicker` to fix the reference day.
  3. `NameGeneratorQuickAdd` — **signature step:** rapidly enumerate every contact from the
     reference day using a minimal single-field add (initials/identifier). High-volume,
     low-friction entry is exactly what `QuickAdd` is for.
  4. `CategoricalBin` — sort contacts by **setting** (home/work/school/transport/leisure/other).
  5. `AlterForm` — per-contact form: age band, sex, duration, frequency, physical (y/n),
     mask use, symptoms. (`TieStrengthCensus` is an alternative for an ordinal "intensity"
     read if alter–alter mixing is in scope.)
  6. `Information` — close-out / repeat-for-second-day prompt.

**Distinctiveness.** Brings the **POLYMOD/contact-diary paradigm** — the backbone of modern
transmission modelling — into the gallery for the first time, and showcases high-throughput
`NameGeneratorQuickAdd` + reference-day `RelativeDatePicker`, a different technique mix from
every existing protocol.

---

### Template 3 — *Circles*: Social Connection & Loneliness in Older Adults

**Why.** Social isolation and loneliness in older adults are a flagship public-health
priority: the National Academies' 2020 report *Social Isolation and Loneliness in Older Adults*
and the 2023 U.S. Surgeon General advisory *Our Epidemic of Loneliness and Isolation* both
tie them to heart disease, depression, and cognitive decline, and NIA funds a large portfolio
here (e.g. older adults living alone with cognitive impairment). Critically, **isolation
(objective, structural) and loneliness (subjective) are distinct** — ~28% of older adults live
alone but many are neither isolated nor lonely — so the design must capture *both* the network
structure and validated subjective measures. Egocentric methods are ideal, and researchers
increasingly examine **how networks change in response to loneliness** over time.

**Who uses it.** Gerontology / NIA-funded ageing researchers; social-prescribing and
befriending-intervention evaluations; caregiver-network studies.

**What it measures.** Network size and composition; emotional vs structural closeness;
contact frequency and **mode** (in-person / phone / digital); support function; co-residence;
intergenerational mix — paired with standardised loneliness/isolation instruments.

**Network Canvas build.**

- **Codebook**
  - Ego variables embedding **validated short scales** as `ordinal`/`LikertScale` items:
    UCLA 3-item loneliness, De Jong Gierveld 6-item (emotional + social loneliness), and the
    Lubben Social Network Scale (LSNS-6). Plus living situation and self-rated health.
  - Node type **person**: relationship (`categorical`), contact frequency (`ordinal`), contact
    mode (`categorical` multi-select), lives with ego (`boolean`), provides emotional support
    (`boolean`), provides practical support (`boolean`), alter age band (`ordinal`).
  - Edge **knows** for alter–alter ties (to read network fragmentation/bridging).
- **Stage sequence**
  1. `EgoForm` (A) — demographics + living situation.
  2. `NameGenerator` — confidants & important others ("people you discuss important matters
     with / who are important to you").
  3. `OrdinalBin` — **signature step:** drag each alter into concentric closeness bands
     ("very close → not close"), the classic participant-aided-sociogram closeness measure.
  4. `AlterForm` — contact frequency, mode, support, co-residence.
  5. `Sociogram` (`knows` prompt) — alter–alter ties to reveal isolation vs a connected core.
  6. `EgoForm` (B) — the UCLA / De Jong Gierveld / LSNS-6 scale items, so subjective
     loneliness sits alongside the objective network in one dataset.

**Distinctiveness.** First ageing/loneliness template; demonstrates **embedding standardised
psychometric instruments in `EgoForm`** and the concentric-`OrdinalBin` closeness map — and
deliberately captures the isolation-vs-loneliness distinction that the field insists on.

---

### Template 4 — *Ripple*: Health-Behaviour Social Influence

**Why.** "Social contagion" of health behaviour is the user base's named interest. The
foundational work — Christakis & Fowler on the spread of **obesity** (*NEJM*, 2007; 357:370–379)
and **smoking cessation** (*NEJM*, 2008; 358:2249–2258) in the Framingham network — proposed a
"three degrees of influence" pattern, and a large literature now studies behavioural influence
in **adolescent** networks (vaping, alcohol, marijuana) distinguishing **cohesion** (direct
ties) from **structural equivalence**, and **influence** from **homophily/selection**. Whereas
the gallery's ROBUST protocol is a *specific obesity-reduction intervention* using the narrative
interface, *Ripple* is a **reusable measurement scaffold** for behavioural exposure and
homophily that a researcher can retarget to any behaviour (physical activity, diet, smoking/
vaping, alcohol, screen time) and any population (adults or in-school adolescents).

> **Methodological honesty (worth surfacing in the template's notes):** egocentric data
> cleanly measures **behavioural homophily and perceived exposure**, but *causal* contagion
> claims from observational network data are contested (the Christakis–Fowler estimates were
> challenged on confounding/shared-environment grounds). The template should frame outputs as
> exposure/composition measures, not proof of contagion.

**Who uses it.** Behavioural-health and obesity researchers; NIDA-funded adolescent
substance-use / vaping studies; physical-activity and nutrition interventionists.

**What it measures.** For each behaviour domain: who the ego does it *with*, each alter's own
behaviour (as perceived by ego), tie closeness and frequency, and ego's own behaviour — yielding
exposure and homophily indices per behaviour.

**Network Canvas build.**

- **Codebook**
  - Ego variables: the ego's own behaviour measures (e.g. activity minutes/week `number`,
    smoking/vaping status `categorical`, diet `ordinal`).
  - Node type **person** with **multiplex** behaviour attributes: relationship (`categorical`),
    closeness (`ordinal`), and *per-behaviour* perceived status (e.g. `alter_smokes`
    `categorical`, `alter_active` `ordinal`, `alter_diet` `ordinal`).
- **Stage sequence**
  1. `EgoForm` — ego's own behaviours (the homophily reference point).
  2. **Behaviour-specific name generators** (`NameGenerator`), one per domain —
     "people you **exercise** with," "people you **eat meals** with," "people you **smoke/vape**
     with," "people you **drink** with." *(Behaviour-specific elicitation is the signature
     move; the same alter can recur, building a multiplex picture.)*
  3. `CategoricalBin` / `AlterForm` — record each alter's perceived behaviour for the relevant
     domain(s).
  4. `OrdinalBin` — closeness / contact frequency (influence is moderated by tie strength).
  5. `Sociogram` or `Narrative` — review clustering of behaviour in the network.

  *(For adolescent in-school designs, swap step 2's free recall for `NameGeneratorRoster`
  against a class/grade roster to support fixed-choice peer nomination.)*

**Distinctiveness.** Generalises beyond ROBUST's single-behaviour intervention into a
**multi-behaviour, multiplex influence-measurement** template, and demonstrates behaviour-specific
name generators + per-behaviour alter attributes — directly serving the "obesity *or other health
behaviours*" framing.

---

### Template 5 — *Beginnings*: Perinatal & Maternal Support Networks

**Why.** Maternal and perinatal health is a top NIH equity priority (the maternal-mortality
crisis; the NIH IMPROVE initiative). Social support during pregnancy and postpartum is a robust
protective factor: stronger perinatal support predicts **lower postpartum depression** and better
**infant social-emotional outcomes**, and support shortfalls — worsened during the pandemic's
social distancing — drive adverse maternal mental-health outcomes. Effective support spans
**informal** (partner, family, friends, peer mothers) and **formal** (OB/midwife, doula,
community health worker, home-visiting nurse) sources, and multiple **functions** (emotional,
informational, instrumental/practical, financial). Mapping who provides what — and where the gaps
are — is exactly an egocentric-network question, and nothing in the gallery addresses maternal
health.

**Who uses it.** Maternal-and-child-health and perinatal-mental-health researchers; home-visiting
and doula-program evaluations; SDOH-for-pregnant/postpartum studies.

**What it measures.** Support network size and composition; **formal vs informal** balance;
support by **function**; reliance/closeness; and gaps (functions with no provider) — alongside a
validated mood screen.

**Network Canvas build.**

- **Codebook**
  - Ego variables: pregnancy/postpartum stage (`categorical`/`RelativeDatePicker` from due/birth
    date), parity, an EPDS-style mood screen (`ordinal` `LikertScale`), living situation.
  - Node type **supporter**: relationship (`categorical`), **formal vs informal** (`categorical`),
    support functions provided (`categorical` multi-select: emotional / informational /
    practical / financial / childcare), contact frequency (`ordinal`), reliance/closeness
    (`ordinal`), proximity (`categorical`: same household / nearby / distant / online).
- **Stage sequence**
  1. `EgoForm` — pregnancy/postpartum context + EPDS items.
  2. **Function-typed name generators** (`NameGenerator`) — "who gives you **emotional**
     support," "who do you turn to for **information/advice** about pregnancy or the baby," "who
     helps with **practical/childcare** tasks," "who provides **financial** help." *(Function-first
     elicitation is the signature technique — the same person can appear under several functions,
     and unfilled functions surface as support gaps.)*
  3. `CategoricalBin` — sort supporters into **formal vs informal** (and by function).
  4. `AlterForm` — proximity, frequency, reliance per supporter.
  5. `OrdinalBin` — reliance/closeness banding.
  6. `Narrative` — review the support map and visible gaps with the participant.

**Distinctiveness.** First maternal/perinatal template; demonstrates **function-typed
multiplex support generators** and the formal-vs-informal `CategoricalBin` split — a support-mapping
pattern reusable for other support-centred studies (chronic-disease self-management, caregiving).

---

## 3. Build & shipping notes

How templates are wired today (confirmed in the codebase):

- Templates are **URL-referenced `.netcanvas` files**, not bundled in the app. The Sample and
  Development protocol URLs live in `apps/architect-web/src/config/index.ts`
  (`SAMPLE_PROTOCOL_URL`, `DEVELOPMENT_PROTOCOL_URL`); the library/tabs UI is in
  `apps/architect-web/src/components/Home/LibraryPanel.tsx` and `Home.tsx`. Selecting a
  template fetches the file and instantiates it via the protocol import → validate → migrate
  pipeline.
- A `.netcanvas` file is a ZIP of `protocol.json` (schema v8) plus an `assets/` folder. The
  richest worked reference is `packages/development-protocol/protocol.json` (28 stages, all
  stage/variable types exercised).

**Suggested path to ship these:**

1. Author each `protocol.json` against the v8 Zod schema (validate with
   `@codaco/protocol-validation`); use `packages/development-protocol` as the reference build,
   and `@codaco/protocol-utilities` `generateNetwork` to sanity-check shapes.
2. Package each as a `.netcanvas`, host on `assets.networkcanvas.com` alongside the Sample
   Protocol, and register them in the Architect library config + the Protocol Gallery.
3. Mirror the gallery's house style: each gallery entry leads with the **signature technique**
   (the right-hand column in §2's table) so the set reads as a methods showcase.

**Suggested build order** (impact × distinctiveness × low asset complexity):
**(2) Daily Contacts** and **(3) Circles** first — broadest reuse, self-contained, no external
rosters; then **(1) Pathways** (needs `Geospatial`/Mapbox config) and **(5) Beginnings**; then
**(4) Ripple** (offer both free-recall and roster variants).

---

## 4. References

Tool & method:

- Mossong J, Hens N, Jit M, et al. *Social Contacts and Mixing Patterns Relevant to the Spread
  of Infectious Diseases.* PLoS Medicine. 2008;5(3):e74. (POLYMOD)
- Hoang T, Coletti P, Melegaro A, et al. *A Systematic Review of Social Contact Surveys to
  Inform Transmission Models of Close-contact Infections.* Epidemiology. 2019;30(5):723–736.
- Hogan B, et al. *Network Canvas: Key decisions in the design of an interviewer-assisted
  network data collection software suite.* Social Networks. 2021.
- *Network Canvas: an open-source tool for capturing social and contact network data.* 2023
  (PMC10396415).
- Vacca R, Solano G, Lubbers MJ, Molina JL, McCarty C. *A personal network approach to the study
  of immigrant structural assimilation and transnationalism.* Social Networks. 2018;53:72–89.
- Vacca R, et al. *Social networks in migration and migrant incorporation: New developments and
  challenges.* International Migration. 2025.
- Lubbers MJ, Molina JL, McCarty C, et al. *Changing times: Migrants' social network analysis and
  the challenges of longitudinal research.* Social Networks. 2018.
- Christakis NA, Fowler JH. *The Spread of Obesity in a Large Social Network over 32 Years.* NEJM.
  2007;357:370–379.
- Christakis NA, Fowler JH. *The Collective Dynamics of Smoking in a Large Social Network.* NEJM.
  2008;358:2249–2258.
- National Academies of Sciences, Engineering, and Medicine. *Social Isolation and Loneliness in
  Older Adults: Opportunities for the Health Care System.* 2020.
- Office of the U.S. Surgeon General. *Our Epidemic of Loneliness and Isolation.* 2023.
- De Jong Gierveld J, Van Tilburg T. *A 6-item scale for overall, emotional, and social
  loneliness.* Research on Aging. 2006. (and the UCLA 3-item scale; Lubben LSNS-6, The
  Gerontologist, 2006.)

(Adolescent substance-use/vaping network studies in *Social Science & Medicine* and *Substance
Use & Misuse*, and perinatal social-support studies linking support to postpartum depression and
infant outcomes, also informed Templates 4 and 5; full citations available on request.)
