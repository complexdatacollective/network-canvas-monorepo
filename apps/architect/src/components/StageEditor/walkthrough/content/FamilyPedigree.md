<!--
  Walkthrough for the "Family Pedigree" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, scene:, dialog:, include:) say where a step
  points.
-->

# Family Pedigree

## What a family pedigree is

<!-- scene: family-pedigree-intro -->

The Family Pedigree lets participants build their family tree. Each family member they add is saved as a node, and each relationship between family members is saved as an edge. Participants start with only themselves on the canvas and add one relative at a time. A side panel asks about each person as they are added. Unlike other name generators, this stage builds the structure of the family and the details of each person together. It is designed to be visual and intuitive, so participants can complete it without face-to-face supervision.

Once the family is drawn, nomination prompts can ask participants to select anyone with a given attribute, such as a medical condition. The result is a structured record of the family that researchers and clinicians can analyze, export, or show back to the participant on a Narrative Pedigree.

The stage suits family-history taking, such as a quick survey of a condition across relatives. It also suits studies of who a participant counts as family, whether biological, chosen or both.

Read the full [Family Pedigree documentation](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/family-pedigree).

## What data it collects

<!-- scene: family-pedigree-data -->

This stage collects a participant's family: its members and the relationships between them. In your exported data, each family member is a node of the type you choose, with their name, sex assigned at birth and the other attributes you set up. Each partnership and parent-child relationship is an edge. All of these edges have the same edge type, and an attribute on each edge says what kind of relationship it is. Later stages can use this data.

## When to use it

Use this stage when you need a participant's family as a structure: who is related to whom, and how. Pair it with a [Narrative Pedigree](https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/narrative-pedigree) to show the participant how a condition may run through the family they drew.

## The tools on the canvas

<!-- scene: family-pedigree-tools -->

The toolbar sits at the bottom of the canvas, with the view controls beside it in a toolbar of their own. The numbers match the toolbar above:

1. **Add and edit** (the default): point at a person to add relatives, or select a person to edit their details.
2. **Connect**: join two people who are both already drawn, as partners or as parent and child. Use it for relationships between people already on the canvas, such as a step-parent or a second parent shared by half-siblings. Choices that would contradict the family already drawn, such as a third biological parent, are unavailable, with a note saying why.
3. **Disconnect**: remove the connection between two people. The participant confirms first, and both people stay in the family. The stage refuses a removal that would cut someone off from the participant.
4. **Wording**: shown when the stage lets the participant choose the words used for their family. The participant can use it to change their choice at any time.
5. **Undo**: takes back the participant's last change to the family. It also works with the usual keyboard shortcut. Undo is unavailable while the side panel is open.
6. **Redo**: brings back a change that was undone.
7. **Progress ring**: shown when you set a completeness requirement. Pointing at the ring lists what is still needed.
8. **Zoom out**: the first button in the separate view toolbar.
9. **Zoom in**: the second button in the view toolbar.
10. **Show the whole family**: fits everyone on the screen at once.

The participant can also drag the canvas to move around, and zoom with the mouse wheel, a pinch, or the + and − keys.

## Add a relative

<!-- scene: family-pedigree-add -->

Pointing at a person shows four buttons for adding a relative: a parent above, a sibling to the left, a partner to the right and a child below. When the participant chooses a button, the side panel opens and asks about the new person and their relationship before that person is saved. Selecting a person opens the same panel to edit their details.

## Choose who the family members are

<!-- section: Node setup -->

Pick the **node type** each family member is saved as, for example _Person_. If a Narrative Pedigree reads this stage's family, you can't change the node type.

<!-- include: node-type -->

## Write the prompt

<!-- section: Prompt -->
<!-- field: prompt -->

The prompt appears above the canvas while the participant draws their family. Use it to invite the participant to add the people in their family, and to tell them how.

> Do: Tell participants how to add relatives in your prompt. The add buttons appear when the participant hovers over a person, or after they tap a person and close their details, and a participant who has not been told may not find them.

## Name each person

<!-- section: Person attributes -->
<!-- field: nodeConfiguration.nameAttribute -->
<!-- scene: family-pedigree-labels -->

The **Name** attribute holds the name typed in the side panel. Names are optional. A relative left unnamed is labeled by how they are related to the participant, such as "Maternal aunt", and that label is saved as their name when the participant leaves the stage. The participant is labeled "You".

## Record sex assigned at birth

<!-- section: Person attributes -->
<!-- field: nodeConfiguration.sexAssignedAtBirthAttribute -->

**Sex assigned at birth** is always asked. It decides who can be a genetic parent of whom, and a Narrative Pedigree reads it to trace sex-linked conditions. The stage sets this attribute's options, but you can reword and translate their labels.

## Mark the participant

<!-- section: Person attributes -->
<!-- field: nodeConfiguration.egoAttribute -->

The **Participant marker** is true on the participant's own node and blank on everyone else. Use it in a stage filter to keep the participant out of later stages about their relatives. Everyone else has no value rather than false, so filter for "is not" true.

## Ask about gender identity

<!-- section: Ask about gender identity -->
<!-- field: nodeConfiguration.genderIdentity.attribute -->
<!-- scene: family-pedigree-gender -->

With **Ask about gender identity** switched on, the side panel asks about each person's gender identity, and the participant must answer before the person is saved. Choose the attribute that holds the answer, then use **Edit options** to give each option its kinship words: feminine (mother, sister), masculine (father, brother), neutral (parent, sibling), or not known.

With **Ask about gender identity** switched off, the question is not asked, and words such as mother or brother follow each person's sex assigned at birth instead.

> Do: Give the gender identity attribute an option such as "Don't know" when the stage asks about it. The question must be answered for every person the participant adds, and many participants do not know every relative's gender identity.

## Set up the gender identity options

<!-- dialog: create a new gender identity attribute | edit gender identity options -->

Each option is a gender identity the participant can choose. For each option, pick the kinship words used for an unnamed person with that gender identity. The options belong to this stage, because this stage decides their words, so another Family Pedigree stage needs a gender identity attribute of its own.

## Choose the symbols

<!-- section: Person attributes -->
<!-- field: pedigree-symbols -->
<!-- scene: family-pedigree-symbols -->

**Symbols** sets the shape each person is drawn as, following standard pedigree nomenclature:

- **Sex assigned at birth**: a circle for female, a square for male and a diamond for everyone else.
- **Gender identity**: a circle for options with feminine words, a square for options with masculine words and a diamond for all other options.
- **Set in the codebook**: any other shape mapping, made in the codebook.

The choice changes the codebook straight away, and it applies wherever nodes of this type are drawn, including on other stages.

## Record how each person is related

<!-- section: Record each person’s relationship to the participant -->
<!-- field: nodeConfiguration.relationshipToParticipantAttribute -->
<!-- scene: family-pedigree-relationship -->

Switch on **Record each person’s relationship to the participant** to save each person's relationship to the participant as a fixed value, such as `parent`, `sibling` or `grandparent`. The participant is never asked. Instead, the interview works out each relationship from the family each time the participant leaves the stage. Later stages can then filter or skip on this attribute.

> Avoid: Reading how people are related from their names or kinship words. A label saved for an unnamed person is worded for the participant, in their language and the stage's wording, and a named person has no kinship word saved at all. To analyze or filter on how people are related, record the relationship to the participant.

## Choose how relationships are saved

<!-- section: Relationships -->
<!-- field: edgeConfiguration.type -->
<!-- scene: family-pedigree-relationships -->

Pick the **Relationship edge type** used to save every partnership and parent-child relationship. Then choose the attributes the stage saves on each edge:

- **Relationship kind**: partner, biological, adoptive, step or social parent, egg or sperm donor, surrogate, or twin.
- **Gestational carrier**: whether a parent carried the pregnancy.
- **Current partner**: whether a partnership is current or has ended.

Changing the edge type clears these attributes from the stage, because they depend on the edge type.

## Choose the words for family members

<!-- section: Wording -->
<!-- field: framing -->
<!-- scene: family-pedigree-framing -->

People the participant does not name are labeled by their relationship, so the words matter:

- **Everyday kinship words** (the default): mother, father, sister, aunt.
- **Egg parent and sperm parent**: biological parents are named by the gamete they gave. Every other relative gets a neutral word, such as grandparent or sibling.
- **Let the participant choose**: the participant is asked which words to use before anything else on the stage, and cannot draw their family until they answer. They can change their answer from the toolbar at any time.

The choice changes only the words participants read, and adds nothing to your exported data.

## Ask more about each person

<!-- section: Additional person fields -->
<!-- field: form.fields -->

Switch on **Additional person fields** to ask more about each family member, such as whether they are still living. These questions come last in the side panel. The participant answers them for every person they add, and for themselves.

> Do: Word an additional person field for the participant as well as for their relatives with **Participant or someone else**, so that a question such as "Is this person still living?" reads "Are you still living?" in the participant's own panel.

> Avoid: Long forms with many items. Participants answer the additional person fields for every family member, so shorter forms reduce response burden and encourage more complete family trees.

<!-- include: node-form-field -->

<!-- include: form-field-details -->

## Check the family is complete enough

<!-- section: Completeness -->
<!-- field: completeness.scope -->
<!-- scene: family-pedigree-completeness -->

Switch on **Completeness** to check that participants have recorded at least the part of their family you choose, and every required detail about each person. Choose that part under **Relatives to record**. The choices range from both biological parents to three generations, including first cousins. Only biological relatives count.

A ring in the toolbar fills as the family nears what you require, and pointing at the ring lists what is still needed. People missing a required detail carry a warning symbol. Participants can say that someone has no siblings or children, or that they do not know, so a requirement never forces a guess.

> Do: Check how much family history your analysis needs before you set a completeness requirement. Required completeness asks for more of every participant, and a participant who knows little about their relatives cannot continue until each missing person is added or answered.

## Make completeness required or recommended

<!-- section: Completeness -->
<!-- field: completeness.enforcement -->

**When the family is incomplete** sets how firm the requirement is:

- **Required**: participants cannot continue until the required relatives and details are recorded.
- **Recommended**: participants are shown what is missing, and may continue.

## Customize built-in wording

<!-- section: Customize built-in wording -->

This section holds the wording Network Canvas supplies for this stage, including the side panel's questions, the connect and disconnect messages, and the completeness checklist when completeness is switched on. Many of these items have one version about the participant and another about someone else. Wording that every Family Pedigree stage shows, such as the tool names, is under **Shared by every stage of this kind**, and a change there applies to every stage that shows it.

Read more about [words Network Canvas supplies](https://documentation.networkcanvas.com/en/design-protocols/translating-your-protocol#words-network-canvas-supplies).

## Ask about the whole family

<!-- section: Nomination prompts -->
<!-- field: nominationPrompts -->
<!-- scene: family-pedigree-nomination -->

Nomination prompts ask questions about the whole family once it is drawn, such as "Who in your family has had heart disease?" The participant selects everyone the question applies to. Participants see the prompts in order, after drawing the family.

A Narrative Pedigree reads the attribute each prompt records to show who has a condition.

> Do: Use a nomination prompt when you want to know which relatives a condition applies to. The participant looks over the whole family and selects everyone it applies to, instead of answering the same question for each person one at a time.

## Write the question

<!-- dialog: create nomination prompt | edit nomination prompt -->
<!-- field: text -->

The **Prompt text** is the question the participant reads above the family while selecting people.

## Choose what it records

<!-- dialog: create nomination prompt | edit nomination prompt -->
<!-- field: attribute -->

Pick a true or false **Attribute**. It is set to true on everyone the participant selects, and to false on anyone they select and then deselect. Everyone else is left blank.

## Limit who can be selected

<!-- dialog: create nomination prompt | edit nomination prompt -->
<!-- field: onlyForSexAssignedAtBirth -->

Use **Who can be selected** to leave out people assigned male at birth or people assigned female at birth, for a condition that only people of one sex can have. The people left out are shown as unavailable. Everyone else can still be selected, including people whose sex at birth is not known.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
