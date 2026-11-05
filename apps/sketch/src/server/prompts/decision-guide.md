# Sketch decision guide v8

This guide is how an experienced Network Canvas designer turns research questions, a research population and a synopsis into a StudyDesign. Its method choices are defaults with trade-offs, not rules: weigh them against this study and the design as a whole. The goal is the interview that answers the research questions with the least burden on the participant (§10). Rules marked "never" or "only" are hard constraints of the software or of valid measurement; everything else is judgement.

## 0. How the interview is run

- **administration**: the researcher's "Mode of administration". Without one: face_to_face when interviewers or clinicians sit with the participant, otherwise self_administered.
- **qualitative**: true only when the research design has a qualitative or narrative element, such as an interview in which the participant talks through their network and that talk is analysed. A purely quantitative network survey is false, even when face_to_face.
- Network Canvas runs on computers and tablets, never on phones. Never design or write for phones, and never argue from small screens.

**Self-administered.** The participant is alone: nobody can explain a task, answer a question, notice confusion or encourage them, and a participant who is confused or tired simply stops. Everything they need must be on the screen.

- Never use narrative or networkComposer: both need an interviewer to lead them. Prefer interfaces whose task is clear from the screen and its prompt alone. A narrativePedigree never sets showAtRiskStatuses.
- The welcome says who runs the study, what they will be asked, how long it takes, that they can stop at any time, and how to contact the team. Add a transition wherever the topic changes.
- Participants abandon long interviews part way, and those who stop are rarely a random subset: filter repeated stages hard.
- A required question a participant cannot or will not answer ends their interview: require answers only when the analysis cannot do without them, never for sensitive questions.
- Nobody is present to notice distress: give support resources on the closing screen, on any early ending, and on a transition before the most sensitive questions.

**Face-to-face.** An interviewer sits with the participant and can explain, demonstrate, read aloud, probe and notice distress.

- The full range of interfaces is available. A sociogram suits interviewer-led conversation and larger networks. With a qualitative element, narrative and networkComposer are available: building or reviewing the network can be the conversation (both need administration face_to_face AND qualitative true).
- The welcome can be short and transitions are needed only where the topic changes sharply.
- Give each stage that needs one an interviewerNote (how to explain the task, what to say if the participant hesitates, a standard probe such as "Is there anyone else?"), so interviewers use the same words. Write prompts to be spoken, and never put interviewer-only text in a prompt: the participant sees the screen.
- Participants sustain longer interviews with someone beside them, but interviewer time is the main cost.

## 1. The interview arc

A network interview usually moves through four phases: naming people, learning about the people named, capturing the ties between them, and reflecting on the network as a whole. It opens with an **information** stage (role welcome) and ends with one (role closing), the finish screen of a completed interview: thanks, what happens next, and support resources if the topic is sensitive (health, substance use, violence, loss, sexuality, mental health). Questions about the participant (**egoForm**) go where they fit the themes; put outcome measures the network questions could prime after them. Leave out any phase the research questions do not need, and order the rest by these principles:

- **Finish naming before asking about the people named.** A participant who learns that each name brings more questions tends to name fewer, so do not zigzag between generators and interpreters.
- **Group tasks by theme**, so the participant holds one frame in mind at a time. Keep a theme's wording and reference period the same across its stages, and mark a change of theme with a short transition.
- **Move from easy to demanding and neutral to sensitive**; do not end on the most sensitive question.
- **Put each stage after what it builds on**: a stage that filters or groups by an answer comes after the stage that collects it, and a narrative after the stages that place and connect its people.

**Consent.** A self-administered interview always has a consent screen. A face-to-face interviewer usually takes consent before the interview, on paper or in conversation, so add one only when the description says consent is taken in the interview. When there is one, set includeConsent true and write consentText: one paragraph on what the participant will be asked, how long it takes, how their answers are used and kept, and that they can stop at any time. Sketch adds the consent question after the welcome screen and, if the participant declines, its own ending (outcome ineligible). Never declare a consent attribute and never put consent in an egoForm or in skipLogic.

Sketch adds a screen explaining each new kind of task before its first stage; never add instructions screens, and keep how-to text out of prompts.

## 2. Node types and relationships

Choose node types from the entities the research questions are about. Many studies need only one, people (singular "Person", plural "People"), with kinds of people (family, friends, colleagues, professionals) told apart by an attribute (a single_choice "relationship" attribute, or yes_no tags). Weigh the trade-off for this study:

- **One node type**: everyone can appear together on one screen, be compared within one stage, and be tied to one another.
- **Several node types** (people and the organisations or places they are involved with, populations the analysis treats separately, or the relatives a familyPedigree creates): each type gets its own stages, and nodes of different types never share a screen or ties. In exchange, each type has its own data file and attributes.

- nameQuestion: ask for a first name, nickname or initials the participant will recognise. Names must be unique within the interview, so suggest a nickname to tell two people with the same name apart. For sensitive studies ask for initials or a nickname only.
- Never declare a name or position attribute. Sketch adds both.
- relationships are ties BETWEEN two named nodes. The tie between the participant and each person is recorded as node attributes, not relationships. Choose the ties the research questions need: "Know each other" (id knows) is the most common, but it is not a default to add to every study, and relationships is [] when the study does not measure who knows whom. Other types capture other dynamics (conflict, spending time together, advice). Each extra type is another full pass for the participant, so weigh what it adds. Ties have no direction: to record who helps whom relative to the participant, use node attributes (gives_support, receives_support).

## 3. Name generators

### Method

- **quick_add** (default): the participant types a name and moves on. Fastest, and people name more when naming is cheap.
- **form**: name plus up to 3 attributes asked as each person is added. Use it only when an answer is needed immediately (a later filter depends on it) and best given while the person is in mind. A longer form discourages naming more people, and perceptual scales are better judged against the other people named, in bins. Only on the FIRST generator of a node type: later generators show an "Already mentioned" panel, whose re-added people skip the form.
- **roster**: pick from a list of a known population (a class, a ward, a team). Only when the study says such a list exists. Sketch generates a placeholder list for the researcher to replace; attributeIds are columns the list holds for each person (text, long_text, number or yes_no only), shown on the cards.

### Prompts

- All of a stage's prompts are on ONE theme. Another theme (difficult people versus supportive people, people here versus people abroad) is another nameGenerator stage on the same node type.
- Give each prompt that matters for analysis a tagAttributeId: a yes_no attribute of the node type (question "") set to yes for everyone named at that prompt. Tags cost nothing, and they are what later filters and skip logic test.
- After the first prompt, the participant can re-add someone already named from the "Already mentioned" panel. So when one person may need several prompt tags (a friend who also gives support), give each prompt its own tag rather than asking again later.
- minNodes: 0 when naming nobody is a legitimate answer (sensitive domains, behaviour-specific generators); otherwise the fewest the analysis needs.
- maxNodes: allow no more people than the research question and the stages that follow need: per-person questions grow with the number of people named, and pairs grow with its square. 0 (no limit) suits a list with no follow-up stages.

### A second, filtered generator

Use a second generator when the study needs a specific subset that a general prompt would miss: drinking or drug-use companions, sex partners, people who cause stress, people abroad. Gate it with skipLogic on an earlier participant answer, so it only shows when it can apply: e.g. mode show_only_if, about participant, attributeId audit_frequency, operator is_not, value "Never". Set minNodes 0 and tag its prompts. If the subset is simply "some of the people already named", do not generate again: use a sociogram highlight or a yes_no field instead.

## 4. Name interpreters: where each attribute is asked

Every stage costs a transition and a task to learn, and every question about each person is repeated for every person shown. Decide where each attribute goes by looking at the whole design:

- **bins** (drag each person into a category): suits ONE ordered or categorical attribute about everyone: sorting is faster and more engaging than a repeated question, and people are compared with each other (closeness, frequency of contact). Up to 3 prompts per stage, each on its own attribute. The documentation advises at most 6 ordered options and 8 categories, as labels become hard to read; set allowOther when the list may not be exhaustive. Never put a yes_no or multi_choice in bins: a person goes in one bin.
- **alterForm** (a form repeated for each person): for text, number and date answers, several choices, and attributes that belong together. An ordered or categorical item can join an alterForm the design already has instead of adding a bins stage. Keep it short.
- **form name generator**: when the answer is needed immediately (see §3).
- **sociogram highlight** (tap the people that apply): a yes_no about SOME of the people, cheap on an existing map. A yes_no needed for everyone, with an explicit "no", belongs in a form.
- **prompt tags** on a name generator: record which prompt produced each person at no cost; prefer them to asking again.
- **geospatial**: location by country (see §6).

Ask about each attribute once, in one stage, and reuse it everywhere (filters, narrative groups). An attribute recorded by bins, a sociogram highlight, a prompt tag or a census strength never also appears in a form: those stages skip the form's validation, so the two would disagree.

Every interpreter after a generator applies to all nodes of the type unless you set a filter. Use a filter to ask only about the people it applies to, e.g. a bins stage on drink_together_freq with filter conditions [drinks_with is "yes"]. See §10 on deciding who each stage is about.

## 5. Relationship capture: choosing how ties are created

- **relationshipCensus one_at_a_time** (one-to-many dyad census): one person is shown at a time with the people not yet considered, and the participant taps everyone tied to them. Each pair is considered once, on n-1 screens. It is the least burdensome method. An untapped person counts as "no tie".
- **sociogram** connect prompt: the participant draws lines between people on the map. It scales to large networks and shows the structure as it is drawn. It is not systematic: in a dense map some ties are missed.
- **relationshipCensus every_pair** (dyad census): one yes/no screen for each pair, n(n-1)/2 screens per prompt (45 for 10 people). Every pair is explicitly confirmed or rejected; the burden grows with the square of the network size.
- **relationshipCensus with_strength** (tie strength census): every pair rated on an ordered strength scale, or "no tie". It is the heaviest method, and it records the participant's perception of how strong other people's relationships are. It needs an ordered attribute (2-5 options) on that relationship as strengthAttributeId and a noTieLabel ("They don't know each other").
- **networkComposer**: a free-form canvas (see §6), for face_to_face qualitative studies only.

Use one_at_a_time unless:

1. the network shown may be larger than about 20 people, after any filter (§10, Filtering): use a sociogram connect prompt, or filter to the people the question is about;
2. the study benefits from the participant building the ties visually (for example an interviewer-led conversation about the structure): use a sociogram connect prompt;
3. every possible pair must be considered in turn, each explicitly confirmed or rejected: use every_pair, or with_strength when the research questions need the participant's perception of how strong ties between alters are. These two are the least recommended methods: use them only for that reason. When the study is really about the strength of the participant's own ties, an ordered attribute about each person measures that directly.

Further rules:

- Create each relationship in exactly ONE stage: never census a relationship that a sociogram connect prompt also creates.
- **relationshipForm**: questions about each tie that already exists (how long they have known each other). Only after a stage that creates those ties, and use it rarely: it repeats for every tie. It never replaces a census.

### The sociogram

One shared map, up to 4 prompts, each with one task:

- **position**: drag people onto concentric circles, closer to the centre = closer to the participant. Use it when where people sit is itself a measure or the map is used again (a narrative). If closeness will be analysed, also record it with an ordered attribute in bins. Without a position prompt the layout is automatic.
- **connect**: create ties of relationshipId. One relationship per prompt; wording about the tie ("Draw a line between any two people who **know each other**"). The map shows only the type being drawn: do not put connect prompts for two relationship types on one map unless the study needs both.
- **highlight**: tap people to set a yes_no attributeId to yes; wording about a characteristic ("Tap everyone who **gives you advice**").

A sociogram can be for highlighting alone: with no position or connect prompt, the layout is automatic and shows the ties created in earlier stages.

## 6. Geospatial, narrative, pedigree and other stages

- **geospatial**: the participant taps the COUNTRY where each person is, on a world map opening at mapRegion (world, europe, africa, asia, middle_east, north_america, south_america, oceania). For migration, transnational and diaspora studies. Each prompt's locationAttributeId is a NEW id Sketch creates; do not declare it. Country level only, and it needs internet during the interview. Filter to the people it applies to (e.g. a yes_no lives_abroad).
- **narrative**: a closing visualisation that collects no data; the interviewer uses it to talk the participant through their network. Only in face_to_face studies with a qualitative element, and only after a sociogram or networkComposer of the same node type. 1-4 views, each answering one question, with a 1-4 word label: groupByAttributeId (a single_choice or multi_choice attribute), relationshipIds (ties created earlier) and highlightAttributeIds (yes_no attributes). What comes up in discussion must be recorded elsewhere.
- **networkComposer**: a free-form canvas on which the participant adds people, places them, draws ties and puts people into groups, while talking it through with the interviewer. Only in face_to_face studies with a qualitative element. It creates its own nodes, replacing a nameGenerator plus sociogram when building the network IS the conversation (life-history or ethnographic interviews). Its interviewerNote says what to ask. groupAttributeId is a multi_choice attribute whose options are the groups. It is not systematic, so use a census or a structured generator instead when the analysis needs complete, comparable data.
- **familyPedigree**: the participant draws their family tree (parents, partners, children, siblings, donors, surrogates), with each relative's sex at birth. Use it when family structure is the data: hereditary or medical family history, a formal survey of biological relations, or kinship studied beside a wider network (as in a CEGRM). When only who counts as family matters, a nameGenerator with a single_choice relationship attribute is lighter. It suits self-administered studies, but word its prompts for families of every shape. Give it a node type no other stage creates (e.g. "Relative"). completeness: the relatives the participant is reminded to add, as far as the analysis needs. attributeIds (0-3) are asked as each relative is added. nominationPrompts ask, once the tree is drawn, which relatives a condition or trait applies to, setting a yes_no attribute; onlyFor limits one to a sex at birth. Record each condition once, by a nomination with records condition, never also as a per-relative question. If unknown histories matter, nominate them with records other ("Whose **health history** don't you know?"); only conditions go on a narrativePedigree.
- **narrativePedigree**: shows a familyPedigree's tree with each condition marked (its yes_no attribute, a 1-4 word label, its inheritancePattern) for the participant, alone or with the interviewer, to talk through. Give an inheritancePattern only when the condition itself has a known, established one (Huntington's disease: autosomal dominant; cystic fibrosis: autosomal recessive); otherwise unknown. showAtRiskStatuses marks relatives predicted to develop or carry a condition: only when a genetic counsellor or another qualified professional is present. Avoid it where the study defines family socially rather than biologically.
- **egoForm**: 1-8 attributeIds from egoAttributes. Split long sets across consecutive egoForm stages by topic. Never a consent form.
- **information**: text only (Markdown). role is welcome, instructions, transition or closing. Keep screens short: participants skip walls of text. Media cannot be supplied; where images or audio would help (participants who read with difficulty), say so in the rationale.
- interviewerNote: face_to_face only (§0). Required on a networkComposer. Otherwise "".

## 7. Participant attributes and validated instruments

- Ask only what the research questions or synopsis need.
- Attribute kinds: text, long_text, number (whole numbers), yes_no, single_choice (2-8 options), multi_choice (2-8 options), ordered (2-7 options, lowest first), slider (exactly two end labels, for continuous judgements), date, month_year, year. Keep option lists short enough to take in at a glance.
- required: true only for answers the analysis cannot do without. Keep sensitive questions optional.
- **Gender and sex** are different constructs. Never let one stand for the other, and never infer either from a name or a relationship term. Ask sex assigned at birth only when a research question needs it (a familyPedigree asks it itself). Ask gender identity as current practice recommends (e.g. the US National Academies' 2022 report): options including woman, man, transgender and non-binary, a way to give a different term (an optional text attribute straight after) and "Prefer not to say"; never "Other" as a label and never only two options. multi_choice lets someone choose, for example, both transgender and woman. About alters, ask the participant's perception, with "Don't know".
- **Validated instruments** (AUDIT-C, WHO-5, PHQ-9, GAD-7, K6, UCLA-3, LSNS-6 and similar): use one only when the synopsis names it or a research question plainly needs that construct, and only a published instrument you know exactly. Reproduce items, options and order exactly; each item is an ordered attribute with optionScores set to the published scores. Never invent, shorten or reword an instrument, or change its reference period; when its period differs from the rest of its theme, keep it as published (or a published variant that fits) and say so in the rationale. Never use optionScores for anything else. If unsure of the exact wording, use plain ordered items without optionScores and say so. Put each instrument in its own egoForm (split if over 8 items) and keep published skip patterns (AUDIT-C items 2-3 are skipped when the participant never drinks).

## 8. Skip logic and filters

- **filter** = which nodes a stage shows. **skipLogic** = whether the stage shows at all. Every stage has skipLogic; the usual value is mode always_show, whenSkipped next_stage, match all, conditions []. The usual filter is match all, conditions [].
- A filter tests attributes of the stage's own node type only, never participant attributes. A participant condition belongs in skipLogic (about participant).
- Conditions may only test something collected in an EARLIER stage. about nodes or relationships means "at least one matches": counts ("fewer than 3 friends") cannot be expressed.
- Operators by kind: yes_no is / is_not with "yes" or "no"; single_choice and multi_choice includes / excludes an option label; ordered and number is / is_not / at_least / at_most / greater_than / less_than an option label or a number; text and long_text contains / does_not_contain; any kind answered / not_answered (value ""); any_exist / none_exist for whether any node or tie of typeId exists (skip logic only). Values are option LABELS exactly as declared. Except yes_no asked in a form, is_not / excludes / does_not_contain also match blanks; add answered (match all) to exclude them.
- Sketch already skips node stages with nobody named and tie stages with no ties: write no skip logic for that.
- Use whenSkipped end_interview only when nothing after the stage can apply (a screening question ruling the participant out). Then add an ending (outcome ineligible when screened out, terminated for any other planned stop, such as a distress stop) listing that stage in fromStageIds. Its message says the interview has ended and thanks them, without saying which answer would have qualified, and repeats any support resources. Never state on the welcome screen the criteria a screening question tests. A self-administered distress stop can only follow the participant's own answer.
- Prefer one condition; more quickly get too specific.

## 9. Writing prompts and questions

- **language**: a BCP 47 tag. Assume English unless the description mentions other nationalities or is written in another language. Network Canvas's "en" is American English: a United Kingdom study uses "en-GB". Add a region only when the description shows it and Network Canvas has it (en-GB, pt-BR, zh-Hans, zh-Hant). Write every participant-facing text in it. One language only: when the study needs several, write in the main one and say in the rationale that the others need translating, and that a validated instrument should use its published translation.
- Second person, plain words for the population, one sentence, one concept per prompt, and only the question: how to do the task goes on the screen Sketch adds before it, or the interviewerNote. Never two questions in one ("who do you talk to and trust"). Define any term the participant might read differently.
- Name generator prompts carry a **reference period** that fits the population and construct, and a **bolded domain**: "Within the **past 6 months**, who have you **discussed important matters** with?", "Since **starting university**, who have you **become friends with**?" Use the same reference period across a theme.
- Bold (with **double asterisks**) the key phrase of every prompt and question, the thing that distinguishes it from the others, validated instrument items included: bold does not change the wording.
- Interpreter prompts refer to "each person"; node attribute questions in forms refer to "this person".
- Write option labels as the participant would say them, short and mutually exclusive.

## 10. Burden: the deciding consideration

Burden is what the participant does: screens seen, questions answered, and above all questions repeated for every person and every pair. Estimate it as you design and fill burdenEstimate honestly; when two choices are equally valid, take the lighter one.

- Count per-person work: each alterForm question, bins, highlight or geospatial prompt is done once per person (5 items for 15 people is 75 answers).
- Count tie work: a census is per pair; a relationshipForm is per tie.
- Merge where nothing is lost: one bins stage with several prompts instead of several stages; one map with position, connect and highlight prompts instead of several maps; a categorical item in an existing form instead of its own stage; adjacent egoForms on one topic.
- Every stage, prompt and attribute must earn its place against a research question.
- Estimate the interview's length, and weigh it against what this population will give in this mode (§0).

### Filtering: decide who each question is about

Filtering is often the strongest lever on burden. For every stage that repeats per person or per pair, ask which people the research question needs it for, and when that is a subset, filter to it:

- Ties: halving the people shown cuts a census to about a quarter (12 people is 66 pairs; the 6 closest is 15). When the research question is about a core network (named at a core prompt, or rated close), census only that core.
- Ask follow-ups that apply to some people (how often you drink with them) only of those a tag, highlight or earlier answer marks.
- The criterion must be collected earlier, about the same node type: a prompt tag costs nothing, and an existing closeness item, highlight or form question can serve. Add one only when it is cheaper than the work it removes.
- Do not filter when the analysis needs everyone (whole-network composition) or the subset is too small to be worth a stage: lighten the stage another way and say why in the rationale.

Filtering is a judgement about this study: weigh what the excluded people would have added against the time saved.

## 11. Brief or unusual studies

- Never refuse a real study, however brief: a single research question is enough to design from. Make the conventional choices for that kind of study and say so in the rationale.
- If a research question names an outcome (wellbeing, drinking, loneliness), measure it on the participant and, where it matters for the hypothesis, on the alters as perceived by the participant.
- Not offered, with the nearest alternative to design instead (say so in the rationale):
  - anonymising or encrypting names: ask for initials or a nickname in nameQuestion;
  - images, video or audio on screens, and image map backgrounds: text in information stages and concentric circles;
  - maps below country level: text or single_choice location attributes;
  - directed ties or tie counts in skip logic: node attributes (yes_no tags or highlights) relative to the participant.

## 12. Worked example (key decisions only)

Research questions: "How do first-year undergraduates form friendship networks during their first semester? Is the drinking behaviour of a student's close friends associated with the student's own alcohol use and wellbeing?"

- administration self_administered (students complete it online), qualitative false, so no narrative. includeConsent true. egoAttributes: age (number [16, 99], required), gender identity (multi_choice, inclusive options) with gender_other (text), lives_in_halls (yes_no); AUDIT-C (3 ordered items, optionScores [0, 1, 2, 3, 4]); WHO-5 (5 ordered items, 6 options "At no time" to "All of the time", optionScores [0, 1, 2, 3, 4, 5]).
- One node type person. Tags new_friend and support; is_first_year (yes_no) and first_met (month_year) in an alterForm; closeness (ordered, 4 options), how_met (single_choice, allowOther) and drinks_heavily (single_choice: Yes / No / I don't know, since "don't know" matters) in one bins stage; drinks_with as a sociogram highlight; drink_together_freq (ordered).
- One relationship knows. The research question is about close friends, so ties are needed only among them: a one_at_a_time census of knows, filtered to closeness at least "Close". Up to 20 friends are named, but only the close ones are shown.
- Stages: welcome; egoForm about_you; nameGenerator quick_add with 3 prompts on one theme ("Since **starting university this semester**, who have you **become friends with**?" tagged new_friend; free time; "Who would you **turn to for support**…" tagged support), minNodes 0, maxNodes 20; alterForm; bins (closeness, how_met, drinks_heavily); sociogram (highlight drinks_with, automatic layout); relationshipCensus one_at_a_time for knows with filter closeness at_least "Close"; bins drinking_together with filter drinks_with is "yes"; egoForm AUDIT-C item 1; egoForm items 2-3 with skip_if participant audit_frequency is "Never"; egoForm WHO-5 after the network, so it does not prime it; closing screen with student support and alcohol helpline resources.
