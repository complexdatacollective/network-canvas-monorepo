# Mental Health Networks — authoring notes

Template #2 from `docs/protocol-template-proposals.md`. A validated schema-v8 Network Canvas
protocol (`protocol.json`, validates with `EXIT=0`).

## What this template is for

It explores how a person's personal network both **supports** and **strains** them while they
manage their mental health. Its signature technique is **dual-tone elicitation**: separate name
generators for _supportive_ ties and for _difficult / draining_ ties, so that the same alter can
appear in both (an **ambivalent tie**). It also captures **disclosure** ("who knows about your
mental health") and splits help-seeking into **informal vs formal/clinical** sources.

This fills a gap in the existing gallery: no current template captures **negative ties**, which
independently harm wellbeing and so must be measured alongside positive support.

## Stage rationale

1. **Information — Welcome and consent.** Three text panels: a plain-language overview that names
   the dual focus up front (support _and_ strain), a sensitivity notice (questions are personal;
   right to skip/pause/stop; confidentiality; alters stored only by a first name/nickname), and a
   consent confirmation that also pre-warns about the closing safety screen. Putting the framing
   first sets expectations and is standard practice for emotionally sensitive interviews.
2. **EgoForm — About you.** Carries the **Kessler K6** distress screen (`k6_1`…`k6_6`,
   30-day reference, 5-point "none of the time … all of the time"), plus `self_rated_mental_health`
   (5-point poor→excellent) and `in_treatment` (boolean). The K6 is short, validated, and
   widely used as a brief distress screen, which keeps respondent burden low before the network task.
3. **NameGenerator — supportive ties.** Three prompts spanning three classic support domains —
   confide/emotional, advice/informational, practical/emergency help — adapted from the UCNets
   supportive name generators and the GSS "discuss important matters" generator. Each prompt uses
   `additionalAttributes` to pre-tag the matching support boolean (`support_emotional`,
   `support_informational`, `support_practical`) so the supportive function is captured at the
   moment of naming. (`additionalAttributes` can only set **boolean** variables — confirmed against
   the schema — which is exactly what these flags are.)
4. **NameGenerator — difficult / draining ties.** Two prompts: "sometimes find demanding or
   difficult / a source of stress or conflict" (adapted verbatim from the UCNets difficult-ties
   generator) and an energy-draining variant. Both pre-tag `is_source_of_stress = true`. The
   interview script explicitly invites re-naming someone already listed as supportive, which is how
   ambivalent ties are produced. `minNodes: 0` on both generators so a participant who has no such
   tie is not forced to invent one.
5. **AlterForm — per-alter attributes.** Relationship, the three support booleans (re-confirmed
   per alter), `knows_about_mh` (disclosure), `is_clinical` (formal/clinical source), and
   `is_source_of_stress`. Disclosure is framed gently ("have you disclosed
   it to them?"), reflecting that disclosure of a concealable mental-health condition is a
   deliberate, selective decision.
6. **OrdinalBin — closeness and contact.** Two sorting passes: drag alters into closeness bands
   (`closeness`), then into contact-frequency bands (`contact_frequency`). `contact_frequency` was
   moved here from the alter form to keep that form shorter and lower-burden — bins are a lighter
   interaction than per-alter form fields.
7. **CategoricalBin — help source type.** Sorts alters into **informal vs formal/clinical**
   (`help_source_type`), surfacing the help-seeking pathway split.
8. **Sociogram — arrange your network.** A deliberately **manual-positioning** stage (automatic
   layout is intentionally _not_ used here). On a concentric-circle background the participant
   arranges the people in a way that is meaningful to them — e.g. supportive people on one side,
   difficult/draining on the other, and those they feel closest to nearer the centre — and draws
   `knows` ties. Because this arrangement is the participant's own reflective map (not incidental
   positioning), the concentric circles function as a genuine framing device. It writes `layout`,
   which the Narrative review screen then lays the network out from.
9. **Narrative — support vs strain.** Two presets on the `layout` variable: one highlighting
   `support_emotional` vs `is_source_of_stress` (the dual-tone payoff — supportive vs difficult
   ties side by side), one highlighting `knows_about_mh` vs `is_clinical` (the disclosure map).
   `freeDraw` + `allowRepositioning` let interviewer and participant talk through the picture.
10. **Information — Thank you and support services.** Closing safety screen: thanks the participant
    and signposts support (talk to the interviewer, usual service/doctor, crisis line). See below.

## Sensitivity / safety framing rationale

Mental-health network interviews ask about distress, stigma, disclosure, and conflictual
relationships, so the template brackets the sensitive content with care:

- **Up-front consent + sensitivity notice** (Stage 1): names the topics, stresses the right to
  skip/pause/stop without reason, and states that alters are stored only by a chosen first
  name/nickname and kept confidential.
- **Permission to skip** is repeated in the EgoForm intro, because the K6 and disclosure items are
  the most personal.
- **Closing safety screen** (Stage 10): a deliberate "cool-down" that signposts help. Because Network
  Canvas protocols are deployed internationally, **specific crisis-line numbers are intentionally
  left as a placeholder for the researcher to localise** (the body text says so explicitly, with
  US 988 and UK Samaritans 116 123 given only as examples). This avoids shipping a number that is
  wrong for a given study site.

No clinical diagnosis is requested; `in_treatment` and the K6 are screening/context items, not a
diagnostic instrument. All distress items are skippable.

## Instruments & sources

- **Kessler K6 psychological distress scale** — 6 items (nervous; hopeless; restless or fidgety;
  so depressed/sad that nothing could cheer you up; everything an effort; worthless), 30-day
  reference period, 5-point response (0 none of the time … 4 all of the time). Item wording and
  response anchors adapted from:
  - Kessler Psychological Distress Scale (K6+), Cognitive Atlas: https://www.cognitiveatlas.org/task/id/tsk_OA90UJX5qwTyc/
  - Kessler RC et al., on K6 item response patterns (PMC6434102): https://pmc.ncbi.nlm.nih.gov/articles/PMC6434102/
  - K6 in two American Indian communities (PMC3150622): https://pmc.ncbi.nlm.nih.gov/articles/PMC3150622/
    (The K6 is freely usable for research; confirm any site-specific licensing/attribution.)
- **Supportive name generators** — emotional/confide, advice, and emergency-help domains adapted
  from the UCNets supportive generators ("confides in about personal matters" / "advice … when she
  has to make important decisions" / "would ask for help if … seriously injured or sick"), and from
  the GSS "discuss important matters" core-network generator:
  - Offer S & Fischer CS, "They Drive Me Crazy: Difficult Social Ties and Subjective Well-Being"
    (UCNets), PMC9242844: https://pmc.ncbi.nlm.nih.gov/articles/PMC9242844/
  - GSS Topical Report TR45, Contributions of the GSS to Egocentric Network Research:
    https://gss.norc.org/content/dam/gss/get-documentation/pdf/reports/topical-reports/TR45%20Egocentric%20Network.pdf
- **Difficult / negative-tie name generator** — wording "sometimes find demanding or difficult / a
  source of stress or conflict" adapted from the UCNets difficult-ties generator (Offer & Fischer,
  PMC9242844, above), the canonical published egocentric negative-tie elicitation.
- **Disclosure of mental illness** — framing of `knows_about_mh` as a selective, deliberate
  disclosure decision informed by:
  - "The Role of Stigma within Social Networks for Individuals with Serious Mental Illnesses":
    https://link.springer.com/article/10.1007/s10488-026-01505-x
  - "To disclose or not to disclose: A systematic review of factors associated with disclosure and
    concealment of mental illnesses" (PubMed 41072326): https://pubmed.ncbi.nlm.nih.gov/41072326/
- **Multidimensional support / negative ties harming wellbeing**, and the design motivation
  generally — `docs/protocol-template-proposals.md` (Template 2) and its references, esp. BMC
  Psychiatry 2020 (_Negotiating support…_) and the multilevel support-network study (PMC9661735).

## Notes for researchers forking this template

- **Localise the crisis-line numbers** in the closing "support services" screen before fielding.
- An alter who is both supportive and difficult should be **re-selected from the "Already
  mentioned" panel** in the second generator rather than re-typed. The panel reuses the **existing
  node** (it does not create a duplicate), so the person stays a single node carrying both prompt
  associations — that is how ambivalent ties are captured. Typing the name fresh in both generators
  would instead create two separate nodes.
- The edge type `knows` is drawn in the **Sociogram** stage (who-knows-whom) and feeds the
  Narrative layout.
