// The decision guide: the judgment calls an experienced Network Canvas
// designer makes, mapped onto the StudyDesign schema (../design/schema.ts).
// It is the long, byte-stable tail of the cached step-2 system prompt
// (./design.ts), so nothing may be interpolated into it. Bump the version in
// the header line whenever the text changes: the header makes a cache or
// behaviour change traceable to a guide revision.
//
// Every field name, kind and enum value below must exist in the schema, and
// the guide must never suggest something the schema cannot express
// (asserted in part by __tests__/decision-guide.test.ts).

export const DECISION_GUIDE = `# Sketch decision guide v1

This guide is how an experienced Network Canvas designer turns a study description into a StudyDesign. Follow it unless the description clearly asks for something else that the schema can express.

## 1. The interview arc

Order stages like this, leaving out what the study does not need:

1. **information** (role welcome): who is running the study, what the interview involves, roughly how long it takes.
2. **Consent**: set includeConsent true (with a one-paragraph consentText) for any study with human participants, which is nearly all of them. Sketch adds the consent question after the welcome screen and ends the interview if the participant declines. Never declare a consent attribute and never put consent in an egoForm or in skipLogic.
3. **egoForm**: brief questions about the participant (demographics, context). Long outcome scales can come here or near the end.
4. **nameGenerator** stages: name everyone first, one theme per stage.
5. **Name interpreters**: alterForm, bins, sociogram highlights, geospatial: what each named person is like.
6. **Relationship capture**: sociogram connect prompts or a relationshipCensus, then an optional relationshipForm about the ties just created.
7. **egoForm** stages for outcome measures and instruments that should not prime the network questions.
8. **narrative** (optional): a closing view of the map for discussion.
9. **information** (role closing): thanks, what happens next, and support resources (helplines, services) whenever the topic is sensitive (health, substance use, violence, loss, sexuality, mental health).

Name everyone before interpreting them: do not zigzag between generators and interpreters. Use role instructions or transition screens sparingly, before an unfamiliar task (the first map, a census), not between every stage.

## 2. Node types and relationships

- Use ONE node type (represents people, singular "Person", plural "People") in almost every study. Distinguish family, friends, colleagues or professionals with attributes (a single_choice "relationship" attribute, or yes_no tags) so that everyone appears together on one map and can be compared.
- Split into a second node type only for genuinely different entities: places, organisations, events. They cannot share a map or ties with people.
- nameQuestion: ask for a first name, nickname or initials the participant will recognise. Names must be unique within the interview, so suggest a nickname to tell two people with the same name apart. For sensitive studies ask for initials or a nickname only.
- Never declare a name or position attribute. Sketch adds both.
- relationships are ties BETWEEN two named nodes. The ties between the participant and each person are recorded as node attributes, not relationships. The canonical alter-alter tie is "Know each other" (id knows). Add another relationship only when the research question needs it (conflict, spend time together without you, drink together). Ties have no direction: to record who helps whom relative to the participant, use node attributes (gives_support, receives_support).
- relationships is [] when the study does not measure who knows whom; that is a valid design.

## 3. Name generators

### Method

- **quick_add** (default): the participant types a name and moves on. Fastest, and people name more alters when naming is cheap.
- **form**: name plus 1-3 attributes asked as each person is added. Use it only when an attribute is essential at nomination time and is better asked immediately (relationship type when later stages filter on it, an age band). Never more than 3.
- **roster**: pick from a list of a known population (a class, a ward, a team, an organisation). Use it only when the description says such a list exists. Sketch generates a placeholder list for the researcher to replace; attributeIds are columns the list holds for each person (text, long_text, number or yes_no only), shown on the cards.

### Prompts

- 1-4 prompts per stage, all on ONE theme. Another theme (difficult people versus supportive people, people here versus people abroad) is another nameGenerator stage on the same node type; Sketch shows the people already named so they can be reused.
- Give each prompt that matters for analysis a tagAttributeId: a yes_no attribute of the node type (question "") set to yes for everyone named at that prompt. Without tags Sketch cannot tell which prompt produced whom, and tags are what later filters and skip logic test.
- minNodes: 0 when naming nobody is a legitimate answer (sensitive domains, behaviour-specific generators); 1 when the stage is the core network and the population surely has ties.
- maxNodes: cap at 10-20 when relationship stages follow (ties grow with the square of the network size); 20-30 when only interpreters follow; 0 (no limit) only for a list with no follow-up stages.

### A second, filtered generator

Use a second generator when the study needs a specific subset of alters that a general prompt would miss: drinking or drug-use companions, sex partners, people who cause stress, people abroad. Gate it with skipLogic on an earlier participant answer, so it only shows when it can apply: e.g. mode show_only_if, about participant, attributeId audit_frequency, operator is_not, value "Never". Set minNodes 0 and tag its prompts. If the subset is simply "some of the people already named", do not generate again: use a sociogram highlight or a yes_no field instead.

## 4. Name interpreters: which stage records an attribute

Pick the stage by the attribute's kind:

- **ordered** (closeness, contact frequency, trust, how long known): **bins**, one prompt per attribute, at most 6 options. Bins are faster and more engaging than a form question repeated for every person.
- **single_choice** or **multi_choice** (relationship type, how you met, context, support types): **bins**, at most 8 options; set allowOther true when the list may not be exhaustive.
- **yes_no** about some of the people (who gives advice, who drinks heavily, who knows your diagnosis): a sociogram **highlight** prompt (tap the ones that apply), or a field in an alterForm when the answer is needed for everyone. Never bins.
- **text**, **long_text**, **number**, **date**, **month_year**, **year**, **slider**: an **alterForm** field. Keep alterForm to 1-6 attributes, and move single ordered or categorical items to bins.
- Location by country: a **geospatial** stage (see §6).

A bins stage takes 1-3 prompts, each on its own attribute. Ask about each attribute once, with one stage, and reuse it everywhere (filters, narrative groups).

Every interpreter after a generator applies to all nodes of the type unless you set a filter. Use a filter to ask only about the people it applies to, e.g. a bins stage on drink_together_freq with filter conditions [drinks_with is "yes"].

## 5. Relationship capture by expected network size

- **sociogram** with a connect prompt: the default, and the only practical choice above ~20 nodes. The participant draws a line between any two people who are tied.
- **relationshipCensus** method **every_pair**: a yes/no question for every pair: n(n-1)/2 screens per prompt (45 for 10 people). Exhaustive and good for surfacing forgotten ties, but only for under ~10 nodes (cap maxNodes or use a filter).
- **relationshipCensus** method **one_at_a_time**: one person shown at a time, the participant taps everyone tied to them. Linear in size; use it for 10-20 nodes, or when some alters are very central.
- **relationshipCensus** method **with_strength**: every pair answered on an ordered strength scale. Needs an ordered attribute (2-5 options) on that relationship as strengthAttributeId and a noTieLabel ("They don't know each other"). Small networks only (under ~10). Never also create the same relationship with a sociogram connect prompt.
- **relationshipForm**: questions about each tie that already exists (how long they have known each other). Only after a stage that creates those ties; keep it to 1-4 attributes and use it rarely, since a dense network makes it long. It never replaces a census.

### The sociogram

One shared map, 1-4 prompts, each with one task:
- **position**: drag people onto concentric circles, closer to the centre = closer to the participant. Gives a meaningful layout for later prompts and the narrative. Position is not a measure: if closeness will be analysed, also record it with an ordered attribute in bins. Without a position prompt the layout is automatic.
- **connect**: create ties of relationshipId. One relationship per prompt; wording about the tie ("Draw a line between any two people who **know each other**").
- **highlight**: tap people to set a yes_no attributeId to yes; wording about a characteristic ("Tap everyone who **gives you advice**").

## 6. Geospatial, narrative and other stages

- **geospatial**: the participant taps the COUNTRY where each person is, on a world map opening at mapRegion (world, europe, africa, asia, middle_east, north_america, south_america, oceania). Use it for migration, transnational and diaspora studies. Each prompt's locationAttributeId is a NEW id that Sketch creates; do not declare it in attributes. It works at country level only and needs internet during the interview. For cities, neighbourhoods or venues use a text or single_choice attribute instead. Filter to the people it applies to (e.g. a yes_no lives_abroad).
- **narrative**: a closing visualisation for discussion that collects no data. Only after a sociogram of the same node type. 1-4 views, each answering one question, with a 1-4 word label: groupByAttributeId (a single_choice or multi_choice attribute), relationshipIds (ties created earlier) and highlightAttributeIds (yes_no attributes). Include it for qualitative or mixed-methods interviews, or when the participant reflecting on their network is part of the study.
- **egoForm**: 1-8 attributeIds from egoAttributes. Split long sets across consecutive egoForm stages by topic. Never a consent form.
- **information**: text only (Markdown). role is welcome, instructions, transition or closing.
- interviewerNote: use it when the description mentions interviewers or a clinic setting: what to say, how to help. Otherwise "".

## 7. Participant attributes and validated instruments

- Ask only what the research question needs: age (number, numberRange [16, 99] or the population's range), gender (single_choice with an inclusive option set and "Prefer not to say"), and the context variables the description names.
- Attribute kinds: text, long_text, number (whole numbers), yes_no, single_choice (2-8 options), multi_choice (2-8 options), ordered (2-7 options, lowest first), slider (exactly two end labels, for continuous judgements), date, month_year, year.
- required: true only for answers the analysis cannot do without. Keep sensitive questions optional.
- **Validated instruments** (AUDIT-C, WHO-5, PHQ-9, GAD-7, K6, UCLA-3, LSNS-6 and similar): use one only when the description names it or plainly needs that construct, and only a published instrument you know exactly. Reproduce the items, options and their order exactly; each item is an ordered attribute with optionScores set to the published scores (e.g. [0, 1, 2, 3, 4]). Never invent, shorten or reword an instrument, and never use optionScores for anything else. If you are not certain of the exact wording, use plain ordered items without optionScores and say so in the rationale. Put each instrument in its own egoForm (split if over 8 items) and keep published skip patterns (AUDIT-C items 2-3 are skipped when the participant never drinks).

## 8. Skip logic and filters

- **filter** = which nodes a stage shows. **skipLogic** = whether the stage shows at all. Every stage has skipLogic; the usual value is mode always_show, whenSkipped next_stage, match all, conditions []. The usual filter is match all, conditions [].
- A filter tests attributes of the stage's own node type only, never participant attributes. A participant condition belongs in skipLogic (about participant).
- Conditions may only test something collected in an EARLIER stage. about nodes or relationships means "at least one matches": counts ("fewer than 3 friends") cannot be expressed.
- Operators by kind: yes_no is / is_not with "yes" or "no"; single_choice and multi_choice includes / excludes an option label; ordered is / is_not / at_least / at_most / greater_than / less_than an option label; number is / is_not / greater_than / less_than / at_least / at_most a number; text and long_text contains / does_not_contain; any kind answered / not_answered (value ""); any_exist / none_exist for whether any node or tie of typeId exists (skip logic only). Values are option LABELS exactly as declared.
- Sketch already skips node stages when nobody was named and tie stages when no ties exist: do not write skip logic for that.
- Use whenSkipped end_interview only when nothing after the stage can apply (a screening question that makes the participant ineligible).
- Prefer match all with one condition; several conditions joined with all quickly become too specific.

## 9. Writing prompts and questions

- Second person, plain words for the population, one sentence, one concept per prompt. Never two questions in one ("who do you talk to and trust").
- Name generator prompts carry a **reference period** and a **bolded domain**: "Within the **past 6 months**, who have you **discussed important matters** with?", "Since **starting university**, who have you **become friends with**?" Use the same reference period across a theme. Default to the past 6 months when the description gives none.
- Bold (with **double asterisks**) the key phrase of every prompt, the thing that distinguishes it from the others.
- Interpreter prompts refer to "each person"; node attribute questions in forms refer to "this person".
- Write option labels as the participant would say them, short and mutually exclusive.

## 10. Size and burden limits

- Aim for an interview of 15-30 minutes: typically 8-14 stages, rarely more than 18.
- At most ~3 nameGenerator stages; 1-4 prompts each.
- At most ~4 interpreter stages per node type beyond the map; ordered bins at most 6 options, category bins at most 8.
- Every stage, prompt and attribute must earn its place against the research question. When in doubt, leave it out.

## 11. Vague or unusual descriptions

- Never refuse a real study, however brief. Make the conventional choice for that kind of study and say so in the rationale. The default personal network design is: welcome; consent; egoForm with age and gender; one quick_add generator with a past-6-months prompt about the study's domain (maxNodes 15); bins for closeness and relationship type; a sociogram with a position prompt and a connect prompt for knows; closing.
- If the description mentions an outcome (wellbeing, drinking, loneliness), measure it on the participant and, where it matters for the hypothesis, on the alters as perceived by the participant.
- Not offered, with the nearest alternative to design instead (say so in the rationale):
  - anonymising or encrypting names: ask for initials or a nickname in nameQuestion;
  - interviewer-led free-form network drawing: a sociogram with an interviewerNote;
  - family pedigree / family tree: a nameGenerator with a single_choice family relationship attribute, plus a sociogram connect prompt;
  - pedigree visualisation: a narrative view grouped by that attribute;
  - images, video or audio on screens, and image map backgrounds: text in information stages and concentric circles;
  - maps below country level: text or single_choice location attributes;
  - directed ties or tie counts in skip logic: node attributes (yes_no tags or highlights) relative to the participant.

## 12. Worked example (key decisions only)

Description: "I study how first-year university students form friendships during their first semester, and whether having friends who drink heavily is linked to their own drinking and wellbeing."

- includeConsent true. egoAttributes: age (number [16, 99], required), gender (single_choice), lives_in_halls (yes_no); AUDIT-C (3 ordered items, optionScores [0, 1, 2, 3, 4]); WHO-5 (5 ordered items, 6 options "At no time" to "All of the time", optionScores [0, 1, 2, 3, 4, 5]).
- One node type person. Tags new_friend and support (yes_no, question ""); is_first_year (yes_no with labels "Yes" / "No, or I'm not sure") and first_met (month_year) in an alterForm, because neither is a bin kind; closeness (ordered, 4 options), how_met (single_choice, allowOther) and drinks_heavily (single_choice: Yes / No / I don't know, since "don't know" matters) in one bins stage; drinks_with as a sociogram highlight; drink_together_freq (ordered).
- One relationship knows. Up to 20 friends, so a sociogram connect prompt rather than a census.
- Stages: welcome; egoForm about_you; nameGenerator quick_add with 3 prompts on one theme ("Since **starting university this semester**, who have you **become friends with**?" tagged new_friend; free time; "Who would you **turn to for support**…" tagged support), minNodes 0, maxNodes 20; alterForm; bins (closeness, how_met, drinks_heavily); sociogram (position, connect knows, highlight drinks_with); bins drinking_together with filter drinks_with is "yes" and skipLogic show_only_if about nodes, drinks_with is "yes"; egoForm AUDIT-C item 1; egoForm items 2-3 with skip_if participant audit_frequency is "Never"; egoForm WHO-5 after the network, so it does not prime it; narrative with views "Who drinks heavily" (group drinks_heavily, show knows), "Who you drink with" (highlight drinks_with) and "How you met" (group how_met); closing screen with student support and alcohol helpline resources.
`;
