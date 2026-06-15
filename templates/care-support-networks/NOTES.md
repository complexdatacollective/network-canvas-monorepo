# Care & Support Networks — Template Notes

**Template #5 of the proposed Architect gallery slate.** Validates with
`node packages/protocol-validation/scripts/cli.js templates/care-support-networks/protocol.json` → `EXIT=0` (schema v8).

## 1. Rationale & design

**General case.** _Who_ provides _which functions_ of support, across _formal_ and _informal_
sources, during a care episode. The lead exemplar is **perinatal / maternal health**
(pregnancy and the postpartum period), but the scaffold is deliberately reusable for
caregiving, chronic-disease self-management, and recovery (see §5).

**Why it matters.** Maternal/perinatal health is an NIH equity priority. Stronger perinatal
social support predicts lower postpartum depression and better infant social-emotional
outcomes, and that support spans informal sources (partner, family, peer parents) and formal
ones (OB/midwife, doula, community health worker, home-visiting nurse) across distinct
_functions_ (emotional, informational, practical/instrumental, financial).

**Signature technique.** _Function-typed_ support name generators. Stage 2 asks four separate
"who…" prompts — one per support function — against a single `supporter` node type. Because the
**same person can be named under more than one prompt**, the network captures _multiplex_
support, and any function for which **no one is named surfaces as a support gap**. Stage 3 then
splits every supporter into **formal vs informal** with a `CategoricalBin`, and the closing
`Narrative` groups the map by that same `formal_informal` variable so gaps and source-mix are
visible to the participant and interviewer together.

## 2. Stage sequence

| #   | id                      | type           | purpose                                                                                                                                                                |
| --- | ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ego-care-context`      | EgoForm        | Care-episode context (stage, weeks since birth, living situation) + the full EPDS-10 mood screen.                                                                      |
| 2   | `ng-support-functions`  | NameGenerator  | Function-typed elicitation: four prompts (emotional / information & advice / practical & childcare / financial). The form collects `supporter_name` only.              |
| 3   | `bin-formal-informal`   | CategoricalBin | Sort each supporter into **informal** vs **formal/professional**.                                                                                                      |
| 4   | `alter-support-detail`  | AlterForm      | Per supporter: `relationship`, `proximity`, `contact_frequency`, and `support_functions` (multi-select — the explicit per-person record of which functions they fill). |
| 5   | `bin-reliance`          | OrdinalBin     | Band each supporter by overall `reliance` (5-point LikertScale).                                                                                                       |
| 6   | `narrative-support-map` | Narrative      | Review the support map; `layoutVariable=layout`, `groupVariable=formal_informal`, highlight by `support_functions`. Free-draw + repositioning on a 3-ring background.  |

### Note on `support_functions` capture

`additionalAttributes` on NameGenerator prompts can only set **boolean** values
(`packages/protocol-validation/src/schemas/8/common/prompts.ts`: `value: z.boolean()`), so a
multi-select categorical cannot be pre-stamped from a prompt. The function each prompt
represents is therefore carried by the **prompt wording + recurrence**, and `support_functions`
is recorded **explicitly per supporter in the AlterForm** (stage 4). This keeps the codebook to
the single categorical the spec requires and preserves the gap/multiplex analysis. An alternative
implementation could add four boolean "needed-here" tag variables and stamp them via
`additionalAttributes`, at the cost of redundancy with `support_functions`.

## 3. Instruments & sources

### Edinburgh Postnatal Depression Scale (EPDS-10)

- **Citation:** Cox JL, Holden JM, Sagovsky R (1987). _Detection of postnatal depression:
  development of the 10-item Edinburgh Postnatal Depression Scale._ British Journal of
  Psychiatry, 150, 782–786. The scale is published in the BJPsych and may be reproduced (the
  COPE copy carries "Reproduced with permission"); it is widely treated as freely usable for
  clinical/research purposes with attribution.
- **Item wording & response options reproduced verbatim from** the COPE (Centre of Perinatal
  Excellence) official questionnaire:
  https://www.cope.org.au/uploads/images/Health-professionals/Screening-and-assessment-tools/EPDS-Questionnaire.pdf
- **Cross-checked against** the developing paper record:
  https://pubmed.ncbi.nlm.nih.gov/3651732/
- **Encoding in this protocol.** Each item is an `ordinal` `LikertScale` (`epds_1`…`epds_10`)
  with four options. Option `value`s encode the **official EPDS score** for that response, so a
  total is obtained by summing the ten variables:
  - Items **1, 2, 4** score **0→3** top-to-bottom.
  - Items **3, 5, 6, 7, 8, 9, 10** are **reverse-scored, 3→0** top-to-bottom.
  - Total range 0–30. The administering prompts add the standard "In the past 7 days…" framing;
    item text itself is verbatim.
- **Scoring guidance (for the researcher, not enforced by the protocol):** a total ≥ 13
  conventionally indicates probable depressive illness; a recent meta-analysis suggests ≥ 11
  maximises combined sensitivity/specificity. Use locally validated cut-offs.

> **CLINICAL SAFETY — EPDS item 10 (`epds_10`, "The thought of harming myself has occurred to
> me").** Any non-zero response, and an elevated total, **require a clinical safety/escalation
> protocol**. Network Canvas is an interviewer-assisted research instrument, **not** a triage or
> crisis tool, and the validator does **not** act on responses. Before fielding, the study team
> must put in place: (a) interviewer training and a written escalation pathway; (b) immediate
> referral/crisis-line information for the study locale; (c) IRB/ethics-approved procedures for
> responding to self-harm risk in real time. Do not deploy this template without that pathway.

### Functional social-support typology

- The four functions used here (**emotional / informational / practical-instrumental /
  financial**) follow the standard functional typology operationalised by the **MOS Social
  Support Survey (MOS-SSS)**: Sherbourne CD, Stewart AL (1991). _The MOS social support survey._
  Social Science & Medicine, 32(6), 705–714.
  - RAND copy of the survey: https://www.rand.org/pubs/reprints/RP218.html
  - Instrument PDF: https://cadc.ucsf.edu/sites/g/files/tkssra18586/files/Sherbourne%20MOS%20Social%20Support%20Survey%201991.pdf
- The classic four-function model (emotional, instrumental/tangible, informational, appraisal)
  also traces to House JS (1981), _Work Stress and Social Support_. This template collapses
  "appraisal" into emotional/informational and adds an explicit **financial** function, which is
  especially salient in the perinatal context (cost of baby items, lost income, paid help).

### Supporting literature (background, not reproduced)

- Perinatal social support → lower postpartum depression and better infant outcomes
  (maternal-and-child-health literature; NIH IMPROVE initiative on maternal mortality).
- Hogan B, et al. (2021). _Network Canvas: Key decisions in the design of an
  interviewer-assisted network data collection software suite._ Social Networks.

## 4. Schema/authoring notes

- `assetManifest` is **omitted** per the authoring guide (the validator does not cross-check
  asset refs, and a malformed manifest fails validation). No asset items are used.
- All categorical **single-select** variables use `ToggleButtonGroup`; the multi-select
  `support_functions` uses `CheckboxGroup`; ordinals use `LikertScale`/`RadioGroup`
  (`RadioGroup` is valid for ordinal, **not** categorical — categorical must be
  `CheckboxGroup`/`ToggleButtonGroup`).
- All variable keys and `name`s are snake_case with no spaces; references use codebook **keys**.

## 5. Generalising beyond perinatal

The structure is condition-agnostic; to repurpose:

- **EgoForm:** swap the EPDS-10 for a context-appropriate screen (e.g. PHQ-9 / GAD-7 for general
  distress, Zarit Burden Interview for caregivers, a condition-specific self-efficacy or
  symptom-burden scale for chronic-disease self-management). Replace `care_stage` /
  `weeks_since_birth` with the relevant episode markers (e.g. time since diagnosis, treatment
  phase, caregiving duration).
- **NameGenerator prompts:** keep the four function-typed prompts; reword the
  information/practical prompts to the condition ("advice about your diabetes",
  "help with appointments and medications", "help caring for the person you look after").
- **Codebook:** `formal_informal`, `support_functions`, `proximity`, `contact_frequency`,
  `reliance`, and the formal-vs-informal `CategoricalBin` + gap-revealing `Narrative` transfer
  unchanged. Add condition-specific alter attributes as needed (e.g. a `clinical_role`
  categorical for formal supporters).

## 6. Suggested imagery (do NOT embed — list only, per authoring guide)

For a gallery thumbnail or optional Information-screen art, use openly-licensed images and attach
them in Architect rather than embedding URLs in `protocol.json`:

- Unsplash (Unsplash License, free commercial use, no attribution required):
  https://unsplash.com/s/photos/postpartum-support and
  https://unsplash.com/s/photos/new-parent-support
- Pexels (Pexels License, free use): https://www.pexels.com/search/mother%20and%20baby%20support/
- Wikimedia Commons (check the per-file CC licence before use):
  https://commons.wikimedia.org/wiki/Category:Postnatal_care
  Prefer warm, non-clinical, inclusive imagery (varied family structures and skin tones). Confirm
  the licence of any specific file before shipping.
