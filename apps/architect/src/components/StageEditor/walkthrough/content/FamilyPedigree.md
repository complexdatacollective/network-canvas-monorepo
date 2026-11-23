<!--
  Walkthrough for the "Family Pedigree" stage. See Sociogram.md for how
  this file becomes a walkthrough: "## " headings are steps, and HTML-comment
  directives (section:, field:, control:, scene:, include:) say where a step
  points.
-->

# Family Pedigree

## What a family pedigree is

<!-- scene: family-pedigree-intro -->

The Family Pedigree lets participants build a specialized map of their relatives called a **pedigree**. Each family member they add is saved as a node, and each relationship between family members is saved as an edge.

Participants start with only themselves on the canvas and add one relative at a time.

Once the pedigree is drawn, nomination prompts can ask participants to select anyone with a given attribute, such as a medical condition.

The stage suits family-history taking, such as a quick survey of a condition across relatives. It also suits studies of who a participant counts as family, whether biological, chosen or both.

Read the full [Family Pedigree documentation](https://documentation.networkcanvas.com/design-protocols/interface-documentation/family-pedigree).

## When to use it

Use this stage when you need to map a participant's family as a structure: who is related to whom, and how. Pair it with a [Narrative Pedigree](https://documentation.networkcanvas.com/design-protocols/interface-documentation/narrative-pedigree) to show the participant how a condition may run through the family they drew.

> Avoid: Using this stage if you do not need to capture the relationships between family members as edges. Simple name generators can be lower burden.

> Do: Use this in any setting where it is important to systematically capture the participant's family ties.

<!-- include: node-type -->

## Write the prompt

<!-- section: pedigree-prompt -->
<!-- field: prompt -->

The prompt appears above the canvas while the participant draws their family. Use it to invite the participant to add the people in their family, and to tell them how.

> Do: Tell participants how to add relatives in your prompt. The add buttons appear when the participant hovers over a person, or after they tap a person and close their details, and a participant who has not been told may not find them.

> Do: Provide an information screen prior to this that contains in-depth instructions for completing this task.

## Name each person

<!-- section: person-attributes -->
<!-- field: nodeConfiguration.nameAttribute -->
<!-- scene: family-pedigree-labels -->

The **Name** attribute defines which attribute is used for the node's label. Names are optional. A relative left unnamed is labeled by how they are related to the participant, such as "Maternal aunt", and that label is saved as their name when the participant leaves the stage. The participant is labeled "You".

## Record sex assigned at birth

<!-- section: person-attributes -->
<!-- field: nodeConfiguration.sexAssignedAtBirthAttribute -->

**Sex assigned at birth** is always asked. It decides who can be a genetic parent of whom, and a Narrative Pedigree reads it to trace sex-linked conditions. The stage sets this attribute's options, but you can reword and translate their labels.

## Mark the participant

<!-- section: person-attributes -->
<!-- field: nodeConfiguration.egoAttribute -->

The **Participant marker** is a special attribute that is true on the participant's own node and blank on everyone else. Use it in a stage filter to keep the participant out of later stages about their relatives. Everyone else has no value rather than false, so filter for "is not" true.

## Ask about gender identity

<!-- section: gender-identity -->
<!-- field: nodeConfiguration.genderIdentity.attribute -->
<!-- scene: family-pedigree-gender -->

With **Ask about gender identity** switched on, the side panel asks about each person's gender identity, and the participant must answer before the person is saved. Choose the attribute that should store this value. Use **Edit options** to customize options and kinship words: feminine (mother, sister), masculine (father, brother), neutral (parent, sibling), or not known.

With **Ask about gender identity** switched off, the question is not asked, and words such as mother or brother follow each person's sex assigned at birth instead.

> Do: Give the gender identity attribute an option such as "Don't know" when the stage asks about it. The question must be answered for every person the participant adds, and many participants do not know every relative's gender identity.

## Choose the symbols

<!-- section: person-attributes -->
<!-- field: pedigree-symbols -->
<!-- scene: family-pedigree-symbols -->

**Symbols** sets the shape each person is drawn as, following standard pedigree nomenclature:

- **Sex assigned at birth**: a circle for female, a square for male and a diamond for everyone else.
- **Gender identity**: a circle for options with feminine words, a square for options with masculine words and a diamond for all other options.
- **Set in the codebook**: any other shape mapping, made in the codebook.

The choice changes the codebook straight away, and it applies wherever nodes of this type are drawn, including on other stages.

## Record how each person is related

<!-- section: relationship-to-participant -->
<!-- field: nodeConfiguration.relationshipToParticipantAttribute -->
<!-- scene: family-pedigree-relationship -->

Switch on **Record each person’s relationship to the participant** to save each person's relationship to the participant in an attribute. The interview works out each relationship based on the pedigree structure. Later stages can then filter or skip on this attribute.

> Avoid: Inferring how people are related from their names or kinship words. A label for an unnamed person is worded for the participant, in their language and the stage's wording. A named person has no kinship word saved at all.

## Choose how relationships are stored

<!-- section: relationships -->
<!-- field: edgeConfiguration.type -->
<!-- scene: family-pedigree-relationships -->

Pick the **Relationship edge type** used to save every partnership and parent-child relationship. Then choose the attributes the stage stores on each edge:

- **Relationship kind**: partner, biological, adoptive, step or social parent, egg or sperm donor, surrogate, or twin.
- **Gestational carrier**: whether a parent carried the pregnancy.
- **Current partner**: whether a partnership is current or has ended.

Changing the edge type clears these attributes from the stage, because they depend on the edge type.

## Configure wording

<!-- section: pedigree-wording -->
<!-- field: framing -->
<!-- scene: family-pedigree-framing -->

People the participant does not name are labeled by their relationship, and these terms are often gendered, which may read as exclusionary depending on your research population. Choose between wording behaviors to address this:

- **Everyday kinship words** (the default): mother, father, sister, aunt.
- **Egg parent and sperm parent**: biological parents are named by the gamete they gave. Every other relative gets a neutral word, such as grandparent or sibling.
- **Let the participant choose**: the participant is asked which words to use before anything else on the stage, and cannot draw their family until they answer. They can change their answer from the toolbar at any time.

The choice changes only the words participants read and is not reflected in the data that is exported.

## Collect additional attributes for each person

<!-- section: person-form-fields -->
<!-- field: form.fields -->

Switch on **Additional person fields** to ask more about each family member. The participant is shown these questions for every person they add, and also for themselves.

> Do: Use the dynamic attribute that determines who the question is being asked of to tailor wording to suit the question being asked of the participant or their family members.

> Avoid: Long forms with many items. Participants answer the additional person fields for every family member, so shorter forms reduce response burden and encourage more complete family trees.

## Configure requirements

<!-- section: completeness -->
<!-- field: completeness.scope -->
<!-- scene: family-pedigree-completeness -->

Switch on **Completeness** to require that participants create alters up to a specific boundary. Boundary choices range from both biological parents to three generations, including first cousins. Only biological relatives count.

A ring in the toolbar fills to show the participant their progress, and interacting with the ring lists what is still needed. Participants can say that someone has no siblings or children, or that they do not know, so a requirement never forces them to provide inaccurate data.

> Do: Check how much family history your analysis needs before you set a completeness requirement. Required completeness asks for more work of every participant, and a participant who knows little about their relatives cannot continue until each missing person is added or answered.

## Make completeness required or recommended

<!-- section: completeness -->
<!-- field: completeness.enforcement -->

**When the family is incomplete** sets how firm the requirement is:

- **Required**: participants cannot continue until the required relatives and details are recorded.
- **Recommended**: participants are shown what is missing, and may continue.

<!-- include: built-in-wording -->

## Attribute nomination prompts

<!-- section: nomination-prompts -->
<!-- field: nominationPrompts -->
<!-- scene: family-pedigree-nomination -->

Nomination prompts ask the participant to select any family member with a given attribute, such as "Who in your family has had heart disease?"

Each prompt records a true or false attribute: true for everyone the participant selects, false for anyone they select and then deselect, and blank for everyone else.

> Do: Use a nomination prompt when you want to know which relatives a condition applies to. The participant looks over the whole family and selects everyone it applies to, instead of answering the same question for each person one at a time.

<!-- include: skip-logic -->

<!-- include: interviewer-guidance -->

<!-- include: preview -->
