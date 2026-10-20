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

export const DECISION_GUIDE = `# Sketch decision guide v6

This guide is how an experienced Network Canvas designer turns a researcher's research questions, research population and study synopsis into a StudyDesign. Its method choices are defaults with their trade-offs, not rules: weigh them against this study, and against the design as a whole. The goal is the interview that answers the research questions with the least burden on the participant (§10). Rules marked "never" or "only" are hard constraints of the software or of valid measurement; everything else is judgement.

## 0. How the interview is run

- **administration**: face_to_face when the description says interviewers, researchers or clinicians sit with the participant (interviews, clinic or field visits); self_administered otherwise (online surveys, kiosks, participants on their own device). When it is unclear, choose self_administered and say so in the rationale.
- **qualitative**: true only when the research design has a qualitative or narrative element, such as an interview in which the participant talks through their network and that talk is analysed. A purely quantitative network survey is false, even when face_to_face.
- **narrative** and **networkComposer** stages need both: administration face_to_face AND qualitative true. Never use either in a self-administered study, or in one with no qualitative or narrative element.

## 1. The interview arc

Order stages like this, leaving out what the study does not need:

1. **information** (role welcome): who is running the study, what the interview involves, roughly how long it takes.
2. **Consent**: set includeConsent true (with a one-paragraph consentText) for any study with human participants, which is nearly all of them. Sketch adds the consent question after the welcome screen and ends the interview if the participant declines. Never declare a consent attribute and never put consent in an egoForm or in skipLogic.
3. **egoForm**: brief questions about the participant (demographics, context). Long outcome scales can come here or near the end.
4. **nameGenerator** stages: name everyone first, one theme per stage.
5. **Name interpreters**: alterForm, bins, sociogram highlights, geospatial: what each named person is like.
6. **Relationship capture**: sociogram connect prompts or a relationshipCensus, then an optional relationshipForm about the ties just created.
7. **egoForm** stages for outcome measures and instruments that should not prime the network questions.
8. **narrative** (face_to_face qualitative studies only): a closing view of the map for the interviewer and participant to discuss.
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
- **form**: name plus 1-3 attributes asked as each person is added. Use it only when an attribute is essential at nomination time and is better asked immediately (relationship type when later stages filter on it, an age band). Never more than 3. Only on the FIRST generator of a node type: later generators let the participant re-add people from an "Already mentioned" panel, which skips the form.
- **roster**: pick from a list of a known population (a class, a ward, a team, an organisation). Use it only when the study says such a list exists. Sketch generates a placeholder list for the researcher to replace; attributeIds are columns the list holds for each person (text, long_text, number or yes_no only), shown on the cards.

### Prompts

- 1-4 prompts per stage, all on ONE theme. Another theme (difficult people versus supportive people, people here versus people abroad) is another nameGenerator stage on the same node type; Sketch shows the people already named so they can be reused.
- Give each prompt that matters for analysis a tagAttributeId: a yes_no attribute of the node type (question "") set to yes for everyone named at that prompt. Without tags Sketch cannot tell which prompt produced whom, and tags are what later filters and skip logic test.
- minNodes: 0 when naming nobody is a legitimate answer (sensitive domains, behaviour-specific generators); 1 when the stage is the core network and the population surely has ties.
- maxNodes: cap at 10-20 when relationship stages follow (ties grow with the square of the network size); 20-30 when only interpreters follow; 0 (no limit) only for a list with no follow-up stages.

### A second, filtered generator

Use a second generator when the study needs a specific subset of alters that a general prompt would miss: drinking or drug-use companions, sex partners, people who cause stress, people abroad. Gate it with skipLogic on an earlier participant answer, so it only shows when it can apply: e.g. mode show_only_if, about participant, attributeId audit_frequency, operator is_not, value "Never". Set minNodes 0 and tag its prompts. If the subset is simply "some of the people already named", do not generate again: use a sociogram highlight or a yes_no field instead.

## 4. Name interpreters: where each attribute is asked

Every stage costs the participant a transition and an instruction to read, and every question asked about each person is repeated for every person named. Decide where an attribute goes by looking at the whole design, not attribute by attribute:

- **bins** (drag each person into a category): the default for ONE ordered or categorical attribute about everyone, because sorting a whole network at once is faster and more engaging than a question repeated per person, and the participant compares people against each other (useful for closeness or frequency). It costs a stage per 1-3 attributes. Ordered: at most 6 options; categories: at most 8; set allowOther when the list may not be exhaustive.
- **alterForm** (a form repeated for each person): the natural home for text, number and date answers, and for several attributes that belong together. When the design already has an alterForm on these people, an ordered or categorical item can join it instead of adding a bins stage: one more question on a form that is shown anyway often costs less than a new stage. Keep a form to about 6 questions; beyond that, moving categorical items to bins is lighter.
- **form name generator** (1-3 attributes as each person is named): when the answer is needed immediately (a later filter or skip depends on it) or is cheapest to ask while the person is in mind.
- **sociogram highlight** (tap the people that apply): a yes_no about SOME of the people, cheap when the design already has a map, since it adds a prompt rather than a stage. A yes_no needed for everyone, with an explicit "no", belongs in a form instead.
- **prompt tags** on a name generator: record which prompt produced each person at no cost at all; prefer them to asking again.
- **geospatial**: location by country (see §6).

Typical trade-offs: two single categorical items about everyone can share one bins stage (up to 3 prompts) rather than two stages; a lone categorical item in a design that already asks a per-person form usually joins that form; a design with no per-person form and three ordered items is usually lighter as one bins stage with three prompts than as a new form. Never put a yes_no or multi_choice in bins: a person goes in one bin, so several choices belong in an alterForm.

A bins stage takes 1-3 prompts, each on its own attribute. Ask about each attribute once, with one stage, and reuse it everywhere (filters, narrative groups). An attribute recorded by bins, a sociogram highlight, a prompt tag or a census strength never also appears in a form: those stages skip the form's validation, so the two would disagree.

Every interpreter after a generator applies to all nodes of the type unless you set a filter. Use a filter to ask only about the people it applies to, e.g. a bins stage on drink_together_freq with filter conditions [drinks_with is "yes"]. See §10 on deciding who each stage is about.

## 5. Relationship capture: choosing how ties are created

Each method has different strengths. Choose by what the analysis needs from the ties, the expected network size (after maxNodes and any filter), and how the interview is run.

- **sociogram** connect prompt: the participant draws a line between two people on the map. It scales to large networks and shows the structure as it is drawn, so clusters and gaps are visible and easy to talk about. It is not systematic: the participant must spot every tie, and in a dense map some are missed. It needs a screen large enough to drag and tap precisely.
- **relationshipCensus every_pair** (dyad census): one yes/no screen for each pair, n(n-1)/2 screens per prompt (28 for 8 people, 45 for 10). Every pair is explicitly considered and every "no" is a real answer, so it is the most complete and accurate method, and simple enough for any participant on any device. The burden grows with the square of the network size.
- **relationshipCensus one_at_a_time** (one-to-many dyad census): one person is shown at a time with the people not yet considered, and the participant taps everyone tied to them. Each pair is still considered once, but on n-1 screens instead of n(n-1)/2, so it is nearly as systematic as every_pair at a fraction of the burden. Its lists suit small screens and self-administration. An untapped person counts as "no tie", which makes it slightly less deliberate than a yes/no for each pair.
- **relationshipCensus with_strength** (tie strength census): every pair rated on an ordered strength scale. Use it only when the strength of ties BETWEEN alters is a measure in the research questions. It is the most burdensome method. It needs an ordered attribute (2-5 options) on that relationship as strengthAttributeId and a noTieLabel ("They don't know each other").
- **networkComposer**: a free-form canvas (see §6), for face_to_face qualitative studies only.

As a default, weigh them in this order:

1. Strength of alter-alter ties is a measure: with_strength, with maxNodes 10 or a filter to the people who matter.
2. The analysis needs complete tie data (density, brokerage, components, structural holes, whether two supporters know each other): first decide whether it needs them among everyone or only a core (see §10, Filtering). Then, by the people the census shows after any filter: under ~8, every_pair; about 8-25, one_at_a_time.
3. The network can exceed ~25 people, the questions are exploratory or about overall structure, or the map is already used to position people: a sociogram connect prompt.
4. Self-administered on phones or by participants unused to touch screens: prefer a census to drawing whenever the network fits under ~25 people.

Further rules:

- Create each relationship in exactly ONE stage: never census a relationship that a sociogram connect prompt also creates.
- Each extra relationship type is another full pass (another census prompt or connect prompt), so measure more than one alter-alter relationship only when the research questions need it, and at most 2.
- **relationshipForm**: questions about each tie that already exists (how long they have known each other). Only after a stage that creates those ties; keep it to 1-4 attributes and use it rarely, since a dense network makes it long. It never replaces a census.

### The sociogram

One shared map, 1-4 prompts, each with one task:
- **position**: drag people onto concentric circles, closer to the centre = closer to the participant. Gives a meaningful layout for later prompts and the narrative. Position is not a measure: if closeness will be analysed, also record it with an ordered attribute in bins. Without a position prompt the layout is automatic.
- **connect**: create ties of relationshipId. One relationship per prompt; wording about the tie ("Draw a line between any two people who **know each other**"). While drawing, the map shows only the type being drawn: showing several relationship types at once makes the prompt ambiguous, so do not put two connect prompts on one map unless the study needs both types.
- **highlight**: tap people to set a yes_no attributeId to yes; wording about a characteristic ("Tap everyone who **gives you advice**").

## 6. Geospatial, narrative and other stages

- **geospatial**: the participant taps the COUNTRY where each person is, on a world map opening at mapRegion (world, europe, africa, asia, middle_east, north_america, south_america, oceania). Use it for migration, transnational and diaspora studies. Each prompt's locationAttributeId is a NEW id that Sketch creates; do not declare it in attributes. It works at country level only and needs internet during the interview. For cities, neighbourhoods or venues use a text or single_choice attribute instead. Filter to the people it applies to (e.g. a yes_no lives_abroad).
- **narrative**: a closing visualisation that collects no data; the interviewer uses it to talk the participant through their network. Only in face_to_face studies with a qualitative or narrative element, and only after a sociogram or networkComposer of the same node type. 1-4 views, each answering one question, with a 1-4 word label: groupByAttributeId (a single_choice or multi_choice attribute), relationshipIds (ties created earlier) and highlightAttributeIds (yes_no attributes).
- **networkComposer**: a free-form canvas on which the participant adds people, places them, draws ties and puts people into groups, while talking it through with the interviewer. Only in face_to_face studies with a qualitative or narrative element. It creates its own nodes, so it can replace a nameGenerator plus sociogram when building the network IS the conversation (life-history, narrative or ethnographic network interviews). It has no prompts: give it an interviewerNote with what to ask and how to guide the participant. attributeIds (0-4) are filled in for each person on the canvas; groupAttributeId is a multi_choice attribute whose options are the groups; relationships (0-2) are the tie types the participant can draw, each with optional attributeIds. It is not systematic, so use a census or a structured generator instead when the analysis needs complete, comparable data.
- **egoForm**: 1-8 attributeIds from egoAttributes. Split long sets across consecutive egoForm stages by topic. Never a consent form.
- **information**: text only (Markdown). role is welcome, instructions, transition or closing.
- interviewerNote: use it in face_to_face studies: what to say, how to help. Required on a networkComposer. Otherwise "".

## 7. Participant attributes and validated instruments

- Ask only what the research question needs: age (number, numberRange [16, 99] or the population's range), gender (single_choice with an inclusive option set and "Prefer not to say"), and the context variables the research questions or synopsis name.
- Attribute kinds: text, long_text, number (whole numbers), yes_no, single_choice (2-8 options), multi_choice (2-8 options), ordered (2-7 options, lowest first), slider (exactly two end labels, for continuous judgements), date, month_year, year.
- required: true only for answers the analysis cannot do without. Keep sensitive questions optional.
- **Validated instruments** (AUDIT-C, WHO-5, PHQ-9, GAD-7, K6, UCLA-3, LSNS-6 and similar): use one only when the synopsis names it or a research question plainly needs that construct, and only a published instrument you know exactly. Reproduce the items, options and their order exactly; each item is an ordered attribute with optionScores set to the published scores (e.g. [0, 1, 2, 3, 4]). Never invent, shorten or reword an instrument, and never use optionScores for anything else. If you are not certain of the exact wording, use plain ordered items without optionScores and say so in the rationale. Put each instrument in its own egoForm (split if over 8 items) and keep published skip patterns (AUDIT-C items 2-3 are skipped when the participant never drinks).

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
- Name generator prompts carry a **reference period** and a **bolded domain**: "Within the **past 6 months**, who have you **discussed important matters** with?", "Since **starting university**, who have you **become friends with**?" Use the same reference period across a theme. Default to the past 6 months when the study gives none.
- Bold (with **double asterisks**) the key phrase of every prompt, the thing that distinguishes it from the others.
- Interpreter prompts refer to "each person"; node attribute questions in forms refer to "this person".
- Write option labels as the participant would say them, short and mutually exclusive.

## 10. Burden: the deciding consideration

Burden is what the participant does: screens seen, questions answered, and above all questions repeated for every person and every pair. Estimate it as you design and fill burdenEstimate honestly; when two choices are equally valid, take the lighter one.

- Count per-person work: each alterForm question, bins prompt, highlight prompt and geospatial prompt is done once per person, so 5 per-person items with 15 people is 75 answers.
- Count tie work: a census is per pair; a relationshipForm is per tie.
- Merge where nothing is lost: one bins stage with 3 prompts instead of 3 stages; one map with position, connect and highlight prompts instead of several maps; a categorical item in an existing form instead of its own stage; adjacent egoForms on one topic.
- Every stage, prompt and attribute must earn its place against a research question. When in doubt, leave it out.
- Aim for an interview of 15-30 minutes: typically 8-14 stages, rarely more than 18.
- At most ~3 nameGenerator stages; 1-4 prompts each.
- At most ~4 interpreter stages per node type beyond the map; ordered bins at most 6 options, category bins at most 8.

### Filtering: decide who each question is about

Filtering is usually the strongest lever on burden, and the one most often missed. For every stage that repeats per person or per pair, ask which people the research question needs it for. When the answer is a subset, filter the stage to that subset instead of asking about everyone:

- Ties: pairs grow with the square of the people shown, so halving the people shown cuts a census to about a quarter. Structural measures are commonly computed on a core network (the people named at a core prompt, or rated close) rather than everyone named; when the research question is about that core, census only it. 12 people is 66 pairs; the 6 closest is 15.
- Follow-up questions that only apply to some people (how often you drink with them, where they live abroad, how they help) are asked only of the people a tag, highlight or earlier answer marks as relevant.
- The criterion must be collected earlier, about the same node type. A prompt tag costs nothing; a closeness item, highlight or form question the design already has can serve too. Add a criterion only when it is cheaper than the work it removes.
- Do not filter when the analysis needs everyone (whole-network composition, a measure defined over all alters), or when the subset would be too small to be worth a stage. Then lighten the stage another way (a cheaper tie method, fewer prompts, a lower maxNodes) and say why in the rationale.

Filtering is a judgement about this study, not a fixed pattern: weigh what the excluded people would have added against the time saved.

## 11. Brief or unusual studies

- Never refuse a real study, however brief: a single research question is enough to design from. Make the conventional choice for that kind of study and say so in the rationale. The default personal network design is: welcome; consent; egoForm with age and gender; one quick_add generator with a past-6-months prompt about the study's domain (maxNodes 15); bins for closeness and relationship type; a sociogram with a position prompt and a connect prompt for knows; closing.
- If a research question names an outcome (wellbeing, drinking, loneliness), measure it on the participant and, where it matters for the hypothesis, on the alters as perceived by the participant.
- Not offered, with the nearest alternative to design instead (say so in the rationale):
  - anonymising or encrypting names: ask for initials or a nickname in nameQuestion;
  - interviewer-led free-form network drawing in a self-administered or purely quantitative study: a sociogram with an interviewerNote;
  - family pedigree / family tree: a nameGenerator with a single_choice family relationship attribute, plus a sociogram connect prompt;
  - pedigree visualisation: in face_to_face qualitative studies, a narrative view grouped by that attribute;
  - images, video or audio on screens, and image map backgrounds: text in information stages and concentric circles;
  - maps below country level: text or single_choice location attributes;
  - directed ties or tie counts in skip logic: node attributes (yes_no tags or highlights) relative to the participant.

## 12. Worked example (key decisions only)

Research questions: "How do first-year undergraduates form friendship networks during their first semester? Is the drinking behaviour of a student's close friends associated with the student's own alcohol use and wellbeing?"

- administration self_administered (students complete it online), qualitative false, so no narrative. includeConsent true. egoAttributes: age (number [16, 99], required), gender (single_choice), lives_in_halls (yes_no); AUDIT-C (3 ordered items, optionScores [0, 1, 2, 3, 4]); WHO-5 (5 ordered items, 6 options "At no time" to "All of the time", optionScores [0, 1, 2, 3, 4, 5]).
- One node type person. Tags new_friend and support (yes_no, question ""); is_first_year (yes_no with labels "Yes" / "No, or I'm not sure") and first_met (month_year) in an alterForm, because neither is a bin kind; closeness (ordered, 4 options), how_met (single_choice, allowOther) and drinks_heavily (single_choice: Yes / No / I don't know, since "don't know" matters) in one bins stage; drinks_with as a sociogram highlight; drink_together_freq (ordered).
- One relationship knows. Up to 20 friends, and the map already positions them, so a sociogram connect prompt; a one_at_a_time census would also suit if complete tie data mattered more than the picture.
- Stages: welcome; egoForm about_you; nameGenerator quick_add with 3 prompts on one theme ("Since **starting university this semester**, who have you **become friends with**?" tagged new_friend; free time; "Who would you **turn to for support**…" tagged support), minNodes 0, maxNodes 20; alterForm; bins (closeness, how_met, drinks_heavily); sociogram (position, connect knows, highlight drinks_with); bins drinking_together with filter drinks_with is "yes" and skipLogic show_only_if about nodes, drinks_with is "yes"; egoForm AUDIT-C item 1; egoForm items 2-3 with skip_if participant audit_frequency is "Never"; egoForm WHO-5 after the network, so it does not prime it; closing screen with student support and alcohol helpline resources.
`;
