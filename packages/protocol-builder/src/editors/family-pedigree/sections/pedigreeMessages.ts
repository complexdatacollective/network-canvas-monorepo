import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The Family Pedigree stage editor's own words.
 *
 * In the interview, the participant selects a person on a canvas and adds
 * their parent, sibling, partner or child, describing each new person in a
 * side panel. These messages describe that interface to the researcher
 * configuring it.
 */
export const familyPedigreeMessages = defineMessages({
  nodeConfigurationTitle: {
    id: 'protocolBuilder.pedigree.personAttributesTitle',
    defaultMessage: 'Person attributes',
    description:
      'Heading of the section where a researcher chooses the codebook attributes a Family Pedigree records about every family member the participant adds.',
  },
  nodeConfigurationDescription: {
    id: 'protocolBuilder.pedigree.personAttributesDescription',
    defaultMessage:
      'Choose where the interface records what it asks about every family member. Pick an existing attribute, or create a new one from the picker.',
    description:
      'Description of the person attributes section. An attribute is a codebook variable.',
  },
  nodeConfigurationWaiting: {
    id: 'protocolBuilder.pedigree.personAttributesWaiting',
    defaultMessage: 'Choose the node type before choosing its attributes.',
    description:
      'Shown in place of the person attributes section’s description while no node type has been chosen for the stage.',
  },
  nameLabel: {
    id: 'protocolBuilder.pedigree.nameLabel',
    defaultMessage: 'Name',
    description:
      'Label of the control choosing the text attribute that holds each family member’s name.',
  },
  nameHint: {
    id: 'protocolBuilder.pedigree.nameHint',
    defaultMessage:
      'A text attribute holding each person’s name. The participant types it in the side panel when describing each family member, and may leave it blank.',
    description: 'Guidance under the name attribute control.',
  },
  nameCreateLabel: {
    id: 'protocolBuilder.pedigree.nameCreateLabel',
    defaultMessage: 'Create a new name attribute',
    description:
      'Title of the dialog that creates a new text attribute for family members’ names.',
  },
  genderIdentityTitle: {
    id: 'protocolBuilder.pedigree.genderIdentityTitle',
    defaultMessage: 'Ask about gender identity',
    description:
      'Title of the switch, and of the part of the person attributes section it opens, that makes a Family Pedigree ask each family member’s gender identity. A new stage has it switched on; switched off, the question is not asked.',
  },
  genderIdentityDescription: {
    id: 'protocolBuilder.pedigree.genderIdentityDescription',
    defaultMessage:
      'When off, relatives are described by their sex assigned at birth.',
    description:
      'Explains what happens when the gender identity question is switched off: the kinship words (mother, brother, parent) follow the sex a person was assigned at birth instead.',
  },
  genderIdentityClearTitle: {
    id: 'protocolBuilder.pedigree.genderIdentityClearTitle',
    defaultMessage: 'Stop asking about gender identity?',
    description:
      'Title of the confirmation shown before a researcher switches off the gender identity question of a Family Pedigree.',
  },
  genderIdentityClearDescription: {
    id: 'protocolBuilder.pedigree.genderIdentityClearDescription',
    defaultMessage:
      'The attribute and the words you chose for each option will be removed from this stage, and relatives will be described by their sex assigned at birth. The attribute and its options stay in the codebook.',
    description:
      'Body of the confirmation shown before the gender identity question is switched off, saying what is lost and what is kept. An attribute is a codebook variable.',
  },
  genderIdentityClearConfirm: {
    id: 'protocolBuilder.pedigree.genderIdentityClearConfirm',
    defaultMessage: 'Stop asking',
    description:
      'Button that confirms switching off the gender identity question and discarding the attribute and words chosen for it.',
  },
  genderOptionsEdit: {
    id: 'protocolBuilder.pedigree.genderOptionsEdit',
    defaultMessage: 'Edit options',
    description:
      'Button that opens the editor for the options of the gender identity attribute, so the researcher can add, remove, relabel or change them.',
  },
  genderOptionsEditTitle: {
    id: 'protocolBuilder.pedigree.genderOptionsEditTitle',
    defaultMessage: 'Edit gender identity options',
    description:
      'Title of the dialog in which the researcher edits the options of the gender identity attribute.',
  },
  genderOptionsEditHint: {
    id: 'protocolBuilder.pedigree.genderOptionsEditHint',
    defaultMessage:
      'These options can only be changed here. Anywhere else in the protocol they are shown read-only.',
    description:
      'Explains why the button that edits the gender identity options is on this stage: the options belong to the stage because it decides which kinship words each one takes.',
  },
  genderIdentityLabel: {
    id: 'protocolBuilder.pedigree.genderIdentityLabel',
    defaultMessage: 'Gender identity',
    description:
      'Label of the control choosing the categorical attribute that holds each family member’s gender identity.',
  },
  genderIdentityHint: {
    id: 'protocolBuilder.pedigree.genderIdentityHint',
    defaultMessage:
      'Records each person’s gender identity. This stage manages the options this attribute offers, so you edit them here and say below which words each one takes.',
    description:
      'Guidance under the gender identity attribute control. The options are the researcher’s own, and are edited only from this stage; the control that follows chooses the kinship words each takes.',
  },
  genderIdentityCreateLabel: {
    id: 'protocolBuilder.pedigree.genderIdentityCreateLabel',
    defaultMessage: 'Create a new gender identity attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for gender identity, starting from a suggested list of options the researcher can edit.',
  },
  genderOptionWoman: {
    id: 'protocolBuilder.pedigree.genderOptionWoman',
    defaultMessage: 'Woman',
    description:
      'Label of the suggested “woman” option when a new gender identity attribute is created. The researcher may rename it.',
  },
  genderOptionMan: {
    id: 'protocolBuilder.pedigree.genderOptionMan',
    defaultMessage: 'Man',
    description:
      'Label of the suggested “man” option when a new gender identity attribute is created. The researcher may rename it.',
  },
  genderOptionNonBinary: {
    id: 'protocolBuilder.pedigree.genderOptionNonBinary',
    defaultMessage: 'Non-binary',
    description:
      'Label of the suggested “non-binary” option when a new gender identity attribute is created. The researcher may rename it.',
  },
  genderOptionDifferentIdentity: {
    id: 'protocolBuilder.pedigree.genderOptionDifferentIdentity',
    defaultMessage: 'A different identity',
    description:
      'Label of the suggested option for a gender identity not named by the others, when a new gender identity attribute is created. The researcher may rename it.',
  },
  genderOptionUnknown: {
    id: 'protocolBuilder.pedigree.genderOptionUnknown',
    defaultMessage: 'Don’t know',
    description:
      'Label of the suggested option for a gender identity the participant does not know, when a new gender identity attribute is created. The researcher may rename it.',
  },
  genderOptionPreferNotToSay: {
    id: 'protocolBuilder.pedigree.genderOptionPreferNotToSay',
    defaultMessage: 'Prefer not to say',
    description:
      'Label of the suggested option for a participant who would rather not give a gender identity, when a new gender identity attribute is created. The researcher may rename it.',
  },
  genderTermsLabel: {
    id: 'protocolBuilder.pedigree.genderTermsLabel',
    defaultMessage: 'Words for each gender identity',
    description:
      'Label of the control that chooses, for each option of the gender identity attribute, the kinship words used for a person who has it, such as mother or father.',
  },
  genderTermsHint: {
    id: 'protocolBuilder.pedigree.genderTermsHint',
    defaultMessage:
      'Family members are described with kinship words such as mother, brother or aunt. Choose the words each gender identity takes. An option with neutral words is described as a parent, sibling or child.',
    description:
      'Guidance under the control that chooses the kinship words each gender identity option takes. Neutral words are the ones that do not depend on gender.',
  },
  genderTermsRowLabel: {
    id: 'protocolBuilder.pedigree.genderTermsRowLabel',
    defaultMessage: 'Words for {value1}',
    description:
      'Accessible name of the control choosing which kinship words one gender identity option takes. value1 is the option’s own label, as the researcher wrote it.',
  },
  genderWordsFeminine: {
    id: 'protocolBuilder.pedigree.genderWordsFeminine',
    defaultMessage: 'Feminine words (mother, sister)',
    description:
      'Choice for the kinship words a gender identity option takes: the words used for women, with examples.',
  },
  genderWordsMasculine: {
    id: 'protocolBuilder.pedigree.genderWordsMasculine',
    defaultMessage: 'Masculine words (father, brother)',
    description:
      'Choice for the kinship words a gender identity option takes: the words used for men, with examples.',
  },
  genderWordsNeutral: {
    id: 'protocolBuilder.pedigree.genderWordsNeutral',
    defaultMessage: 'Neutral words (parent, sibling)',
    description:
      'Choice for the kinship words a gender identity option takes: words that do not depend on gender, with examples.',
  },
  genderWordsUnknown: {
    id: 'protocolBuilder.pedigree.genderWordsUnknown',
    defaultMessage: 'Not known (named from sex assigned at birth)',
    description:
      'Choice for the kinship words a gender identity option takes, for an option meaning the person’s gender is not known: a biological parent is then named from their sex assigned at birth, such as biological mother.',
  },
  sexAssignedAtBirthLabel: {
    id: 'protocolBuilder.pedigree.sexAssignedAtBirthLabel',
    defaultMessage: 'Sex assigned at birth',
    description:
      'Label of the control choosing the categorical attribute that holds each family member’s sex assigned at birth.',
  },
  sexAssignedAtBirthHint: {
    id: 'protocolBuilder.pedigree.sexAssignedAtBirthHint',
    defaultMessage:
      'The interface uses this to name biological parents and donors, to work out who could have carried a pregnancy, to check that a child’s two biological parents are possible, to choose everyday kin words when gender identity is not asked, and to limit a nomination question to one sex assigned at birth. The interface sets this attribute’s options, and they cannot be changed.',
    description:
      'Guidance under the sex assigned at birth attribute control, saying why the interface needs it. The options are a fixed list the interface owns. Kin words are the family words (mother, brother, parent). A nomination question is one question asked of the whole family, such as who has had a condition.',
  },
  sexAssignedAtBirthCreateLabel: {
    id: 'protocolBuilder.pedigree.sexAssignedAtBirthCreateLabel',
    defaultMessage: 'Create a new sex assigned at birth attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for sex assigned at birth, seeded with the fixed options the interface owns.',
  },
  egoLabel: {
    id: 'protocolBuilder.pedigree.egoLabel',
    defaultMessage: 'Participant marker',
    description:
      'Label of the control choosing the true/false attribute that marks which family member is the participant.',
  },
  egoHint: {
    id: 'protocolBuilder.pedigree.egoHint',
    defaultMessage:
      'The interface sets this true/false attribute to true on the participant’s own person. Use it in a stage filter to keep the participant out of later stages, such as a name generator or sociogram of their relatives, or to tell them apart in exports and analysis. Nothing else in the protocol may write it.',
    description:
      'Guidance under the participant marker attribute control. A stage filter is the set of rules, in the stage’s Stage filter section, that decide which nodes a stage shows. A name generator and a sociogram are kinds of interview stage.',
  },
  egoCreateLabel: {
    id: 'protocolBuilder.pedigree.egoCreateLabel',
    defaultMessage: 'Create a new participant marker attribute',
    description:
      'Title of the dialog that creates a new true/false attribute marking the participant.',
  },

  relationshipsTitle: {
    id: 'protocolBuilder.pedigree.relationshipsTitle',
    defaultMessage: 'Relationships',
    description:
      'Heading of the section where a researcher chooses how a Family Pedigree records the relationships between family members.',
  },
  relationshipsDescription: {
    id: 'protocolBuilder.pedigree.relationshipsDescription',
    defaultMessage:
      'Choose the edge type family relationships are recorded as, and the attributes the interface writes on each one. Siblings are not recorded directly: two people are siblings when they share a parent.',
    description:
      'Description of the relationships section. An edge is a connection between two members of the network.',
  },
  relationshipTypeLabel: {
    id: 'protocolBuilder.pedigree.relationshipTypeLabel',
    defaultMessage: 'Relationship edge type',
    description:
      'Label of the control choosing which kind of connection family relationships are recorded as.',
  },
  relationshipTypeHint: {
    id: 'protocolBuilder.pedigree.relationshipTypeHint',
    defaultMessage:
      'Every partnership and parent–child relationship the participant draws is recorded as an edge of this type.',
    description: 'Guidance under the relationship edge type control.',
  },
  kindLabel: {
    id: 'protocolBuilder.pedigree.kindLabel',
    defaultMessage: 'Relationship kind',
    description:
      'Label of the control choosing the categorical attribute that records what kind of relationship each edge is: a partnership, or a kind of parenthood.',
  },
  kindHint: {
    id: 'protocolBuilder.pedigree.kindHint',
    defaultMessage:
      'Records whether a relationship is a partnership or which kind of parent one person is to the other. The interface sets the options this attribute offers, and nothing else in the protocol may write it.',
    description:
      'Guidance under the relationship kind attribute control. The options are a fixed list the interface owns.',
  },
  kindCreateLabel: {
    id: 'protocolBuilder.pedigree.kindCreateLabel',
    defaultMessage: 'Create a new relationship kind attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for relationship kinds, seeded with the fixed options the interface owns.',
  },
  gestationalCarrierLabel: {
    id: 'protocolBuilder.pedigree.gestationalCarrierLabel',
    defaultMessage: 'Gestational carrier',
    description:
      'Label of the control choosing the true/false attribute that marks the parent who carried a pregnancy.',
  },
  gestationalCarrierHint: {
    id: 'protocolBuilder.pedigree.gestationalCarrierHint',
    defaultMessage:
      'A true/false attribute set on a parent relationship when that parent carried the pregnancy. Nothing else in the protocol may write it.',
    description: 'Guidance under the gestational carrier attribute control.',
  },
  gestationalCarrierCreateLabel: {
    id: 'protocolBuilder.pedigree.gestationalCarrierCreateLabel',
    defaultMessage: 'Create a new gestational carrier attribute',
    description:
      'Title of the dialog that creates a new true/false attribute marking the parent who carried a pregnancy.',
  },
  currentPartnerLabel: {
    id: 'protocolBuilder.pedigree.currentPartnerLabel',
    defaultMessage: 'Current partner',
    description:
      'Label of the control choosing the true/false attribute that marks a partnership as current.',
  },
  currentPartnerHint: {
    id: 'protocolBuilder.pedigree.currentPartnerHint',
    defaultMessage:
      'A true/false attribute set on a partner relationship when the partnership is current. Nothing else in the protocol may write it.',
    description: 'Guidance under the current partner attribute control.',
  },
  currentPartnerCreateLabel: {
    id: 'protocolBuilder.pedigree.currentPartnerCreateLabel',
    defaultMessage: 'Create a new current partner attribute',
    description:
      'Title of the dialog that creates a new true/false attribute marking a current partnership.',
  },
  relationshipTypeChangeTitle: {
    id: 'protocolBuilder.pedigree.relationshipTypeChangeTitle',
    defaultMessage: 'Change the relationship edge type?',
    description:
      'Title of the confirmation shown before a researcher changes the edge type a Family Pedigree records relationships as, when relationship attributes are already chosen.',
  },
  relationshipTypeChangeDescription: {
    id: 'protocolBuilder.pedigree.relationshipTypeChangeDescription',
    defaultMessage:
      'The relationship kind, gestational carrier and current partner attributes belong to the current edge type, so changing it removes them.',
    description:
      'Body of the confirmation shown before a Family Pedigree’s relationship edge type changes, saying what the change discards.',
  },
  relationshipTypeChangeConfirm: {
    id: 'protocolBuilder.pedigree.relationshipTypeChangeConfirm',
    defaultMessage: 'Change the edge type',
    description:
      'Button that confirms changing a Family Pedigree’s relationship edge type and discarding the attributes chosen for the previous one.',
  },

  completenessTitle: {
    id: 'protocolBuilder.pedigree.completenessTitle',
    defaultMessage: 'Completeness',
    description:
      'Heading of the optional section where a researcher chooses how much of the family a Family Pedigree participant must record before they can continue.',
  },
  completenessDescription: {
    id: 'protocolBuilder.pedigree.completenessDescription',
    defaultMessage:
      'Require participants to record a minimum part of their family before they continue. Switched off, they can continue with whatever family they have drawn.',
    description:
      'Description of the completeness section. The participant is the person being interviewed.',
  },
  completenessWaiting: {
    id: 'protocolBuilder.pedigree.completenessWaiting',
    defaultMessage:
      'Choose the node type before choosing how complete the family must be.',
    description:
      'Shown in place of the completeness section’s description while no node type has been chosen for the stage.',
  },
  completenessScopeLabel: {
    id: 'protocolBuilder.pedigree.completenessScopeLabel',
    defaultMessage: 'Relatives to record',
    description:
      'Label of the control choosing which relatives of the participant must be recorded. Each choice includes the ones before it.',
  },
  completenessScopeHint: {
    id: 'protocolBuilder.pedigree.completenessScopeHint',
    defaultMessage:
      'Each choice includes the ones before it. A participant can satisfy siblings and children by saying they have none or do not know. Biological parents are the people who contributed the egg or sperm, so donors count.',
    description:
      'Guidance under the control choosing which relatives must be recorded. Biological parents are the genetic parents of a person; a gestational carrier who did not contribute the egg is not one.',
  },
  completenessScopeParents: {
    id: 'protocolBuilder.pedigree.completenessScopeParents',
    defaultMessage: 'Both biological parents',
    description:
      'Name of the least demanding completeness choice: the participant’s two biological parents must be recorded.',
  },
  completenessScopeParentsDescription: {
    id: 'protocolBuilder.pedigree.completenessScopeParentsDescription',
    defaultMessage:
      'Every person has two biological parents, so an unknown parent is still added to the family.',
    description:
      'Says what the both-biological-parents choice requires, and why an unknown parent is still recorded.',
  },
  completenessScopeFirstDegree: {
    id: 'protocolBuilder.pedigree.completenessScopeFirstDegree',
    defaultMessage: 'Parents, siblings and children',
    description:
      'Name of the completeness choice that requires the participant’s parents, siblings and children.',
  },
  completenessScopeFirstDegreeDescription: {
    id: 'protocolBuilder.pedigree.completenessScopeFirstDegreeDescription',
    defaultMessage: 'First-degree relatives.',
    description:
      'Says what the parents-siblings-and-children choice requires. First-degree relatives are a person’s parents, siblings and children.',
  },
  completenessScopeGrandparents: {
    id: 'protocolBuilder.pedigree.completenessScopeGrandparents',
    defaultMessage: 'Three generations',
    description:
      'Name of the completeness choice that requires three generations of the participant’s family: themselves, their parents and their grandparents.',
  },
  completenessScopeGrandparentsDescription: {
    id: 'protocolBuilder.pedigree.completenessScopeGrandparentsDescription',
    defaultMessage: 'Adds grandparents, and aunts and uncles on both sides.',
    description:
      'Says what the three-generations choice adds to first-degree relatives. Both sides means the mother’s and the father’s family.',
  },
  completenessScopeSecondDegree: {
    id: 'protocolBuilder.pedigree.completenessScopeSecondDegree',
    defaultMessage: 'All second-degree relatives',
    description:
      'Name of the completeness choice that requires every second-degree relative of the participant.',
  },
  completenessScopeSecondDegreeDescription: {
    id: 'protocolBuilder.pedigree.completenessScopeSecondDegreeDescription',
    defaultMessage: 'Adds nieces, nephews and grandchildren.',
    description:
      'Says what the all-second-degree-relatives choice adds to three generations.',
  },
  completenessScopeThirdDegree: {
    id: 'protocolBuilder.pedigree.completenessScopeThirdDegree',
    defaultMessage: 'Three generations, to first cousins',
    description:
      'Name of the most demanding completeness choice: three generations including the participant’s first cousins.',
  },
  completenessScopeThirdDegreeDescription: {
    id: 'protocolBuilder.pedigree.completenessScopeThirdDegreeDescription',
    defaultMessage:
      'Adds first cousins: the clinical three-generation pedigree.',
    description:
      'Says what the to-first-cousins choice adds. A clinical pedigree is the family tree health professionals draw to assess inherited conditions.',
  },
  completenessEnforcementLabel: {
    id: 'protocolBuilder.pedigree.completenessEnforcementLabel',
    defaultMessage: 'When the family is incomplete',
    description:
      'Label of the control choosing whether a participant may continue while the required relatives are not all recorded.',
  },
  completenessEnforcementRequired: {
    id: 'protocolBuilder.pedigree.completenessEnforcementRequired',
    defaultMessage: 'Required',
    description:
      'Name of the choice that stops a participant continuing until the required relatives are recorded.',
  },
  completenessEnforcementRequiredDescription: {
    id: 'protocolBuilder.pedigree.completenessEnforcementRequiredDescription',
    defaultMessage: 'Participants cannot continue until it is complete.',
    description:
      'Says what the required choice does. It refers to the family the participant has drawn.',
  },
  completenessEnforcementRecommended: {
    id: 'protocolBuilder.pedigree.completenessEnforcementRecommended',
    defaultMessage: 'Recommended',
    description:
      'Name of the choice that shows a participant what is missing but lets them continue.',
  },
  completenessEnforcementRecommendedDescription: {
    id: 'protocolBuilder.pedigree.completenessEnforcementRecommendedDescription',
    defaultMessage: 'Participants are shown what is missing but may continue.',
    description:
      'Says what the recommended choice does. It refers to the relatives the participant has not recorded.',
  },
  relativesNotRecordedLabel: {
    id: 'protocolBuilder.pedigree.relativesNotRecordedLabel',
    defaultMessage: 'Relatives not recorded',
    description:
      'Label of the control choosing the categorical attribute that holds a participant’s answers that a family member has no siblings or children, or that they do not know.',
  },
  relativesNotRecordedHint: {
    id: 'protocolBuilder.pedigree.relativesNotRecordedHint',
    defaultMessage:
      'Where “no siblings”, “no children” and “don’t know” answers are stored, on the person they are about. The interface sets the options this attribute offers, and nothing else in the protocol may write it.',
    description:
      'Guidance under the relatives-not-recorded attribute control. The options are a fixed list the interface owns.',
  },
  relativesNotRecordedCreateLabel: {
    id: 'protocolBuilder.pedigree.relativesNotRecordedCreateLabel',
    defaultMessage: 'Create a new relatives not recorded attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for relatives not recorded, seeded with the fixed options the interface owns.',
  },
  completenessClearTitle: {
    id: 'protocolBuilder.pedigree.completenessClearTitle',
    defaultMessage: 'Remove the completeness requirement?',
    description:
      'Title of the confirmation shown before a researcher switches off the requirement that a participant records a minimum part of their family.',
  },
  completenessClearDescription: {
    id: 'protocolBuilder.pedigree.completenessClearDescription',
    defaultMessage:
      'The relatives and enforcement you chose will be removed, and participants will be able to continue with any family they have drawn.',
    description:
      'Body of the confirmation shown before the completeness requirement is switched off, saying what is lost.',
  },
  completenessClearConfirm: {
    id: 'protocolBuilder.pedigree.completenessClearConfirm',
    defaultMessage: 'Remove the requirement',
    description:
      'Button that confirms switching off the completeness requirement and discarding it.',
  },

  promptTitle: {
    id: 'protocolBuilder.pedigree.promptTitle',
    defaultMessage: 'Prompt',
    description:
      'Heading of the section holding the instruction a Family Pedigree shows the participant while they draw their family.',
  },
  promptLabel: {
    id: 'protocolBuilder.pedigree.promptLabel',
    defaultMessage: 'Prompt text',
    description:
      'Label of the field holding the instruction shown to the participant on the pedigree canvas.',
  },
  promptHint: {
    id: 'protocolBuilder.pedigree.promptHint',
    defaultMessage:
      'Shown to the participant above the canvas while they draw their family. Invite them to add the people in their family, and tell them how, for example: “Let’s map out your family. Tap or click a person to add their details, and hover over them (or tap them) to add their relatives.”',
    description:
      'Guidance under the pedigree prompt field. The example is written as it would read to a participant, and may be translated freely.',
  },
  promptPlaceholder: {
    id: 'protocolBuilder.pedigree.promptPlaceholder',
    defaultMessage:
      'Let’s map out your family. Tap or click a person to add their details, and hover over them (or tap them) to add their relatives.',
    description:
      'Example shown inside the empty pedigree prompt field. Written as it would read to a participant.',
  },

  framingTitle: {
    id: 'protocolBuilder.pedigree.framingTitle',
    defaultMessage: 'Wording',
    description:
      'Heading of the section where a researcher chooses the words a Family Pedigree uses to describe family members, such as mother or egg parent.',
  },
  framingDescription: {
    id: 'protocolBuilder.pedigree.framingDescription',
    defaultMessage:
      'Choose the words participants read for the people in their family. This changes only what is shown. Nothing it produces is recorded in the data.',
    description:
      'Description of the wording section. The participant is the person being interviewed; the words are kinship words such as mother, sibling or egg parent.',
  },
  framingLabel: {
    id: 'protocolBuilder.pedigree.framingLabel',
    defaultMessage: 'Words for family members',
    description:
      'Label of the control choosing which words describe family members: everyday kinship words, egg and sperm parent words, or whichever the participant prefers.',
  },
  framingHint: {
    id: 'protocolBuilder.pedigree.framingHint',
    defaultMessage:
      'Everyday kinship words are used unless you choose otherwise.',
    description:
      'Guidance under the wording control, saying which choice applies when the researcher makes none.',
  },
  framingGenderedLabel: {
    id: 'protocolBuilder.pedigree.framingGenderedLabel',
    defaultMessage: 'Everyday kinship words',
    description:
      'Name of the wording choice that uses the usual kinship words, such as mother, sister and aunt.',
  },
  framingGenderedDescription: {
    id: 'protocolBuilder.pedigree.framingGenderedDescription',
    defaultMessage:
      'Mother, father, sister, brother, aunt and uncle. Each person’s words come from their gender identity when this stage asks about it, and from their sex assigned at birth when it does not.',
    description:
      'Says what the everyday kinship words choice does and where each person’s words come from. The stage can be set to ask each family member’s gender identity or not to ask it.',
  },
  framingGameteLabel: {
    id: 'protocolBuilder.pedigree.framingGameteLabel',
    defaultMessage: 'Egg parent and sperm parent',
    description:
      'Name of the wording choice that describes biological parents by the egg or sperm they gave, without gendered words.',
  },
  framingGameteDescription: {
    id: 'protocolBuilder.pedigree.framingGameteDescription',
    defaultMessage:
      'Biological parents are the egg parent and the sperm parent, and every other relative gets a neutral word such as grandparent, sibling or parent’s sibling.',
    description:
      'Says what the egg parent and sperm parent choice does. Biological parents are the people who gave the egg or the sperm.',
  },
  framingParticipantPreferenceLabel: {
    id: 'protocolBuilder.pedigree.framingParticipantPreferenceLabel',
    defaultMessage: 'Let the participant choose',
    description:
      'Name of the wording choice that asks the participant which of the other two sets of words they would like used.',
  },
  framingParticipantPreferenceDescription: {
    id: 'protocolBuilder.pedigree.framingParticipantPreferenceDescription',
    defaultMessage:
      'Participants choose between the two sets of words when they first reach the stage, and can change their choice at any time.',
    description:
      'Says what the let-the-participant-choose wording choice does. The two sets of words are everyday kinship words and egg parent and sperm parent words.',
  },

  nominationTitle: {
    id: 'protocolBuilder.pedigree.nominationTitle',
    defaultMessage: 'Nomination prompts',
    description:
      'Heading of the optional section listing the questions a Family Pedigree asks about the whole family once it is drawn, such as who has had a condition.',
  },
  nominationDescription: {
    id: 'protocolBuilder.pedigree.nominationDescription',
    defaultMessage:
      'Optionally ask questions about the whole family once it is drawn, such as “Who in your family has had heart disease?”. Participants answer each in turn by selecting everyone it applies to, and the interface sets a true/false attribute on them.',
    description:
      'Description of the nomination prompts section. A prompt is one question a participant is asked. Nominating means selecting the people a question applies to. An attribute is a codebook variable.',
  },
  nominationWaiting: {
    id: 'protocolBuilder.pedigree.nominationWaiting',
    defaultMessage:
      'Choose the node type before writing questions about the family.',
    description:
      'Shown in place of the nomination prompts section’s description while no node type has been chosen for the stage.',
  },
  nominationFieldLabel: {
    id: 'protocolBuilder.pedigree.nominationFieldLabel',
    defaultMessage: 'Nomination prompts',
    description:
      'Label of the ordered list of questions asked about the whole family. The same words as the section heading, translated once for each: the heading names the part of the stage and this names the control.',
  },
  nominationListHint: {
    id: 'protocolBuilder.pedigree.nominationListHint',
    defaultMessage:
      'Participants see these in order, after they have drawn their family. Drag prompts to reorder them.',
    description:
      'Guidance under the list of nomination prompts. The prompts are questions about the whole family.',
  },
  nominationAddLabel: {
    id: 'protocolBuilder.pedigree.nominationAddLabel',
    defaultMessage: 'Create new nomination prompt',
    description:
      'Button that opens the dialog for writing one more question about the whole family. Whole rather than a generic “Add”, because a stage editor shows several lists at once.',
  },
  nominationAddTitle: {
    id: 'protocolBuilder.pedigree.nominationAddTitle',
    defaultMessage: 'Create nomination prompt',
    description:
      'Title of the dialog a researcher fills in to write one more question about the whole family.',
  },
  nominationEditTitle: {
    id: 'protocolBuilder.pedigree.nominationEditTitle',
    defaultMessage: 'Edit nomination prompt',
    description:
      'Title of the dialog a researcher fills in to change a question about the whole family they have already written.',
  },
  nominationItemNoun: {
    id: 'protocolBuilder.pedigree.nominationItemNoun',
    defaultMessage: 'nomination prompt',
    description:
      'What one row of the nomination prompt list is called inside things said ABOUT it — “Edit nomination prompt”, “Delete this nomination prompt?” — so it is lower case and singular.',
  },
  nominationEmptyState: {
    id: 'protocolBuilder.pedigree.nominationEmptyState',
    defaultMessage:
      'No nomination prompts yet. Create one to ask about the whole family.',
    description:
      'Shown in place of the nomination prompt list while the stage asks nothing about the whole family.',
  },
  nominationRowDescription: {
    id: 'protocolBuilder.pedigree.nominationRowDescription',
    defaultMessage:
      'Write the question, then choose the attribute that records who the participant selects.',
    description:
      'Description under the title of the dialog for one nomination prompt. An attribute is a codebook variable.',
  },
  nominationTextPlaceholder: {
    id: 'protocolBuilder.pedigree.nominationTextPlaceholder',
    defaultMessage: 'Who in your family has had heart disease?',
    description:
      'Example shown inside the empty box where a researcher writes a nomination prompt. Written as it would read to a participant.',
  },
  nominationTextHint: {
    id: 'protocolBuilder.pedigree.nominationTextHint',
    defaultMessage:
      'Phrase it so the participant can select everyone it applies to.',
    description:
      'Guidance under the box where a researcher writes a nomination prompt, saying how the participant answers it: by selecting the people it applies to.',
  },
  nominationVariableLabel: {
    id: 'protocolBuilder.pedigree.nominationVariableLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the control choosing the true/false attribute a nomination prompt sets on the people the participant selects.',
  },
  nominationVariableHint: {
    id: 'protocolBuilder.pedigree.nominationVariableHint',
    defaultMessage:
      'A true/false attribute the interface sets to true on everyone the participant selects.',
    description:
      'Guidance under the attribute control of a nomination prompt. An attribute is a codebook variable.',
  },
  nominationVariableEmpty: {
    id: 'protocolBuilder.pedigree.nominationVariableEmpty',
    defaultMessage:
      'This type has no true/false attributes yet. Create one to record who the participant selects.',
    description:
      'Shown in place of the attribute picker’s options when the person node type has no attribute holding true or false.',
  },
  nominationVariableRequired: {
    id: 'protocolBuilder.pedigree.nominationVariableRequired',
    defaultMessage: 'Choose the attribute that records who is selected.',
    description:
      'Refusal shown when a researcher saves a nomination prompt without choosing the attribute set on the people the participant selects.',
  },
  nominationVariableCreateLabel: {
    id: 'protocolBuilder.pedigree.nominationVariableCreateLabel',
    defaultMessage: 'Create a new nomination attribute',
    description:
      'Title of the dialog that creates a new true/false attribute for a nomination prompt to set on the people the participant selects.',
  },
  nominationVariableGoneRefusal: {
    id: 'protocolBuilder.pedigree.nominationVariableGoneRefusal',
    defaultMessage:
      'This attribute can no longer record a nomination prompt. Choose another one.',
    description:
      'Refusal shown when a researcher saves a nomination prompt whose attribute has been deleted from the codebook or is no longer a true/false attribute.',
  },
  nominationSexLabel: {
    id: 'protocolBuilder.pedigree.nominationSexLabel',
    defaultMessage: 'Who can be selected',
    description:
      'Label of the control choosing whether a nomination prompt is open to anyone or only to people assigned one sex at birth.',
  },
  nominationSexHint: {
    id: 'protocolBuilder.pedigree.nominationSexHint',
    defaultMessage:
      'Limit the question to one sex assigned at birth for a condition only those people can have. People recorded as the other sex cannot be selected. Anyone else can, including people whose sex assigned at birth is intersex, unknown or not recorded.',
    description:
      'Guidance under the control limiting a nomination prompt by sex assigned at birth, saying who is left out and who is not. The limit is for a condition only people of one sex can have, such as ovarian or prostate cancer.',
  },
  nominationSexAnyone: {
    id: 'protocolBuilder.pedigree.nominationSexAnyone',
    defaultMessage: 'Anyone',
    description:
      'Choice for a nomination prompt that places no limit on who can be selected.',
  },
  nominationSexFemale: {
    id: 'protocolBuilder.pedigree.nominationSexFemale',
    defaultMessage: 'Only people assigned female at birth',
    description:
      'Choice for a nomination prompt that only people whose sex assigned at birth is female can be selected for.',
  },
  nominationSexMale: {
    id: 'protocolBuilder.pedigree.nominationSexMale',
    defaultMessage: 'Only people assigned male at birth',
    description:
      'Choice for a nomination prompt that only people whose sex assigned at birth is male can be selected for.',
  },

  personFormTitle: {
    id: 'protocolBuilder.pedigree.personFormTitle',
    defaultMessage: 'Additional person fields',
    description:
      'Heading of the section holding the extra questions a Family Pedigree asks about each family member, after its own questions.',
  },
  personFormDescription: {
    id: 'protocolBuilder.pedigree.personFormDescription',
    defaultMessage:
      'Optionally ask more about each family member. These fields are shown in the side panel after the interface’s own questions: the name, sex assigned at birth and, when it is asked, gender identity.',
    description:
      'Description of the additional person fields section. The side panel is where the participant describes each person they add. Gender identity is asked only when the stage is set to ask it.',
  },
  personFormFieldLabel: {
    id: 'protocolBuilder.pedigree.personFormFieldLabel',
    defaultMessage: 'Form fields',
    description:
      'Label of the ordered list of extra questions asked about each family member.',
  },
  personFormAddLabel: {
    id: 'protocolBuilder.pedigree.personFormAddLabel',
    defaultMessage: 'Create new person field',
    description:
      'Button that opens the dialog for adding one more question about each family member.',
  },
  personFormEmptyState: {
    id: 'protocolBuilder.pedigree.personFormEmptyState',
    defaultMessage:
      'No fields yet. Create one to ask something more about each family member.',
    description:
      'Shown in place of the additional person fields list while it asks nothing yet.',
  },
  personFormClearTitle: {
    id: 'protocolBuilder.pedigree.personFormClearTitle',
    defaultMessage: 'Remove the additional person fields?',
    description:
      'Title of the confirmation shown before a researcher switches off the extra questions a Family Pedigree asks about each family member.',
  },
  personFormClearDescription: {
    id: 'protocolBuilder.pedigree.personFormClearDescription',
    defaultMessage:
      'Every field you have added will be removed, and participants will only be asked the interface’s own questions about each family member.',
    description:
      'Body of the confirmation shown before the additional person fields are switched off, saying what is lost.',
  },
  personFormClearConfirm: {
    id: 'protocolBuilder.pedigree.personFormClearConfirm',
    defaultMessage: 'Remove the fields',
    description:
      'Button that confirms switching off the additional person fields and discarding them.',
  },
  personFormReservedRefusal: {
    id: 'protocolBuilder.pedigree.personFormReservedRefusal',
    defaultMessage:
      'The interface already records this attribute itself, as one of its person attributes or as the answer to a nomination prompt, so these fields cannot collect it as well. Choose another attribute, or remove the field.',
    description:
      'Refusal shown when an additional person field collects an attribute already chosen as one of the Family Pedigree’s own person attributes (name, gender identity, sex assigned at birth or participant marker) or as the attribute a nomination prompt sets.',
  },
});
