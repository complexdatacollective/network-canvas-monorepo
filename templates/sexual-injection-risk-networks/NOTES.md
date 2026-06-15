# Sexual & Injection Risk Networks — design notes

Template #6 in the proposed Architect gallery slate
(`docs/protocol-template-proposals.md`). General case: mapping an ego's
transmission-relevant partnerships (sexual and/or injection) together with the
partner attributes and **timing** that drive HIV, STI, and bloodborne spread.

## Rationale

Egocentric partnership data — the **number, attributes, and timing** of an
individual's partnerships — is the backbone of HIV/STI transmission inference.
The major drivers a design like this must capture are:

- **Concurrency** (overlapping partnerships), which accelerates onward
  transmission far more than the same number of strictly sequential
  partnerships;
- **Serostatus mixing** (serodiscordant or unknown-status partnerships);
- **Relationship type**, because protective behaviour (e.g. condom use) differs
  systematically between main/steady, casual, and exchange/transactional
  partners;
- **Age and gender mixing**; and
- **Injection-equipment sharing** for bloodborne (HIV/HCV) risk.

This template differs from the existing **Test-to-PrEP** gallery protocol (which
maps PrEP-information _reach_ via a dyad census): here the focus is the ego's
**partnership portfolio and transmission risk**, including partnership _timing_.

## How partnership start/end dates enable concurrency analysis

Each `partner` node records `partnership_start` and `partnership_end` as
`datetime` (`DatePicker`, `parameters.type = "month"`). Month granularity matches
how respondents actually recall relationship timing and is the resolution used in
egocentric partnership surveys; full-day precision would be spurious.

With a start and end month for every partnership, two partnerships are
**concurrent** whenever their `[start, end]` intervals overlap. An ongoing
partnership is encoded by leaving `partnership_end` blank (or setting it to the
current month). From the exported network a researcher can therefore derive
standard concurrency measures — e.g. the **point prevalence of concurrency**
(share of partnerships overlapping a reference date), **`kappa_3`** /
mean-degree-based concurrency indices (Morris & Kretzschmar), and per-ego counts
of overlapping partnerships — directly from the dated intervals, without asking
the often-misunderstood "did you have overlapping partners?" question. Pairing the
dates with `partner_type`, `partner_serostatus`, and `condom_use` lets the same
dataset distinguish _low-risk_ concurrency (e.g. two protected, concordant
partnerships) from _high-risk_ concurrency (unprotected, serodiscordant, or
unknown-status overlap).

## Privacy / Anonymisation rationale

Partner identifiers in this domain are exceptionally sensitive: they can reveal a
third party's sexual behaviour, drug use, or HIV status without that person's
consent, and may expose the respondent to legal or social harm. The design
therefore takes two precautions:

1. **No real names are ever required.** The only identifier collected is
   `partner_label` — explicitly framed in the prompt as _initials or a private
   code_. It exists purely so the respondent can tell their partners apart while
   answering and place them on the sociogram.
2. **`partner_label` is encrypted at rest.** The variable carries
   `"encrypted": true`, and the **Anonymisation** stage (placed second, before
   any partner is named) has the respondent set a private passphrase. Network
   Canvas uses that passphrase to encrypt the labels so that **only the
   respondent** — not the interviewer and not the research team — can read them.
   The validation block requires a reasonably strong passphrase
   (`minLength: 8`, `maxLength: 64`). The Information stage that precedes it makes
   the confidentiality promise and defines the reference period.

All analytic variables (type, age, gender, serostatus, condom use, equipment
sharing, dates) are **non-identifying** and are not encrypted, so the de-identified
risk data remains fully analysable while identities stay private.

## Instruments & sources

Wording was adapted to be clinical and non-stigmatising from established HIV
behavioural-surveillance instruments and egocentric sexual-network studies:

- **CDC National HIV Behavioral Surveillance (NHBS)** — standardized
  interviewer-administered questionnaire covering demographics, sexual history,
  drug-use history, HIV testing, and prevention (PrEP). NHBS classifies sex
  partners as **main** ("someone you feel committed to above all others") vs
  **casual**, with **exchange/transactional** partners treated as a subset of
  casual partners — the basis for this template's `partner_type` categories.
  NHBS overview: https://pmc.ncbi.nlm.nih.gov/articles/PMC1804113/ ;
  program page (restored CDC mirror):
  https://restoredcdc.org/www.cdc.gov/hiv-data/nhbs/index.html ;
  partner-type classification in an NHBS-MSM analysis:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC3078881/
- **NHBS among People Who Inject Drugs (NHBS-PWID)** — collects sharing of
  **needles/syringes, cookers, cotton, and water**; this list informs the
  injection-partner name-generator prompt and the `shared_injection_equipment`
  question. https://pmc.ncbi.nlm.nih.gov/articles/PMC5759767/ ;
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4584803/
- **ARTnet** (Weiss et al.) — population-based **egocentric** network study of
  MSM in the US that asked respondents to report the **number, attributes, and
  timing** of their sexual partnerships, stratified by partnership type (main,
  casual, one-time) and HIV status; the model for collecting per-partnership
  start/end dates to support concurrency and partnership-duration analysis.
  https://www.medrxiv.org/content/10.1101/19010579v1.full ;
  https://www.sciencedirect.com/science/article/pii/S1755436519301409
- **Condom-use frequency** — the 5-point ordinal
  (never / sometimes / about half the time / usually / always) follows the
  standard always→never frequency scale used widely in HIV-prevention research
  (e.g. always / more than half / about half / less than half / never):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC2575000/
- **Partner serostatus** categories (living with HIV / HIV-negative / unknown)
  follow standard perceived-serostatus / serosorting measurement in egocentric
  HIV network studies: https://pmc.ncbi.nlm.nih.gov/articles/PMC5985831/
- **Concurrency theory** — Morris M, Kretzschmar M. _Concurrent partnerships and
  the spread of HIV._ AIDS. 1997 — motivates capturing partnership timing rather
  than only partner counts.
- **Network Canvas method** — Hogan B, et al. _Network Canvas: Key decisions in
  the design of an interviewer-assisted network data collection software suite._
  Social Networks. 2021.

## Codebook / stage summary

- **Node `partner`** — `partner_label` (text, required, **encrypted**),
  `partner_type` (categorical: main/steady, casual, exchange/transactional,
  other), `partner_age` (number), `partner_gender` (categorical),
  `partner_serostatus` (categorical: living with HIV / HIV-negative / unknown),
  `condom_use` (ordinal, 5-point), `shared_injection_equipment` (boolean),
  `partnership_start` / `partnership_end` (datetime, `DatePicker`, month),
  `layout` (layout, for the sociogram).
- **Ego** — `ego_hiv_status` (categorical), `on_prep` (boolean),
  `on_art` (boolean), `last_hiv_test` (datetime, month), `injects_drugs`
  (boolean).
- **Edge `knows`** — partner–partner overlap; optional `ever_had_sex` (boolean).
- **Stages (7):** Information (confidentiality + reference period) →
  Anonymisation (passphrase) → EgoForm → NameGenerator (sexual partners) →
  NameGenerator (injection partners, same node type) → AlterForm (all partnership
  attributes incl. start/end dates) → Sociogram (`knows` edges, network overlap).

### Implementation notes

- Categorical single-select variables use `ToggleButtonGroup` with
  `validation.maxSelected = 1` (the schema permits only `CheckboxGroup` /
  `ToggleButtonGroup` for `categorical`; `RadioGroup` is reserved for `ordinal`).
- The two name generators share the `partner` node type, so the same individual
  can be enumerated as both a sexual and an injection partner; the injection
  prompt tells respondents to reuse the same label, and the AlterForm then
  captures both `condom_use` and `shared_injection_equipment` per partner.
- Both name generators set `behaviours.minNodes = 0` so a respondent with no
  partners of a given kind in the reference period can proceed.
- `assetManifest` is intentionally omitted per the authoring guide. No external
  assets are required for this protocol to run.

## Suggested images (not embedded)

If the gallery entry or Information stage wants illustrative imagery, use
openly-licensed sources and attach them in Architect rather than embedding URLs
in `protocol.json`:

- Network/abstract-connection graphics — Unsplash (Unsplash License, free for
  commercial use, no attribution required): https://unsplash.com/s/photos/network
- HIV-awareness red ribbon — Wikimedia Commons (public-domain SVG):
  https://commons.wikimedia.org/wiki/File:Red_Ribbon.svg
- Public-health / harm-reduction stock imagery — CDC Public Health Image Library
  (PHIL), most images public domain: https://phil.cdc.gov/

Confirm each image's licence before use.
