# Social Connection & Isolation — template notes

## Rationale

This template is the general case of **distinguishing objective social isolation from subjective
loneliness**, with ageing/loneliness as the lead exemplar. Social isolation and loneliness are
_distinct_ constructs that are only moderately correlated, and **both** independently predict
poor outcomes (cardiovascular disease, depression, cognitive decline, and mortality). A large
share of older adults live alone but are not lonely, and many people who are well-connected on
paper still feel lonely — so a credible design must capture **both** the _structure_ of the
network and _validated subjective_ measures, and let researchers analyse the gap between them.

### The isolation-vs-loneliness distinction (why both are measured here)

- **Objective social isolation** is a property of the _network_: how many people you are
  connected to, how often you have contact, whether ties overlap, and whether you have a
  connected core or a fragmented set of disconnected contacts. In this protocol it is captured
  _structurally_ by the **NameGenerator** (network size), the **AlterForm** (contact frequency,
  contact mode, co-residence, support functions), and the **OneToManyDyadCensus** (alter–alter
  `knows` ties → connected core vs. isolated nodes). The **Lubben LSNS-6** ego scale adds a validated
  count-based measure of network engagement that maps onto isolation.
- **Subjective loneliness** is the _felt_ discrepancy between desired and actual connection. It
  is captured by the two validated self-report loneliness scales embedded in the final EgoForm:
  the **UCLA 3-Item Loneliness Scale** and the **De Jong Gierveld 6-Item Loneliness Scale**
  (which further separates _emotional_ from _social_ loneliness).

Holding both in one dataset lets a researcher classify respondents on a 2×2 (isolated/not ×
lonely/not), which is the analytic payoff the National Academies (2020) and the U.S. Surgeon
General (2023) advisories call for.

### Signature technique

An **`OrdinalBin` closeness map** (drag each named alter into ordered "not close → very close"
bands) plus **standardised scales embedded in an `EgoForm`** (UCLA-3, De Jong Gierveld-6,
LSNS-6), so subjective closeness, network structure, and validated loneliness sit together.

## Stage flow

1. **EgoForm (A) — "About You":** living situation + self-rated health (context for isolation).
2. **NameGenerator — confidants:** the GSS "important matters" generator; the form collects only
   `alter_name`. Network _size_ here is itself an isolation indicator.
3. **OrdinalBin — closeness:** ordered bands for the `closeness` LikertScale variable.
4. **AlterForm — per-alter attributes:** relationship, age band, contact frequency, contact mode
   (multi-select), co-residence, and emotional/practical support — the composition side of
   isolation.
5. **OneToManyDyadCensus — alter–alter ties:** for each named person in turn, the respondent taps
   everyone else who knows them, creating `knows` edges. This systematic one-to-many census
   captures the complete tie set (for density, components, and isolates) far more reliably than a
   free-draw sociogram — which tends to under-capture ties — and is lower-burden than an all-pairs
   dyad census. Complete tie data is exactly what the isolation/fragmentation analysis needs.
6. **EgoForm (B) — loneliness & network scales:** UCLA-3, De Jong Gierveld-6, LSNS-6.

## Scales used, exact wording, and sources

All item wording is reproduced faithfully from the cited sources. Response options were encoded
as `ordinal` `LikertScale` variables. **Note on ordinal coding:** the authoring guide requires
ascending integer `value`s for ordinal options, so codes here run low→high in _presentation_
order; researchers should apply each scale's own published scoring/recoding rule (below) at
analysis time rather than summing the raw stored codes blindly.

### 1. UCLA 3-Item Loneliness Scale (Hughes, Waite, Hawkley & Cacioppo, 2004)

Items (`ucla_1`–`ucla_3`):

1. "How often do you feel that you lack companionship?"
2. "How often do you feel left out?"
3. "How often do you feel isolated from others?"

Response options (3-point): **Hardly ever (1) / Some of the time (2) / Often (3)**. Published
scoring sums the three items (range 3–9); higher = lonelier. (Our stored codes 1/2/3 already match
this direction.)

Sources:

- Hughes ME, Waite LJ, Hawkley LC, Cacioppo JT. _A Short Scale for Measuring Loneliness in Large
  Surveys: Results From Two Population-Based Studies._ Research on Aging. 2004;26(6):655–672.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC2394670/
- Item/response summary: https://ebchelp.blueprint.ai/en/articles/9912854-ucla-three-item-loneliness-scale-ucla-3

### 2. De Jong Gierveld 6-Item Loneliness Scale (De Jong Gierveld & Van Tilburg, 2006)

Emotional-loneliness items (negatively worded; `djg_1`–`djg_3`):

1. "I experience a general sense of emptiness."
2. "I miss having people around me."
3. "I often feel rejected."

Social-loneliness items (positively worded, reverse-scored; `djg_4`–`djg_6`): 4. "There are plenty of people I can rely on when I have problems." 5. "There are many people I can trust completely." 6. "There are enough people I feel close to."

Response options (3-point): **No (1) / More or less (2) / Yes (3)**.

**Scoring direction (important):** published scoring _dichotomises_ each item. For the three
**emotional** items, answers "more or less" and "yes" count as lonely (score 1). For the three
**social** items (positively worded), answers "no" and "more or less" count as lonely (i.e. they
are _reverse-scored_). Emotional and social subscales each range 0–3; the overall score is 0–6,
higher = lonelier. The raw 1/2/3 codes stored here must be recoded per this rule at analysis time.

Sources:

- De Jong Gierveld J, Van Tilburg T. _A 6-Item Scale for Overall, Emotional, and Social
  Loneliness: Confirmatory Tests on Survey Data._ Research on Aging. 2006;28(5):582–598.
  https://journals.sagepub.com/doi/10.1177/0164027506289723
  (open copy: https://research.vu.nl/files/887976/2006%20RoA%20deJongGierveld%20vTilburg%206-item%20scale%20loneliness.pdf)
- De Jong Gierveld J, Van Tilburg T. _The De Jong Gierveld short scales for emotional and social
  loneliness: tested on data from 7 countries in the UN generations and gender surveys._ European
  Journal of Ageing. 2010;7:121–130. https://pmc.ncbi.nlm.nih.gov/articles/PMC2921057/

### 3. Lubben Social Network Scale — 6 (LSNS-6) (Lubben et al., 2006)

Family items (`lsns_1`–`lsns_3`):

1. "How many relatives do you see or hear from at least once a month?"
2. "How many relatives do you feel at ease with that you can talk about private matters?"
3. "How many relatives do you feel close to such that you could call on them for help?"

Friend items (`lsns_4`–`lsns_6`): the same three questions with "friends" in place of "relatives".

Response options (6-point, with published numeric codes used directly here):
**None (0) / One (1) / Two (2) / Three or four (3) / Five thru eight (4) / Nine or more (5)**.

Scoring: equally-weighted sum of all six items (range 0–30); higher = more engaged / less
isolated. A clinical cut-point of **< 12** flags risk of social isolation. (Our stored 0–5 codes
match the published scoring directly.)

Sources:

- Lubben J, Blozik E, Gillmann G, et al. _Performance of an abbreviated version of the Lubben
  Social Network Scale among three European community-dwelling older adult populations._ The
  Gerontologist. 2006;46(4):503–513.
- Official LSNS-6 instrument (Boston College): https://www.bc.edu/content/dam/bc1/schools/sw/lubben/LSNS6.pdf
- Item/scoring reference: https://www.brandeis.edu/roybal/docs/LSNS_website_PDF.pdf

### 4. Name generator — GSS "important matters" confidant generator

Prompt (verbatim, 1985 GSS):

> "Looking back over the last six months, who are the people with whom you discussed matters
> important to you?"

This is the canonical confidant/"core discussion network" generator. In this template it produces
the `person` nodes whose count and inter-connectedness operationalise objective isolation.

Sources:

- Burt RS. _Network items and the General Social Survey._ Social Networks. 1984;6(4):293–339.
- Marsden PV. _Core Discussion Networks of Americans._ American Sociological Review.
  1987;52(1):122–131.
- GSS methodological report on the network item:
  https://gss.norc.org/content/dam/gss/get-documentation/pdf/reports/methodological-reports/MR040.pdf

## Background literature (construct rationale)

- National Academies of Sciences, Engineering, and Medicine. _Social Isolation and Loneliness in
  Older Adults: Opportunities for the Health Care System._ 2020.
- Office of the U.S. Surgeon General. _Our Epidemic of Loneliness and Isolation._ 2023.
  https://www.hhs.gov/surgeongeneral/priorities/connection/index.html

## Assets / images (suggested, NOT embedded)

Per the authoring guide, no `assetManifest` is included and no images are embedded. If the
researcher wishes to add openly-licensed imagery in Architect (e.g. an Information stage intro or
EgoForm illustration), the following are suggestions; verify the licence at download time:

- Unsplash (free licence) — search "older adult community", "friends talking", "hands together":
  https://unsplash.com/s/photos/older-adult-community
- Pexels (free licence) — "loneliness", "social connection": https://www.pexels.com/search/social%20connection/
- Wikimedia Commons (check per-file CC licence): https://commons.wikimedia.org/wiki/Category:Loneliness

No Mapbox or GeoJSON assets are needed for this template.

## Implementation notes

- Validated with `node packages/protocol-validation/scripts/cli.js
templates/social-connection-isolation/protocol.json` → `EXIT=0`.
- `categorical` variables (`living_situation`, `relationship`, `contact_mode`) use
  `CheckboxGroup`/`ToggleButtonGroup` components (the schema reserves `RadioGroup`/`LikertScale`
  for `ordinal`). `contact_mode` is the only intentionally multi-select categorical.
- `closeness` is the OrdinalBin variable; `knows` is the alter–alter edge created by the
  OneToManyDyadCensus (one focal alter shown against all others, multi-select).
