# CEGRM-derived template proposals for Architect

> **Status:** Proposal A **implemented** as the `eco-genetic-relationship-maps` template; B and C
> remain open for discussion. Three candidate Architect templates built on the
> `FamilyPedigree` + `NarrativePedigree` interfaces and loosely based on the **Colored
> Eco-Genetic Relationship Map (CEGRM)** (Kenen & Peters, _J Genet Couns_ 2001).
>
> Follows the format of [`docs/protocol-template-proposals.md`](protocol-template-proposals.md),
> which produced the current seven-template gallery. None of those templates uses a pedigree, so
> whichever of these ships would be the gallery's first genetics-oriented design.
>
> **Audience:** Network Canvas team / protocol design leads.

---

## 1. What the CEGRM actually is

The CEGRM is a **conjointly constructed** visual instrument that overlays a personal social
network onto a genetic pedigree. It blends three older tools — the genetic pedigree, the family
systems genogram, and the ecomap — and is grounded in social exchange and resource theory. It was
developed for genetic counselling research with families carrying late-onset inherited disease
risk, and has been applied in hereditary breast/ovarian cancer (HBOC), familial testicular cancer
(FTC), and Li-Fraumeni syndrome (LFS) cohorts.

Administration is a 20–60 minute semi-structured interview (LFS cohort mean 30–45 min) in which
investigator and participant build the map together. It proceeds in four moments:

1. **Start from the pedigree.** A genetic pedigree is used as the template — in recent work it is
   pre-populated before the session and reviewed with the participant rather than drawn from
   scratch.
2. **Expand to the whole social universe.** The participant adds non-biological family, friends,
   colleagues, and co-members of groups such as religious communities to the pedigree.
3. **Place the coloured symbols.** For each person, the participant applies coloured dots marking
   the resource exchanges they have with them, and coloured stars marking family communication
   roles. In the FTC study 96% of participants placed the stickers themselves.
4. **Read the pattern and tell the stories.** The completed map is the elicitation device. The
   analytic payoff is as much the narrative as the counts — "the social milieu can be appreciated
   at a glance", and participants reported insight from seeing where colours cluster and where
   they are absent.

**The symbol set** (the legend reproduced in the LFS paper's Figure 1):

| Symbol      | Domain                                                            |
| ----------- | ----------------------------------------------------------------- |
| Blue dot    | Information exchange — health and genetic-risk knowledge          |
| Green dot   | Tangible support — meals, transport, help at appointments         |
| Yellow dot  | Emotional support — closeness, confiding, warmth                  |
| Red dot     | Spiritual/religious connection _(added in the 2006 revision)_     |
| Green star  | Gatherer — actively seeks out new health information              |
| Silver star | Disseminator — spreads risk information and encourages discussion |
| Red star    | Blocker — reluctant to learn or transmit health information       |

**The derived measures** (LFS study): _breadth_ of support = the count of friends, confidantes and
social groups; _types_ of support = which of the four domains are present; _depth_ = how many of
the four domains a single relationship covers (0–4), where 3–4 marks a "deeper" tie. Confidantes
are classified as spouse, friend/non-kin, or relative; social groups as religious community,
recreational team/group, social media, or informal. Per-person coding also captures gender,
generation relative to ego, personal condition history, kinship relation, and living/deceased
status.

---

## 2. How CEGRM maps onto Network Canvas

The repository already contains a working proof of this mapping:
[`CEGRM.stories.tsx`](../packages/interview/src/interfaces/NarrativePedigree/CEGRM.stories.tsx),
a Storybook walkthrough that seeds an HBOC family and runs
`Information → FamilyPedigree → NameGeneratorQuickAdd → Sociogram → NarrativePedigree`. All three
proposals below build on that skeleton. Each extends it in a different direction, and each closes
the gap the story leaves open: it captures no spiritual domain, no gatherer role, no social
groups, and — most importantly — **no `Narrative` stage**, which is where the "coloured" part of a
Colored Eco-Genetic Relationship Map actually belongs.

| CEGRM moment                         | Network Canvas interface                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Genetic pedigree                     | `FamilyPedigree` — wizard-built, finalised, then read-only                                       |
| Who is affected / tested / deceased  | `FamilyPedigree.nominationPrompts` — tap people on the finished pedigree, one boolean per prompt |
| Add the non-kin social universe      | `NameGeneratorQuickAdd` (participant-paced) or `NetworkComposer` (interviewer-driven)            |
| Coloured dots — resource exchanges   | `Sociogram` prompts with `highlight.variable`, one boolean per domain                            |
| Coloured stars — communication roles | Further `Sociogram` highlight prompts                                                            |
| Ties among network members           | A `Sociogram` prompt with `edges.create`, or a dyad census                                       |
| **Reading the finished map**         | **`Narrative` with one preset per domain** — the coloured map proper                             |
| The genetic pathway                  | `NarrativePedigree` — inheritance overlay with focal-person tracing and PNG snapshot             |

### Six facts that constrain every design here

These came out of reading the schemas and runtime, and each one changed a design decision below.

1. **One `person` node type carries both kin and non-kin.** `FamilyPedigree` writes its committed
   membership into stage metadata, and `NarrativePedigree` scopes to that list — so friends added
   later never pollute the family tree. This only holds once the pedigree is **finalised**; before
   that, every same-typed node is swept in.
2. **A `Sociogram` prompt cannot both create edges and highlight an attribute.** The schema rejects
   it outright. Ties and each domain therefore need their own prompt.
3. **`automaticLayout: true` is effectively mandatory.** With it, the simulation runs over _all_
   subject-type nodes and persists settled positions
   ([`Sociogram.tsx:84,148`](../packages/interview/src/interfaces/Sociogram/Sociogram.tsx)); without
   it, only nodes the participant drags out of the drawer ever get coordinates. Since `Narrative`
   renders only nodes with a truthy layout value, manual placement of a 25-person CEGRM would mean
   a mostly empty closing stage.
4. **`Narrative` shows one highlight variable at a time.** The legend renders them as a radio
   group. A single view with all four domain colours at once is not achievable — the interviewer
   steps through them. Convex hulls (`groupVariable`) and edges _can_ co-display with one highlight,
   which is what makes "friends-vs-family hulls + emotional support highlighted" the closest
   analogue to a paper CEGRM.
5. **Three categorical option sets are locked** — `biologicalSex`, `relationshipType`, `gameteRole`
   must match `@codaco/shared-consts` exactly, values _and_ labels (including the U+2019 apostrophe
   in "Don't know"). Hand-authored JSON that drifts fails validation.
6. **Variable record keys must be unique across the whole codebook**, not per entity type. A reused
   key silently overwrites the other entity's definition. This is what rules out a clean second
   `group` node type sharing a `name` variable — see Proposal C.

One further trap worth stating because it bit this draft: **`RadioGroup` cannot render a
`categorical` variable.** Categorical takes `CheckboxGroup` or `ToggleButtonGroup`; `RadioGroup`
and `LikertScale` belong to `ordinal`. `NetworkComposer` reports this especially clearly because
its input control is a stage-level rather than codebook-level decision.

### Verification status

All three stage sequences below were written out as complete protocols and checked against the
real toolchain, not just read off the schemas:

| Check                                                                                 | A   | B   | C   |
| ------------------------------------------------------------------------------------- | --- | --- | --- |
| `protocol-validation` CLI (schema + all cross-reference rules)                        | ✅  | ✅  | ✅  |
| `generateNetwork` feasibility (the gate `bundledProtocolFeasibility.test.ts` applies) | ✅  | ✅  | ✅  |

The validator was itself confirmed to be reporting — deliberately binding a text variable to a
`highlight`, pointing `NarrativePedigree.sourceStageId` at a `Sociogram`, and altering one locked
biological-sex label each produced the expected error. That last one is worth knowing about: the
canonical label is `Don’t know` with a U+2019 apostrophe, and an ASCII `'` fails validation.

**Proposal A has since been built** and ships as the `eco-genetic-relationship-maps` template
([`packages/protocols/templates/eco-genetic-relationship-maps/protocol.json`](../packages/protocols/templates/eco-genetic-relationship-maps/protocol.json)).
It gained a consent gate and per-stage interviewer guidance during implementation — see §4.
Proposals B and C remain proposals; their draft protocols were validated but are not checked in,
because an unregistered protocol is covered by no test and would drift from the schema silently.

---

## 3. The three proposals

Each differs in **research purpose** and in which layer of the CEGRM it treats as the object of
measurement, not merely in length.

| #   | Template                                      | The object of measurement                        | Signature technique                                                   | Stages |
| --- | --------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- | ------ |
| A   | **Eco-Genetic Relationship Maps**             | Ego's resource exchanges, laid over the pedigree | Pedigree → colour-map pipeline closing on a per-domain `Narrative`    | 12     |
| B   | **Family Health Communication Networks**      | The communication network _among kin_            | `OneToManyDyadCensus` over the pedigree → at-risk vs. told comparison | 12     |
| C   | **Support Ecologies in Inherited Conditions** | Breadth, types and depth of support              | `NetworkComposer` co-construction with convex-hull social circles     | 10     |

---

### Proposal A — Eco-Genetic Relationship Maps

_General case of: overlaying a personal support network onto a genetic pedigree, for families
living with an inherited condition._

**Why / who.** This is the published instrument, kept faithful. It suits genetic counselling
research, psychosocial oncology, and any hereditary-condition cohort where the research question
is "who does this person actually have around them, and how does that sit against the family's
genetic structure". Feasibility is well established across three cohorts (HBOC n=150, FTC, LFS
n=66) with high participant comprehension and comfort.

**Signature technique.** The full pedigree-to-colour-map pipeline, ending on a `Narrative` stage
whose presets _are_ the coloured overlays. This is the design that most directly exercises the
FamilyPedigree → NarrativePedigree pairing and shows off what the paper instrument cannot do:
switch overlays live, trace an inheritance pathway for one person, and export a snapshot.

**Codebook.** _Node `person`:_ `name` (text), `is_ego` (boolean), `relationship_to_ego` (text,
written automatically at finalize), `biologicalSex` (locked categorical), `layout`, `tie_type`
(categorical: close friend / friend / colleague or classmate / neighbour / faith community /
health professional / other) + `tie_type_other` (text), condition booleans `has_condition`,
`had_testing`, `is_deceased`; four domain booleans `exch_information`, `exch_tangible`,
`exch_emotional`, `exch_spiritual`; three role booleans `role_gatherer`, `role_disseminator`,
`role_blocker`. Node shape: `{ default: 'circle', dynamic: { type: 'discrete', variable:
'biologicalSex', map: [male→square, female→circle, intersex→diamond] } }`.
_Edge `family_relationship`:_ the four locked pedigree variables. _Edge `knows`:_ member-to-member
ties. _Ego:_ age, education, partnered status, personal condition history, testing/mutation status
(mirrors the studies' Individual Information Questionnaire).

**Stage sketch.**

1. `Information` — **template notes (delete before fielding)**: what CEGRM is, the citations, and
   the caveat that colour counts are a discussion aid, not a validated support scale.
2. `Information` — participant welcome and consent framing.
3. `EgoForm` — demographics, condition and testing history.
4. `FamilyPedigree` — build the pedigree, then nominate on it.
5. `Information` — "now the people beyond your family".
6. `NameGeneratorQuickAdd` — four prompts adding non-kin.
7. `CategoricalBin` — sort the people you added into relationship types.
8. `Sociogram` — ties, then the four exchange domains.
9. `Sociogram` — the three communication roles.
10. `Narrative` — **the coloured map**: step through the overlays and talk about them.
11. `NarrativePedigree` — the inheritance pathway.
12. `Information` — closing and debrief.

**Worked configuration for the distinctive stages.**

Stage 4 — the pedigree carries the affection nominations, which are exactly the booleans
`NarrativePedigree` later consumes:

```json
{
  "id": "family-pedigree",
  "type": "FamilyPedigree",
  "label": "Family pedigree",
  "nodeConfig": {
    "type": "person",
    "nodeLabelVariable": "name",
    "egoVariable": "is_ego",
    "relationshipVariable": "relationship_to_ego",
    "biologicalSexVariable": "biologicalSex"
  },
  "edgeConfig": {
    "type": "family_relationship",
    "relationshipTypeVariable": "relationshipType",
    "isActiveVariable": "isActive",
    "isGestationalCarrierVariable": "isGestationalCarrier",
    "gameteRoleVariable": "gameteRole"
  },
  "framing": { "mode": "participantChoice" },
  "boundaries": {
    "requireGrandparents": "recommended",
    "requireChildrenContributors": "off"
  },
  "censusPrompt": "Let's map out your family. Who is in it?",
  "nominationPrompts": [
    { "id": "nom-condition", "text": "Who in your family has had **this condition**?", "variable": "has_condition" },
    { "id": "nom-testing",   "text": "Who has had **genetic testing**?",                "variable": "had_testing" },
    { "id": "nom-deceased",  "text": "Who has **died**?",                               "variable": "is_deceased" }
  ]
}
```

Stage 8 — one Sociogram, ties first, then a prompt per domain. Note `automaticLayout: true`, and
that the tie prompt is separate because edge creation and highlighting cannot share a prompt:

```json
{
  "id": "socio-exchanges",
  "type": "Sociogram",
  "label": "Exchanges of support",
  "subject": { "entity": "node", "type": "person" },
  "background": { "concentricCircles": 0 },
  "behaviours": { "automaticLayout": true, "allowRepositioning": true },
  "prompts": [
    { "id": "p-ties",        "text": "Connect any of these people who **know one another**.",
      "layout": { "layoutVariable": "layout" }, "edges": { "create": "knows", "display": ["knows"] } },
    { "id": "p-information", "text": "Who do you **share health or genetic information** with?",
      "layout": { "layoutVariable": "layout" }, "highlight": { "allowHighlighting": true, "variable": "exch_information" } },
    { "id": "p-tangible",    "text": "Who gives you **practical help** — a lift to an appointment, a meal, minding the children?",
      "layout": { "layoutVariable": "layout" }, "highlight": { "allowHighlighting": true, "variable": "exch_tangible" } },
    { "id": "p-emotional",   "text": "Who do you **share your feelings** with about all this?",
      "layout": { "layoutVariable": "layout" }, "highlight": { "allowHighlighting": true, "variable": "exch_emotional" } },
    { "id": "p-spiritual",   "text": "Who do you share a **spiritual or religious connection** with?",
      "layout": { "layoutVariable": "layout" }, "highlight": { "allowHighlighting": true, "variable": "exch_spiritual" } }
  ]
}
```

Stage 10 — the payoff. One preset per domain, hulls by relationship type so family and friends are
visually separable, plus a "deeper ties" preset showing the `knows` structure:

```json
{
  "id": "narrative-cegrm",
  "type": "Narrative",
  "label": "Your map",
  "interviewScript": "Operate this stage yourself and use it to prompt narration. Step through the overlays and ask what the participant notices — where the colours cluster, and where they are absent. Absence is as informative as presence. This stage saves nothing, so capture the conversation using your approved study procedure.",
  "subject": { "entity": "node", "type": "person" },
  "background": { "concentricCircles": 3, "skewedTowardCenter": true },
  "behaviours": { "automaticLayout": false, "allowRepositioning": true, "freeDraw": true },
  "presets": [
    { "id": "preset-everyone",    "label": "Everyone in your map",   "layoutVariable": "layout", "groupVariable": "tie_type", "edges": { "display": ["knows"] } },
    { "id": "preset-information", "label": "Information",            "layoutVariable": "layout", "groupVariable": "tie_type", "highlight": ["exch_information"] },
    { "id": "preset-tangible",    "label": "Practical help",         "layoutVariable": "layout", "groupVariable": "tie_type", "highlight": ["exch_tangible"] },
    { "id": "preset-emotional",   "label": "Feelings",               "layoutVariable": "layout", "groupVariable": "tie_type", "highlight": ["exch_emotional"] },
    { "id": "preset-spiritual",   "label": "Spiritual connection",   "layoutVariable": "layout", "groupVariable": "tie_type", "highlight": ["exch_spiritual"] },
    { "id": "preset-roles",       "label": "Talking about risk",     "layoutVariable": "layout", "highlight": ["role_gatherer", "role_disseminator", "role_blocker"] }
  ]
}
```

Stage 11:

```json
{
  "id": "narrative-pedigree",
  "type": "NarrativePedigree",
  "label": "How the condition runs in your family",
  "sourceStageId": "family-pedigree",
  "showAtRiskStatuses": true,
  "diseases": [
    { "id": "condition", "label": "This condition", "color": "#e53e3e",
      "variable": "has_condition", "inheritancePattern": "autosomalDominant" }
  ]
}
```

---

### Proposal B — Family Health Communication Networks

_General case of: how genetic risk information moves through a kindred — who tells whom, who is
still uninformed, and who obstructs._

**Why / who.** The gatherer/disseminator/blocker typology came out of the CEGRM programme and has
its own literature on family risk communication and cascade screening. The clinical problem is
concrete: relatives who are at risk but have never been told cannot present for testing. Users:
cascade-screening and family-communication researchers, public-health genomics, and intervention
studies that target family communicators.

**Signature technique.** A `OneToManyDyadCensus` run **over the finished pedigree**. The
participant works through one family member at a time and marks everyone _that person_ has talked
to about the family's health risk, producing a directed communication network among kin. The paper
CEGRM cannot do this — stickers only ever record ego's own exchanges. The analytic payoff is the
comparison the closing stages make possible: `NarrativePedigree` shows who is at risk,
`Narrative` shows who has been told, and the gap between them is the intervention target.

**Codebook.** As Proposal A, minus the four exchange-domain booleans, plus: `knows_about_risk`
(boolean, nominated on the pedigree), `told_by_ego` (boolean), `generation` (categorical: older /
same / younger — matching the coding scheme used in the published studies), `proximity`
(categorical: same household / nearby / same country / abroad), `contact_frequency` (ordinal).
_Edge `told`:_ directed communication tie, with `told_when` (ordinal: before testing / around
testing / since / never discussed). _Ego:_ diagnosis and testing history, who first told them,
how they found out.

**Stage sketch.**

1. `Information` — template notes, including the caveat that this is ego's _perception_ of others'
   conversations, not observed communication.
2. `Information` — welcome and consent.
3. `EgoForm` — testing and diagnosis history; how the participant first learned of the family risk.
4. `FamilyPedigree` — pedigree, with `nominationPrompts` for **affected**, **tested**, and — the
   distinctive one — **"who in your family knows about the risk?"** (`knows_about_risk`).
5. `Information` — "now the people beyond your family who are in the loop".
6. `NameGeneratorQuickAdd` — non-kin who are in the loop: partners, close friends, clinicians.
7. `AlterForm` — per person: generation, proximity, contact frequency.
8. `OneToManyDyadCensus` — the communication census (below).
9. `Sociogram` — the three role nominations as highlight prompts.
10. `Narrative` — presets: who knows, who told whom, the three roles.
11. `NarrativePedigree` — at-risk overlay, read against stage 10.
12. `Information` — debrief.

**Worked configuration for stage 8.** `behaviours.removeAfterConsideration` is a required key on
this interface; leaving it `true` drops each focal person from the target list once considered,
which halves the work on a large pedigree:

```json
{
  "id": "census-communication",
  "type": "OneToManyDyadCensus",
  "label": "Who has talked to whom",
  "subject": { "entity": "node", "type": "person" },
  "behaviours": { "removeAfterConsideration": true },
  "filter": {
    "rules": [
      { "id": "11111111-1111-4111-8111-111111111111", "type": "node",
        "options": { "type": "person", "attribute": "is_deceased", "operator": "NOT", "value": true } }
    ]
  },
  "prompts": [
    { "id": "p-told", "text": "Here is one person from your family. As far as you know, tap **everyone this person has talked to** about the family's health risk.",
      "createEdge": "told" }
  ]
}
```

> **Design caveat to resolve before building.** A one-to-many census over a full three-generation
> pedigree can run to 25+ focal people. The filter above is the minimum mitigation — it drops
> people nominated as deceased on the pedigree. A stricter variant would run the census only over
> people flagged `knows_about_risk`. Ship with a filter in place and a researcher note explaining
> how to widen it; `removeAfterConsideration: true` (a required key on this interface) roughly
> halves the remaining work by dropping each focal person from later target lists.

---

### Proposal C — Support Ecologies in Inherited Conditions

_General case of: the breadth, types and depth of support around a person living with an inherited
condition, including collective and institutional sources._

**Why / who.** This follows the "eco" half of the instrument — the ecomap ancestry that the dot
placement tends to overshadow. The LFS study is the exemplar: it measured breadth (counts of
friends, confidantes and groups), types (the four domains), and depth (how many domains a single
tie covers, with 3–4 marking a "deeper" relationship), and found religious community the most
commonly named supportive group. Users: psychosocial researchers in rare disease and hereditary
cancer, chaplaincy and spiritual-care research, patient-organisation evaluation.

**Signature technique.** `NetworkComposer` as the co-construction canvas. This is the interface
closest to the method as published: the interviewer drives, both parties build together, people
are added inline, ties are drawn in several types at once, and lasso-selection groups people into
convex hulls. Those hulls carry the **social circles** the LFS study counted — family, friends,
work or study, faith community, online or peer community, health services — so groups are captured
without needing a second node type. Depth of support then falls out of the four domain booleans.

**Stage sketch.**

1. `Information` — template notes.
2. `Information` — welcome and consent.
3. `FamilyPedigree` — deliberately light: both boundaries `off`, one nomination prompt, so the
   pedigree is a scaffold rather than the focus.
4. `NetworkComposer` — build the eco-layer together (below).
5. `Sociogram` — the four support domains as highlight prompts.
6. `OrdinalBin` — reliance banding, "who would you turn to first".
7. `CategoricalBin` — confidante type: spouse or partner / relative / friend / professional /
   nobody — mirroring the published confidante classification, with `otherVariable` for anything
   unlisted.
8. `Narrative` — presets per domain, hulls by social circle, plus a "deeper ties" preset.
9. `NarrativePedigree` — condition overlay.
10. `Information` — closing reflection.

**Worked configuration for stage 4.** `quickAdd`, `layoutVariable` and `background` are all
required; `convexHullVariable` is what makes the social circles work:

```json
{
  "id": "composer-ecomap",
  "type": "NetworkComposer",
  "label": "The people around you",
  "interviewScript": "You drive this stage. Add people as the participant names them, group them into circles by lassoing, and draw ties as they describe them. Confirm each change reflects what they meant.",
  "subject": { "entity": "node", "type": "person" },
  "quickAdd": "name",
  "layoutVariable": "layout",
  "convexHullVariable": "social_circle",
  "background": { "concentricCircles": 0 },
  "behaviours": { "automaticLayout": true },
  "nodeForm": {
    "fields": [
      { "variable": "tie_type",  "component": "ToggleButtonGroup", "label": "How do you know them?" },
      { "variable": "proximity", "component": "ToggleButtonGroup", "label": "How near are they?" }
    ]
  },
  "edges": [
    { "id": "e-knows", "subject": { "entity": "edge", "type": "knows" } },
    { "id": "e-close", "subject": { "entity": "edge", "type": "close" } }
  ]
}
```

`NetworkComposer` is the one interface where the input **component** is a stage-level decision
rather than a codebook one, so the same variable can render as toggle buttons here and a radio
group elsewhere.

> **Known limitation.** Collective supports — "my congregation", "the LFS Facebook group" — are
> modelled as convex hulls over people, not as entities in their own right. A dedicated `group`
> node type would be more faithful to the ecomap, but `Sociogram`, `Narrative` and
> `NetworkComposer` each take a **single** node subject, so groups would need their own parallel
> stages and could never appear on the same canvas as people. Codebook variable keys are also
> unique across all entity types, so a `group` type could not reuse `name`. The hull approach is
> the right trade for a template; a two-node-type variant is a future enhancement that would want
> interface support first.

---

## 4. Recommendation

**Build Proposal A** — done; it ships as `eco-genetic-relationship-maps`. It is what "a CEGRM
template" means to anyone who knows the literature, its stage sequence is already proven
end-to-end by the existing Storybook walkthrough, and it exercises the FamilyPedigree →
NarrativePedigree pairing that no shipped template currently demonstrates. It is also the only one
of the three that needs no new interface capability and no design compromise.

Three things changed between this sketch and the shipped template, all in response to how
sensitive the subject matter is:

- **A consent gate was added**, following the pattern Mental Health Networks and Transnational
  Networks use: an `EgoForm` carrying a required `participant_consent` boolean, with the next
  stage skipping to finish when it is declined. The gate is registered in
  `bundled-validation.test.ts` so it cannot be removed silently.
- **Per-stage `interviewScript` guidance was written** for the pedigree, the two Sociograms, the
  Narrative and the NarrativePedigree. The instrument is interviewer-led, and the closing Narrative
  in particular is useless without guidance on how to run it.
- **The researcher-notes screen carries pre-fielding instructions**, because two things genuinely
  must be changed before use: the literal string "this condition" throughout the prompts, and the
  `inheritancePattern`, which defaults to `autosomalDominant` and is wrong for most conditions.

**Proposal B is the strongest second**, and is the more novel research instrument — it produces a
directed kin communication network that the paper method structurally cannot capture. Its open
question is census length, which is a protocol-design decision rather than a software one.

**Proposal C is the most interesting and the least ready.** The `NetworkComposer` co-construction
canvas is genuinely closer to how the CEGRM is administered than a participant-paced sociogram is,
but the group-as-hull compromise is a real loss of fidelity against the ecomap tradition. Worth
revisiting if multi-node-type canvases are ever on the roadmap.

A pragmatic route is A first, then lift stage 7 of B (the communication census) into A as an
optional stage behind a researcher note, giving one template that covers both readings.

## 5. Build notes

Templates are hand-written `protocol.json` under `packages/protocols/templates/<id>/`, registered
in `packages/protocols/manifest.json` with `"kind": "template"` and `"architectTemplate": true`,
plus a mandatory `assets/.gitkeep`. See
[`packages/protocols/AUTHORING_GUIDE.md`](../packages/protocols/AUTHORING_GUIDE.md). The practical
authoring loop is to add a minimal valid protocol, run
`pnpm --filter @codaco/architect dev:protocols`, edit in Architect's real editor, and use **Save to
source** — noting that Architect mints uuid keys for variables created that way, against the
templates' snake_case slug convention.

Gates a new template must pass: the protocol-validation CLI; `bundled-validation.test.ts` and
`manifest.test.ts` in `apps/architect/src/templates/__tests__/`;
`bundledProtocolFeasibility.test.ts` in `packages/interview` (which asserts `generateNetwork` does
not throw and that manifest ids exactly match the `templates/` directory listing); plus
`typecheck`, `lint` and `knip`.

## 6. References

- Kenen R, Peters J. _The Colored, Eco-Genetic Relationship Map (CEGRM): a conceptual approach and
  tool for genetic counseling research._ J Genet Couns. 2001;10(4):289–309.
- Peters JA, Kenen R, Giusti R, Loud J, Weissman N, Greene MH. _Exploratory study of the
  feasibility and utility of the colored eco-genetic relationship map (CEGRM) in women at high
  genetic risk of developing breast cancer._ Am J Med Genet A. 2004;130A(3):258–64.
- Peters JA, Kenen R, Hoskins LM, et al. _Evolution of the colored eco-genetic relationship map
  (CEGRM) for assessing social functioning in women in hereditary breast-ovarian (HBOC) families._
  J Genet Couns. 2006;15(6):477–89. — adds the spiritual/religious domain.
- Koehly LM, Peters JA, Kuhn N, et al. _Characteristics of health information gatherers,
  disseminators, and blockers within families at risk of hereditary cancer._ Am J Public Health.
  2009;99(12):2203–9.
- Peters JA, Kenen R, Bremer R, Givens S, Savage SA, Mai PL. _Easing the burden: describing the
  role of social, emotional and spiritual support in research families with Li-Fraumeni syndrome._
  J Genet Couns. 2016;25(3):529–42. — breadth/types/depth framework.
- Mays D, Peters JA, Kenen R, et al. _Close ties: an exploratory Colored Eco-Genetic Relationship
  Map (CEGRM) study of social connections of men in Familial Testicular Cancer (FTC) families._
  Hered Cancer Clin Pract. 2012;10:2.
- Rew L, Kenen R, Peters J. _Using the Colored Eco-Genetic Relationship Map with children._ 2009. —
  adaptation for ages 7–10.
- Bennett RL, et al. _Standardized human pedigree nomenclature: update and assessment._ J Genet
  Couns. 2022. — the notation `NarrativePedigree` implements.
