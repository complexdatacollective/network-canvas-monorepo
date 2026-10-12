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
  symbolsLabel: {
    id: 'protocolBuilder.pedigree.symbolsLabel',
    defaultMessage: 'Symbols',
    description:
      'Label of the choice, at the end of the person attributes section, of what sets the symbol (circle, square or diamond) each family member is drawn with on the family tree.',
  },
  symbolsHint: {
    id: 'protocolBuilder.pedigree.symbolsHint',
    defaultMessage:
      'A person’s symbol comes from the shape of the person type in the codebook. Choosing an option changes that shape straight away, not when you save this stage, and changes how people of this type are drawn throughout the interview.',
    description:
      'Guidance under the symbols choice. The shape is the Shape setting, with its mapping from an attribute, in the node appearance group of the codebook’s node type editor. The change is written to the codebook at once, so it is not undone by cancelling the stage, and it applies on every stage that draws this node type.',
  },
  symbolsNoSource: {
    id: 'protocolBuilder.pedigree.symbolsNoSource',
    defaultMessage:
      'Choose the sex assigned at birth or gender identity attribute above to draw symbols from it.',
    description:
      'Shown under the symbols choice while neither attribute it can draw symbols from has been chosen in the controls above it.',
  },
  symbolsGenderIdentityOutOfDate: {
    id: 'protocolBuilder.pedigree.symbolsGenderIdentityOutOfDate',
    defaultMessage:
      'Gender identity’s options or kinship words have changed since the symbols were set.',
    description:
      'Note under the symbols choice while it draws symbols from gender identity but the gender identity options, or the kinship words chosen for them, have changed since. A small Update symbols action follows it.',
  },
  symbolsUpdateGenderIdentity: {
    id: 'protocolBuilder.pedigree.symbolsUpdateGenderIdentity',
    defaultMessage: 'Update symbols',
    description:
      'Link-style action in the out-of-date note that draws the symbols again from the gender identity options and kinship words as they are now.',
  },
  symbolsSexAssignedAtBirthLabel: {
    id: 'protocolBuilder.pedigree.symbolsSexAssignedAtBirthLabel',
    defaultMessage: 'Sex assigned at birth',
    description:
      'Option of the symbols choice that draws each family member’s symbol from their sex assigned at birth, the standard way family trees are drawn.',
  },
  symbolsSexAssignedAtBirthDescription: {
    id: 'protocolBuilder.pedigree.symbolsSexAssignedAtBirthDescription',
    defaultMessage:
      'A circle for female, a square for male, and a diamond for everyone else.',
    description:
      'Description of the sex assigned at birth option of the symbols choice, saying which symbol each answer gets. Everyone else includes people whose sex assigned at birth is not recorded.',
  },
  symbolsGenderIdentityLabel: {
    id: 'protocolBuilder.pedigree.symbolsGenderIdentityLabel',
    defaultMessage: 'Gender identity',
    description:
      'Option of the symbols choice that draws each family member’s symbol from their gender identity, through the kinship words chosen for each gender identity option.',
  },
  symbolsGenderIdentityDescription: {
    id: 'protocolBuilder.pedigree.symbolsGenderIdentityDescription',
    defaultMessage:
      'A circle for options with feminine words, a square for masculine words, and a diamond for everyone else.',
    description:
      'Description of the gender identity option of the symbols choice. Feminine words are kinship words such as mother, masculine words such as father. Everyone else includes options with neutral or not-known words and people whose gender identity is not recorded.',
  },
  symbolsCodebookLabel: {
    id: 'protocolBuilder.pedigree.symbolsCodebookLabel',
    defaultMessage: 'Set in the codebook',
    description:
      'Option of the symbols choice that leaves the symbols to the shape setting of the person type in the codebook. Its description says what that setting draws.',
  },
  symbolsNotMapped: {
    id: 'protocolBuilder.pedigree.symbolsNotMapped',
    defaultMessage:
      '{shape, select, circle {Everyone is drawn as a circle.} square {Everyone is drawn as a square.} other {Everyone is drawn as a diamond.}}',
    description:
      'Description of the set-in-the-codebook option of the symbols choice when the codebook draws every family member with the same symbol, or will once the option is chosen. shape is the stored shape name: circle, square, or diamond (the other branch).',
  },
  symbolsCustomSexAssignedAtBirth: {
    id: 'protocolBuilder.pedigree.symbolsCustomSexAssignedAtBirth',
    defaultMessage:
      'Follows sex assigned at birth, with shapes set differently in the codebook.',
    description:
      'Description of the set-in-the-codebook option of the symbols choice when the codebook draws symbols from sex assigned at birth with a mapping someone set by hand, rather than the standard circle, square and diamond.',
  },
  symbolsCustomGenderIdentity: {
    id: 'protocolBuilder.pedigree.symbolsCustomGenderIdentity',
    defaultMessage:
      'Follows gender identity, with shapes set differently in the codebook.',
    description:
      'Description of the set-in-the-codebook option of the symbols choice when the codebook draws symbols from gender identity with a mapping someone set by hand, rather than the standard circle, square and diamond.',
  },
  symbolsOther: {
    id: 'protocolBuilder.pedigree.symbolsOther',
    defaultMessage:
      'Follows the attribute {attributeName}, set in the codebook.',
    description:
      'Description of the set-in-the-codebook option of the symbols choice when the codebook draws symbols from an attribute that is neither of this stage’s sex assigned at birth or gender identity attributes. attributeName is that attribute’s name as the researcher gave it.',
  },
  symbolsReplaceTitle: {
    id: 'protocolBuilder.pedigree.symbolsReplaceTitle',
    defaultMessage: 'Replace the symbols set in the codebook?',
    description:
      'Title of the confirmation shown before a symbol button overwrites a shape mapping someone set by hand in the codebook.',
  },
  symbolsReplaceDescription: {
    id: 'protocolBuilder.pedigree.symbolsReplaceDescription',
    defaultMessage:
      'The shapes chosen for this person type in the codebook will be replaced, wherever people of this type are drawn in the interview.',
    description:
      'Body of the confirmation shown before a symbol button overwrites a shape mapping someone set by hand in the codebook, saying what is lost.',
  },
  symbolsReplaceConfirm: {
    id: 'protocolBuilder.pedigree.symbolsReplaceConfirm',
    defaultMessage: 'Replace symbols',
    description:
      'Button that confirms overwriting the shape mapping set by hand in the codebook.',
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
      'Each person’s name, typed by the participant in the side panel. A name may be left blank: when the participant leaves this stage, anyone unnamed is given a label from their relationship to the participant, such as “Maternal aunt” or “Sister (partner of Tom)”. The participant is not asked their own name and is shown as “You”. The attribute’s validation rules apply to names the participant types.',
    description:
      'Guidance under the name attribute control. The side panel is where the participant describes each family member. The two labels in quotation marks are examples of what the interview generates for an unnamed person, and are translated like the rest of the sentence; Tom is a person’s name. “You” is how the interview labels the participant in their family tree.',
  },
  namePromptLabel: {
    id: 'protocolBuilder.pedigree.namePromptLabel',
    defaultMessage: 'Name question',
    description:
      'Label of the box holding the words above the name box in the side panel, where the participant types a family member’s name.',
  },
  namePromptHint: {
    id: 'protocolBuilder.pedigree.namePromptHint',
    defaultMessage:
      'Shown above the box where participants type a family member’s name. It starts with wording Network Canvas supplies, which you can change.',
    description:
      'Guidance under the name-question box. The question starts with supplied wording in each of the protocol’s languages that Network Canvas has it in.',
  },
  nameHintTextLabel: {
    id: 'protocolBuilder.pedigree.nameHintTextLabel',
    defaultMessage: 'Name question guidance',
    description:
      'Label of the box holding the guidance shown under the name box in the side panel.',
  },
  nameHintTextHint: {
    id: 'protocolBuilder.pedigree.nameHintTextHint',
    defaultMessage:
      'Shown under the name box, for example to say that a nickname will do. Leave it empty to show nothing.',
    description: 'Guidance under the name-question guidance box.',
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
      'When off, the question isn’t asked, and words such as mother or brother follow each person’s sex assigned at birth.',
    description:
      'Explains what happens when the gender identity question is switched off: it is not asked, and the kinship words (mother, brother, parent) follow the sex a person was assigned at birth instead. Female takes feminine words, male masculine words, and anyone else, or no answer, neutral words.',
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
      'The attribute and the words you chose for each option will be removed from this stage, and words such as mother or brother will follow each person’s sex assigned at birth. The attribute and its options stay in the codebook.',
    description:
      'Body of the confirmation shown before the gender identity question is switched off, saying what is lost and what is kept. An attribute is a codebook variable. The kinship words (mother, brother, parent) follow the sex a person was assigned at birth instead.',
  },
  genderIdentityClearConfirm: {
    id: 'protocolBuilder.pedigree.genderIdentityClearConfirm',
    defaultMessage: 'Stop asking',
    description:
      'Button that confirms switching off the gender identity question and discarding the attribute and words chosen for it.',
  },
  relationshipToParticipantTitle: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantTitle',
    defaultMessage: 'Record each person’s relationship to the participant',
    description:
      'Title of the switch, and of the part of the person attributes section it opens, that makes a Family Pedigree save each family member’s relationship to the participant (parent, sibling, cousin…) as an attribute. Off by default.',
  },
  relationshipToParticipantDescription: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantDescription',
    defaultMessage:
      'Saves how each person is related to the participant, such as parent, sibling or cousin, so that later stages can filter or skip on it. The interview works it out from the family the participant draws; it is never asked.',
    description:
      'Explains what recording the relationship to the participant does. A filter or skip logic in a later stage can only test a person’s own attributes, which is why the relationship is saved as one. It is updated every time the participant leaves the stage.',
  },
  relationshipToParticipantClearTitle: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantClearTitle',
    defaultMessage: 'Stop recording relationships to the participant?',
    description:
      'Title of the confirmation shown before a researcher switches off recording each family member’s relationship to the participant.',
  },
  relationshipToParticipantClearDescription: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantClearDescription',
    defaultMessage:
      'The attribute will be removed from this stage, and the interview will stop updating it. The attribute stays in the codebook, and any filter or skip logic that uses it will no longer find new relationships.',
    description:
      'Body of the confirmation shown before recording the relationship to the participant is switched off, saying what changes. An attribute is a codebook variable.',
  },
  relationshipToParticipantClearConfirm: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantClearConfirm',
    defaultMessage: 'Stop recording',
    description:
      'Button that confirms switching off recording the relationship to the participant.',
  },
  relationshipToParticipantLabel: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantLabel',
    defaultMessage: 'Relationship to the participant',
    description:
      'Label of the control choosing the categorical attribute that holds each family member’s relationship to the participant.',
  },
  relationshipToParticipantHint: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantHint',
    defaultMessage:
      'The interface sets this attribute’s options: parent, sibling, cousin and so on, naming neither gender nor side of the family. Everyone connected to the participant is given one; the participant is not. To show a later stage only first-degree biological relatives, for example, filter on parent, donor, sibling, child and donor-conceived child.',
    description:
      'Guidance under the relationship-to-the-participant attribute control. The option values are fixed by the interface; their labels can be translated in the codebook. Donor-conceived child is a child conceived with the person as a gamete donor.',
  },
  relationshipToParticipantCreateLabel: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantCreateLabel',
    defaultMessage: 'Create a new relationship to the participant attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for each family member’s relationship to the participant, with the options the interface sets.',
  },
  relationshipToParticipantOption: {
    id: 'protocolBuilder.pedigree.relationshipToParticipantOption',
    defaultMessage:
      '{value, select, parent {Parent} adoptiveParent {Adoptive parent} stepParent {Step-parent} donor {Donor} surrogate {Surrogate} child {Child} adoptiveChild {Adoptive child} stepChild {Stepchild} donorConceivedChild {Donor-conceived child} surrogacyChild {Child born through surrogacy} sibling {Sibling} halfSibling {Half-sibling} adoptiveSibling {Adoptive sibling} stepSibling {Step-sibling} partner {Partner} formerPartner {Former partner} grandparent {Grandparent} greatGrandparent {Great-grandparent} stepGrandparent {Step-grandparent} grandchild {Grandchild} greatGrandchild {Great-grandchild} adoptiveGrandchild {Adoptive grandchild} parentsSibling {Parent’s sibling} grandparentsSibling {Grandparent’s sibling} siblingsChild {Sibling’s child} cousin {Cousin} parentInLaw {Parent-in-law} siblingInLaw {Sibling-in-law} childInLaw {Child-in-law} other {Other relative}}',
    description:
      'Default label of one option of a new relationship-to-the-participant attribute: how a family member is related to the participant, in words that name neither gender nor side of the family. The label is written into the protocol as participant-facing text, and researchers can change it. parent, child and sibling are biological; donor is an egg or sperm donor; surrogate carried the pregnancy without giving a gamete; donorConceivedChild is a child conceived with the participant as a donor; surrogacyChild is a child the participant carried as a surrogate; adoptiveSibling is related through adoption only; stepParent is a step or social parent; stepGrandparent is a grandparent’s partner or a step-parent’s parent; adoptiveGrandchild is a grandchild related only through an adoption.',
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
      'This stage decides the words each option takes, so the options can only be edited from a Family Pedigree stage that uses this attribute. Elsewhere in Architect they are read-only.',
    description:
      'Explains why the button that edits the gender identity options is on this stage: the options belong to the stage because it decides which kinship words each one takes, so no other part of the app can change them. A Family Pedigree stage is the interview step this page configures. Architect is the name of the app.',
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
      'Records each person’s gender identity. Set its options, and the words each one takes, below.',
    description:
      'Guidance under the gender identity attribute control. The options are the researcher’s own, and are edited and given kinship words in the controls that follow, which appear once an attribute is chosen.',
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
      'Label of the read-only table showing, for each option of the gender identity attribute, the kinship words used for a person who has it, such as mother or father.',
  },
  genderTermsHint: {
    id: 'protocolBuilder.pedigree.genderTermsHint',
    defaultMessage:
      'A family member without a name is shown by a kinship word such as mother, brother or aunt. These are the words each gender identity takes. Change them, and the options, with Edit options. An option with neutral words is called a parent, sibling or child. These words are used when the wording is everyday kinship words.',
    description:
      'Guidance over the read-only table showing the kinship words each gender identity option takes. Edit options is the label of the button below it, which opens the dialog where the options and their words are edited together. Neutral words are the ones that do not depend on gender. Everyday kinship words is a choice in the Wording section. A family member is shown by their name when they have one, so the words are only used for people without a name.',
  },
  genderWordsOptionField: {
    id: 'protocolBuilder.pedigree.genderWordsOptionField',
    defaultMessage: 'Option {index} kinship words',
    description:
      'Label of the control, on one option’s row in the gender identity options dialog, choosing which kinship words (mother, father, parent) a person with that gender identity takes. index is the option’s position in the list, counting from one, and is passed as text because the researcher reads it as this row’s name.',
  },
  genderWordsSummaryOptionHeader: {
    id: 'protocolBuilder.pedigree.genderWordsSummaryOptionHeader',
    defaultMessage: 'Option',
    description:
      'Column heading over the gender identity options, in the read-only table on the stage showing which kinship words each option takes.',
  },
  genderWordsSummaryWordsHeader: {
    id: 'protocolBuilder.pedigree.genderWordsSummaryWordsHeader',
    defaultMessage: 'Kinship words',
    description:
      'Column heading over the kinship words (mother, father, parent) each gender identity option takes, in the read-only table on the stage.',
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
    defaultMessage:
      'Not known (neutral words; biological mother or father for a biological parent)',
    description:
      'Choice for the kinship words a gender identity option takes, for an option meaning the person’s gender is not known. Every relative gets neutral words, such as parent or sibling, except a biological parent whose sex assigned at birth is known, who is called biological mother or biological father.',
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
      'The interface uses this to name biological parents and donors, to work out who could have carried a pregnancy, to check that a child’s two biological parents are possible, to choose everyday kinship words when gender identity is not asked, and to limit a nomination question to one sex assigned at birth. The interface sets this attribute’s options, and they cannot be changed.',
    description:
      'Guidance under the sex assigned at birth attribute control, saying why the interface needs it. The options are a fixed list the interface owns. Kinship words are the family words (mother, brother, parent). A nomination question is one question asked of the whole family, such as who has had a condition.',
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
      'Label of the control choosing the boolean attribute that marks which family member is the participant.',
  },
  egoHint: {
    id: 'protocolBuilder.pedigree.egoHint',
    defaultMessage:
      'The interface sets this boolean attribute to true on the participant’s own person, and leaves it blank on everyone else. Use it in a stage filter to keep the participant out of later stages, such as a name generator or sociogram of their relatives, or to tell them apart in exports and analysis. Because it is blank rather than false for everyone else, filter on “is not” true to leave the participant out.',
    description:
      'Guidance under the participant marker attribute control. A stage filter is the set of rules, in the stage’s Stage filter section, that decide which nodes a stage shows. A name generator and a sociogram are kinds of interview stage. “is not” is the name of a rule operator in the stage filter, written exactly as it appears there.',
  },
  egoCreateLabel: {
    id: 'protocolBuilder.pedigree.egoCreateLabel',
    defaultMessage: 'Create a new participant marker attribute',
    description:
      'Title of the dialog that creates a new boolean attribute marking the participant.',
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
      'Records whether a relationship is a partnership or which kind of parent one person is to the other. The interface sets the options this attribute offers.',
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
      'Label of the control choosing the boolean attribute that marks the parent who carried a pregnancy.',
  },
  gestationalCarrierHint: {
    id: 'protocolBuilder.pedigree.gestationalCarrierHint',
    defaultMessage:
      'True on the parent relationship of whoever carried the pregnancy (a surrogate, or a biological parent who did), and false on every other parent relationship.',
    description:
      'Guidance under the gestational carrier attribute control. A parent relationship is the connection between a parent and their child. The attribute is not set on partnerships.',
  },
  gestationalCarrierCreateLabel: {
    id: 'protocolBuilder.pedigree.gestationalCarrierCreateLabel',
    defaultMessage: 'Create a new gestational carrier attribute',
    description:
      'Title of the dialog that creates a new boolean attribute marking the parent who carried a pregnancy.',
  },
  currentPartnerLabel: {
    id: 'protocolBuilder.pedigree.currentPartnerLabel',
    defaultMessage: 'Current partner',
    description:
      'Label of the control choosing the boolean attribute that marks a partnership as current.',
  },
  currentPartnerHint: {
    id: 'protocolBuilder.pedigree.currentPartnerHint',
    defaultMessage:
      'True when a partnership is current, and false when it has ended.',
    description:
      'Guidance under the current partner attribute control. It is set on every partnership, and on nothing else.',
  },
  currentPartnerCreateLabel: {
    id: 'protocolBuilder.pedigree.currentPartnerCreateLabel',
    defaultMessage: 'Create a new current partner attribute',
    description:
      'Title of the dialog that creates a new boolean attribute marking a current partnership.',
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
      'The relationship kind, gestational carrier and current partner attributes belong to the current edge type, so changing it clears those choices. The attributes stay in the codebook.',
    description:
      'Body of the confirmation shown before a Family Pedigree’s relationship edge type changes, saying what the change discards from this stage and what it leaves. The codebook is the protocol’s definition of what an interview records.',
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
      'Check that participants have recorded a minimum part of their family, and every required detail about each person, before they continue. Switched off, they can continue with whatever they have drawn.',
    description:
      'Description of the completeness section. The participant is the person being interviewed. The required details are sex assigned at birth, gender identity when the stage asks it, and any additional person field the codebook marks as required. Whether the participant may continue without them is the enforcement choice below.',
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
      'Each choice includes the ones before it. Only biological relatives count, so an adopted child does not satisfy “children”. Biological parents are the people who gave the egg or sperm, so donors count. A participant can account for siblings and children by saying they have none or do not know.',
    description:
      'Guidance under the control choosing which relatives must be recorded. Biological parents are the genetic parents of a person; a gestational carrier who did not contribute the egg is not one. Adoptive and step relatives do not count. Siblings, in this setting, are people who share a biological parent.',
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
    defaultMessage:
      'First-degree relatives, and the other biological parent of each of the participant’s biological children.',
    description:
      'Says what the parents-siblings-and-children choice requires. First-degree relatives are a person’s parents, siblings and children. The other biological parent of a child is the person who gave the egg or sperm the participant did not; their own family is not required.',
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
    defaultMessage:
      'Participants cannot continue until the required relatives and details are recorded.',
    description:
      'Says what the required choice does. The required relatives are the ones chosen above, and the required details are about each person in the family the participant has drawn.',
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
      'Where “no siblings”, “no children” and “don’t know” answers are stored, on the person they are about. The interface sets the options this attribute offers.',
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
      'The relatives, the enforcement, the relatives-not-recorded attribute and the wording of the list will be removed from this stage, and participants will be able to continue with any family they have drawn.',
    description:
      'Body of the confirmation shown before the completeness requirement is switched off, saying what is lost.',
  },
  trackerTextTitle: {
    id: 'protocolBuilder.pedigree.trackerTextTitle',
    defaultMessage: 'What the list says',
    description:
      'Heading of the group of boxes holding the words of the list showing participants what is still needed in their family, and of the side panel’s questions about brothers, sisters and children.',
  },
  trackerTextDescription: {
    id: 'protocolBuilder.pedigree.trackerTextDescription',
    defaultMessage:
      'The words participants read in the list of what is still needed, and in the side panel’s questions about brothers, sisters and children. They start with wording Network Canvas supplies, which you can change. Each can read differently when it is about the participant and when it is about someone else.',
    description:
      'Description of the list-wording group. The wording starts with supplied text in each of the protocol’s languages that Network Canvas has it in.',
  },
  trackerParentsLabel: {
    id: 'protocolBuilder.pedigree.trackerParentsLabel',
    defaultMessage: 'Missing parents',
    description:
      'Label of the box holding the list item that asks for a person’s missing parents.',
  },
  trackerParentsHint: {
    id: 'protocolBuilder.pedigree.trackerParentsHint',
    defaultMessage:
      'Asks for the parents of a person who has none recorded. It can show their name.',
    description: 'Guidance under the missing-parents list item box.',
  },
  trackerSiblingsLabel: {
    id: 'protocolBuilder.pedigree.trackerSiblingsLabel',
    defaultMessage: 'Brothers and sisters',
    description:
      'Label of the box holding the list item that asks for a person’s brothers and sisters.',
  },
  trackerSiblingsHint: {
    id: 'protocolBuilder.pedigree.trackerSiblingsHint',
    defaultMessage:
      'Asks for a person’s brothers and sisters, or for an answer that they have none.',
    description: 'Guidance under the brothers-and-sisters list item box.',
  },
  trackerNoSiblingsLabel: {
    id: 'protocolBuilder.pedigree.trackerNoSiblingsLabel',
    defaultMessage: 'No brothers or sisters',
    description:
      'Label of the box holding the words of the button that answers that a person has no brothers or sisters.',
  },
  trackerNoSiblingsHint: {
    id: 'protocolBuilder.pedigree.trackerNoSiblingsHint',
    defaultMessage:
      'The button under that item that answers that the person has none.',
    description:
      'Guidance under the no-brothers-or-sisters button box. “That item” is the brothers-and-sisters list item above it.',
  },
  trackerSiblingsQuestionLabel: {
    id: 'protocolBuilder.pedigree.trackerSiblingsQuestionLabel',
    defaultMessage: 'Question about brothers and sisters',
    description:
      'Label of the box holding the question the side panel asks about a person’s brothers and sisters.',
  },
  trackerSiblingsQuestionHint: {
    id: 'protocolBuilder.pedigree.trackerSiblingsQuestionHint',
    defaultMessage:
      'Asked in the side panel while a person’s brothers and sisters are still needed.',
    description: 'Guidance under the brothers-and-sisters question box.',
  },
  trackerChildrenLabel: {
    id: 'protocolBuilder.pedigree.trackerChildrenLabel',
    defaultMessage: 'Children',
    description:
      'Label of the box holding the list item that asks for a person’s children.',
  },
  trackerChildrenHint: {
    id: 'protocolBuilder.pedigree.trackerChildrenHint',
    defaultMessage:
      'Asks for a person’s children, or for an answer that they have none.',
    description: 'Guidance under the children list item box.',
  },
  trackerNoChildrenLabel: {
    id: 'protocolBuilder.pedigree.trackerNoChildrenLabel',
    defaultMessage: 'No children',
    description:
      'Label of the box holding the words of the button that answers that a person has no children.',
  },
  trackerNoChildrenHint: {
    id: 'protocolBuilder.pedigree.trackerNoChildrenHint',
    defaultMessage:
      'The button under that item that answers that the person has none.',
    description:
      'Guidance under the no-children button box. “That item” is the children list item above it.',
  },
  trackerChildrenQuestionLabel: {
    id: 'protocolBuilder.pedigree.trackerChildrenQuestionLabel',
    defaultMessage: 'Question about children',
    description:
      'Label of the box holding the question the side panel asks about a person’s children.',
  },
  trackerChildrenQuestionHint: {
    id: 'protocolBuilder.pedigree.trackerChildrenQuestionHint',
    defaultMessage:
      'Asked in the side panel while a person’s children are still needed.',
    description: 'Guidance under the children question box.',
  },
  trackerDetailsLabel: {
    id: 'protocolBuilder.pedigree.trackerDetailsLabel',
    defaultMessage: 'Missing details',
    description:
      'Label of the box holding the list item that asks for details still missing about a person, such as their sex assigned at birth.',
  },
  trackerDetailsHint: {
    id: 'protocolBuilder.pedigree.trackerDetailsHint',
    defaultMessage: 'Asks for details still missing about a person.',
    description: 'Guidance under the missing-details list item box.',
  },
  trackerRecommendedNoteLabel: {
    id: 'protocolBuilder.pedigree.trackerRecommendedNoteLabel',
    defaultMessage: 'Note under a recommended list',
    description:
      'Label of the box holding the note shown under the list when participants may continue without completing it.',
  },
  trackerRecommendedNoteHint: {
    id: 'protocolBuilder.pedigree.trackerRecommendedNoteHint',
    defaultMessage:
      'Shown under the list when participants may continue without completing it.',
    description: 'Guidance under the recommended-list note box.',
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
      'Choose the kinship words used for family members the participant hasn’t named. Named people are shown by name. This changes only what participants read, and adds nothing to the exported data.',
    description:
      'Description of the wording section. The participant is the person being interviewed; the words are kinship words such as mother, sibling or egg parent. A family member the participant has not given a name to is shown by their kinship to the participant instead. The participant themselves is always shown as “You”.',
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
      'Words such as mother, father, sister, brother, aunt and uncle. A person’s words come from their gender identity when this stage asks about it, and from their sex assigned at birth when it does not.',
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
      'A biological parent is called the egg parent or the sperm parent, going by their sex assigned at birth, and a parent whose sex is neither female nor male is called a parent. Every other relative gets a neutral word such as grandparent, sibling or parent’s sibling.',
    description:
      'Says what the egg parent and sperm parent choice does. Biological parents are the people who gave the egg or the sperm. The egg parent is the one whose sex assigned at birth is female and the sperm parent the one whose sex assigned at birth is male; a biological parent with any other answer, or none, is called a parent.',
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
      'Optionally ask questions about the whole family once it is drawn, such as “Who in your family has had heart disease?”. Participants answer each in turn by selecting everyone it applies to, and the interface sets a boolean attribute on them.',
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
      'Label of the control choosing the boolean attribute a nomination prompt sets on the people the participant selects.',
  },
  nominationVariableHint: {
    id: 'protocolBuilder.pedigree.nominationVariableHint',
    defaultMessage:
      'A boolean attribute. The interface sets it to true on everyone the participant selects, and to false on anyone they select and then deselect. Everyone else is left blank.',
    description:
      'Guidance under the attribute control of a nomination prompt. An attribute is a codebook variable. Selecting a person a second time deselects them.',
  },
  nominationVariableEmpty: {
    id: 'protocolBuilder.pedigree.nominationVariableEmpty',
    defaultMessage:
      'This type has no boolean attributes yet. Create one to record who the participant selects.',
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
      'Title of the dialog that creates a new boolean attribute for a nomination prompt to set on the people the participant selects.',
  },
  nominationVariableGoneRefusal: {
    id: 'protocolBuilder.pedigree.nominationVariableGoneRefusal',
    defaultMessage:
      'This attribute can no longer record a nomination prompt. Choose another one.',
    description:
      'Refusal shown when a researcher saves a nomination prompt whose attribute has been deleted from the codebook or is no longer a boolean attribute.',
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
      'Use this for a condition that only people of one sex can have. People recorded as the other sex assigned at birth cannot be selected. Everyone else can, including people whose sex assigned at birth is intersex, don’t know, prefer not to say or not yet answered.',
    description:
      'Guidance under the control limiting a nomination prompt by sex assigned at birth, saying who is left out and who is not. The limit is for a condition only people of one sex can have, such as ovarian or prostate cancer. The listed answers are the options of the sex assigned at birth question, and not yet answered means the participant has not answered it for that person.',
  },
  nominationSexAnyone: {
    id: 'protocolBuilder.pedigree.nominationSexAnyone',
    defaultMessage: 'Anyone',
    description:
      'Choice for a nomination prompt that places no limit on who can be selected.',
  },
  nominationSexFemale: {
    id: 'protocolBuilder.pedigree.nominationSexFemale',
    defaultMessage: 'Anyone except people assigned male at birth',
    description:
      'Choice for a nomination prompt that leaves out only the people whose sex assigned at birth is male. People whose sex assigned at birth is female, intersex, not known, not given or not yet answered can still be selected.',
  },
  nominationSexMale: {
    id: 'protocolBuilder.pedigree.nominationSexMale',
    defaultMessage: 'Anyone except people assigned female at birth',
    description:
      'Choice for a nomination prompt that leaves out only the people whose sex assigned at birth is female. People whose sex assigned at birth is male, intersex, not known, not given or not yet answered can still be selected.',
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
      'Optionally ask more about each family member. These questions come last in the side panel, after the interface’s own questions about the person and how they are related.',
    description:
      'Description of the additional person fields section. The side panel is where the participant describes each person they add. The interface’s own questions are the person’s name, gender identity (when the stage asks it) and sex assigned at birth, and then how the person is related to others in the family.',
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
  dependentStagesTitle: {
    id: 'protocolBuilder.pedigree.dependentStagesTitle',
    defaultMessage: 'Other stages read this pedigree',
    description:
      'Title of the warning shown above the node type control when other stages of the same protocol draw their network from this pedigree.',
  },
  dependentStagesDescription: {
    id: 'protocolBuilder.pedigree.dependentStagesDescription',
    defaultMessage:
      "These stages visualize this pedigree's network and map their own attributes onto its node type: {stageNames}. Changing the node type here will leave them pointing at attributes the new type does not have.",
    description:
      'Body of the warning about other stages that read this pedigree. stageNames is the list of those stages’ names, each in quotation marks, already joined into one phrase in the reader’s language.',
  },
  dependentStagesBlockReason: {
    id: 'protocolBuilder.pedigree.dependentStagesBlockReason',
    defaultMessage:
      '{stageCount, plural, one {{stageNames} reads this pedigree and maps its own attributes onto this node type, so the node type cannot be changed here. Change or remove that stage first.} other {{stageNames} read this pedigree and map their own attributes onto this node type, so the node type cannot be changed here. Change or remove those stages first.}}',
    description:
      'Shown when a researcher tries to change the node type of a pedigree that another stage of the protocol reads, and the change is refused. stageCount is how many such stages there are; stageNames is their names, each in quotation marks, already joined into one phrase in the reader’s language.',
  },
  personFormReservedRefusal: {
    id: 'protocolBuilder.pedigree.personFormReservedRefusal',
    defaultMessage:
      'The interface already records this attribute itself, so these fields cannot collect it as well. Choose another attribute, or remove the field.',
    description:
      'Refusal shown when an additional person field collects an attribute already chosen as one of the Family Pedigree’s own person attributes (name, gender identity, sex assigned at birth, participant marker or relationship to the participant) or as the attribute a nomination prompt sets.',
  },
  wordingPointerTool: {
    id: 'protocolBuilder.pedigree.wording.pointerTool',
    defaultMessage: 'Pointer tool button',
    description:
      'Label of the button that selects and moves people on the family tree.',
  },
  wordingConnectTool: {
    id: 'protocolBuilder.pedigree.wording.connectTool',
    defaultMessage: 'Connect tool button',
    description:
      'Label of the button that connects two people on the family tree.',
  },
  wordingDisconnectTool: {
    id: 'protocolBuilder.pedigree.wording.disconnectTool',
    defaultMessage: 'Disconnect tool button',
    description:
      'Label of the button that removes a connection between two people on the family tree.',
  },
  wordingConnectHint: {
    id: 'protocolBuilder.pedigree.wording.connectHint',
    defaultMessage: 'Connect hint',
    description:
      'Label of the hint shown while the participant chooses the first person to connect.',
  },
  wordingDisconnectHint: {
    id: 'protocolBuilder.pedigree.wording.disconnectHint',
    defaultMessage: 'Disconnect hint',
    description:
      'Label of the hint shown while the participant chooses a connection to remove.',
  },
  wordingFramingChoiceTitle: {
    id: 'protocolBuilder.pedigree.wording.framingChoiceTitle',
    defaultMessage: 'Wording question',
    description:
      'Label of the question asking which words to use for family members. Shown only when participants choose the words.',
  },
  wordingFramingChoiceDescription: {
    id: 'protocolBuilder.pedigree.wording.framingChoiceDescription',
    defaultMessage: 'Wording question explanation',
    description:
      'Label of the explanation under the question asking which words to use for family members.',
  },
  wordingFramingControlLabel: {
    id: 'protocolBuilder.pedigree.wording.framingControlLabel',
    defaultMessage: 'Wording control label',
    description:
      'Label of the control that lets the participant change the words used for family members.',
  },
  wordingPlaceholderParentsNote: {
    id: 'protocolBuilder.pedigree.wording.placeholderParentsNote',
    defaultMessage: 'Note about added parents',
    description:
      'Label of the note explaining the placeholder parents added for a set of siblings, and which of them a new sibling shares.',
  },
  wordingGeneratedLabelOf: {
    id: 'protocolBuilder.pedigree.wording.generatedLabelOf',
    defaultMessage: 'Label for a relative',
    description:
      'Label of a family member, named by how they relate to the participant.',
  },
  wordingRelativeTerm: {
    id: 'protocolBuilder.pedigree.wording.relativeTerm',
    defaultMessage: 'Relative terms',
    description:
      'Label of the words for each kind of relative, shown in place of their relationship.',
  },
  wordingYou: {
    id: 'protocolBuilder.pedigree.wording.you',
    defaultMessage: 'Participant’s own name',
    description:
      'Label of the words shown for the participant when they appear as a family member.',
  },
  wordingSave: {
    id: 'protocolBuilder.pedigree.wording.save',
    defaultMessage: 'Save button',
    description: 'Label of the button that saves a family member’s details.',
  },
  wordingDontKnow: {
    id: 'protocolBuilder.pedigree.wording.dontKnow',
    defaultMessage: 'Don’t know option',
    description:
      'Label of the option a participant picks when they do not know an answer.',
  },
  wordingMissingDetailsList: {
    id: 'protocolBuilder.pedigree.wording.missingDetailsList',
    defaultMessage: 'Missing details notice',
    description:
      'Label of the notice listing what details are still missing for a family member.',
  },
  wordingNominationLimitHint: {
    id: 'protocolBuilder.pedigree.wording.nominationLimitHint',
    defaultMessage: 'Note on a question limited to one sex at birth',
    description:
      'Label of the note shown under the family tree while a question about the family applies only to people of one sex assigned at birth, saying who cannot be selected for it.',
  },
  wordingConnectQuestion: {
    id: 'protocolBuilder.pedigree.wording.connectQuestion',
    defaultMessage: 'Connect question',
    description: 'Label of the question asking how two people are related.',
  },
  wordingConnectParent: {
    id: 'protocolBuilder.pedigree.wording.connectParent',
    defaultMessage: 'Parent connection',
    description: 'Label of the sentence describing a parent connection.',
  },
  wordingConnectPartners: {
    id: 'protocolBuilder.pedigree.wording.connectPartners',
    defaultMessage: 'Partner connection',
    description:
      'Label of the sentence describing a partnership, whether current or past.',
  },
  wordingDisconnectConfirmTitle: {
    id: 'protocolBuilder.pedigree.wording.disconnectConfirmTitle',
    defaultMessage: 'Remove connection question',
    description:
      'Label of the question asking whether to remove a connection between two people.',
  },
  wordingDisconnectConfirmDescription: {
    id: 'protocolBuilder.pedigree.wording.disconnectConfirmDescription',
    defaultMessage: 'Remove connection explanation',
    description:
      'Label of the explanation that both people stay in the family tree when a connection is removed.',
  },
  wordingDisconnectWouldCutOff: {
    id: 'protocolBuilder.pedigree.wording.disconnectWouldCutOff',
    defaultMessage: 'Connection that would leave someone out',
    description:
      'Label of the warning that removing a connection would leave people outside the family tree.',
  },
  wordingDisconnectStandIn: {
    id: 'protocolBuilder.pedigree.wording.disconnectStandIn',
    defaultMessage: 'Stand-in parent connection notice',
    description:
      'Label of the notice that a connection cannot be removed because an unnamed parent stands in for a parent of the child who has not been added yet.',
  },
  wordingRemoveConfirmTitle: {
    id: 'protocolBuilder.pedigree.wording.removeConfirmTitle',
    defaultMessage: 'Remove person question',
    description:
      'Label of the question asking whether to remove a family member.',
  },
  wordingRemoveConfirmDescription: {
    id: 'protocolBuilder.pedigree.wording.removeConfirmDescription',
    defaultMessage: 'Remove person explanation',
    description:
      'Label of the explanation of what removing a family member also removes.',
  },
  wordingStillTogetherLabel: {
    id: 'protocolBuilder.pedigree.wording.stillTogetherLabel',
    defaultMessage: 'Still together question',
    description:
      'Label of the question asking whether a partnership is still ongoing.',
  },
  wordingPanelTitle: {
    id: 'protocolBuilder.pedigree.wording.panelTitle',
    defaultMessage: 'Panel title',
    description:
      'Label of the title of the side panel for a family member being added or edited.',
  },
  wordingParentKindLabel: {
    id: 'protocolBuilder.pedigree.wording.parentKindLabel',
    defaultMessage: 'Kind of parent question',
    description:
      'Label of the question asking what kind of parent a person is.',
  },
  wordingBiologicalParentLabel: {
    id: 'protocolBuilder.pedigree.wording.biologicalParentLabel',
    defaultMessage: 'Biological parent question',
    description:
      'Label of the question asking which parent is the child’s biological parent.',
  },
  wordingBiologicalParentHint: {
    id: 'protocolBuilder.pedigree.wording.biologicalParentHint',
    defaultMessage: 'Biological parent hint',
    description:
      'Label of the hint explaining that a parent who is not biological is added as a step or social parent.',
  },
  wordingBiologicalParentBoth: {
    id: 'protocolBuilder.pedigree.wording.biologicalParentBoth',
    defaultMessage: 'Both biological parents option',
    description:
      'Label of the option that both parents are biological parents. The two names are filled in.',
  },
  wordingCarrierLabel: {
    id: 'protocolBuilder.pedigree.wording.carrierLabel',
    defaultMessage: 'Carrier question',
    description: 'Label of the question asking who carried the pregnancy.',
  },
  wordingCarrierUnknown: {
    id: 'protocolBuilder.pedigree.wording.carrierUnknown',
    defaultMessage: 'Other or unknown carrier option',
    description:
      'Label of the option for someone else, or for not knowing who carried the pregnancy.',
  },
  wordingOtherParentLabel: {
    id: 'protocolBuilder.pedigree.wording.otherParentLabel',
    defaultMessage: 'Other parent question',
    description:
      'Label of the question asking who the child’s other parent is.',
  },
  wordingOtherParentNone: {
    id: 'protocolBuilder.pedigree.wording.otherParentNone',
    defaultMessage: 'No other parent option',
    description: 'Label of the option that the child has no other parent.',
  },
  wordingOtherParentUnknown: {
    id: 'protocolBuilder.pedigree.wording.otherParentUnknown',
    defaultMessage: 'Other parent not shown option',
    description:
      'Label of the option for an other parent who is not yet shown on the family tree.',
  },
  wordingOtherParentBiologicalLabel: {
    id: 'protocolBuilder.pedigree.wording.otherParentBiologicalLabel',
    defaultMessage: 'Other parent is biological question',
    description:
      'Label of the yes or no question asking whether the other parent of a new step-child or adopted child is the child’s biological parent.',
  },
  wordingParentPartnerLabel: {
    id: 'protocolBuilder.pedigree.wording.parentPartnerLabel',
    defaultMessage: 'Parent partner question',
    description:
      'Label of the question asking whether a parent is the partner of another parent.',
  },
  wordingParentLinkKindLabel: {
    id: 'protocolBuilder.pedigree.wording.parentLinkKindLabel',
    defaultMessage: 'Kind of relationship question',
    description:
      'Label of the question asking how a person is related to another person in the family.',
  },
  wordingParentCarriedLabel: {
    id: 'protocolBuilder.pedigree.wording.parentCarriedLabel',
    defaultMessage: 'Carried the pregnancy question',
    description:
      'Label of the question asking whether a parent carried the pregnancy.',
  },
  wordingSharedParentCountLabel: {
    id: 'protocolBuilder.pedigree.wording.sharedParentCountLabel',
    defaultMessage: 'Shared parents question',
    description:
      'Label of the question asking which parents a person shares with the participant or with another person.',
  },
  wordingSharedParentCountBoth: {
    id: 'protocolBuilder.pedigree.wording.sharedParentCountBoth',
    defaultMessage: 'Both shared parents option',
    description: 'Label of the option that both parents are shared.',
  },
  wordingSharedParentEggOnly: {
    id: 'protocolBuilder.pedigree.wording.sharedParentEggOnly',
    defaultMessage: 'One shared parent option',
    description:
      'Label of the option that only one of the shared parents is shared. The parent’s kind is filled in.',
  },
  wordingSiblingKindLabel: {
    id: 'protocolBuilder.pedigree.wording.siblingKindLabel',
    defaultMessage: 'Shared parents of siblings question',
    description:
      'Label of the question asking which parents a person shares with their siblings.',
  },
  wordingCarriedSiblingsPregnancyLabel: {
    id: 'protocolBuilder.pedigree.wording.carriedSiblingsPregnancyLabel',
    defaultMessage: 'Siblings’ pregnancy question',
    description:
      'Label of the question asking whether each sibling’s parent carried the pregnancy with them.',
  },
  wordingChildKindLabel: {
    id: 'protocolBuilder.pedigree.wording.childKindLabel',
    defaultMessage: 'Kind of child question',
    description: 'Label of the question asking what kind of child a person is.',
  },
  wordingChildKindBiological: {
    id: 'protocolBuilder.pedigree.wording.childKindBiological',
    defaultMessage: 'Biological child option',
    description: 'Label of the option for a biological child.',
  },
  wordingChildKindAdoptive: {
    id: 'protocolBuilder.pedigree.wording.childKindAdoptive',
    defaultMessage: 'Adopted child option',
    description: 'Label of the option for an adopted child.',
  },
  wordingChildKindSocial: {
    id: 'protocolBuilder.pedigree.wording.childKindSocial',
    defaultMessage: 'Step or other raised child option',
    description:
      'Label of the option for a step-child or another child the participant raises.',
  },
  wordingAlsoParentOfLabel: {
    id: 'protocolBuilder.pedigree.wording.alsoParentOfLabel',
    defaultMessage: 'Also parent of question',
    description:
      'Label of the question asking whether a person is also the parent of another person.',
  },
  wordingStandInPlaceTaken: {
    id: 'protocolBuilder.pedigree.wording.standInPlaceTaken',
    defaultMessage: 'Also parent of hint: takes an unnamed parent’s place',
    description:
      'Label of the hint under the also-parent-of question when a new biological parent or donor takes the place of an unnamed parent, naming the siblings who share that parent and so become this person’s children too.',
  },
  wordingSexAssignedAtBirthLabel: {
    id: 'protocolBuilder.pedigree.wording.sexAssignedAtBirthLabel',
    defaultMessage: 'Sex assigned at birth question',
    description:
      'Label of the question asking a family member’s sex assigned at birth.',
  },
  wordingGenderIdentityLabel: {
    id: 'protocolBuilder.pedigree.wording.genderIdentityLabel',
    defaultMessage: 'Gender identity question',
    description:
      'Label of the gender identity question. Shown only when the interface asks about gender identity.',
  },
  wordingChangeWouldCutOff: {
    id: 'protocolBuilder.pedigree.wording.changeWouldCutOff',
    defaultMessage: 'Change that would leave someone out',
    description:
      'Label of the warning that a change, or a new connection, would leave people outside the family tree, so is not made.',
  },
  wordingChildKindDonor: {
    id: 'protocolBuilder.pedigree.wording.childKindDonor',
    defaultMessage: 'Child from a donation option',
    description:
      'Label of the option for a child conceived with an egg or sperm the person donated.',
  },
  wordingChildKindSurrogate: {
    id: 'protocolBuilder.pedigree.wording.childKindSurrogate',
    defaultMessage: 'Child carried as a surrogate option',
    description:
      'Label of the option for a child the person carried as a surrogate.',
  },
  wordingParentKindCarrier: {
    id: 'protocolBuilder.pedigree.wording.parentKindCarrier',
    defaultMessage: 'Parent who carried the pregnancy',
    description:
      'Label of the option for a parent of any kind who carried the pregnancy. The kind of parent is filled in.',
  },
  wordingSharedDonorsLabel: {
    id: 'protocolBuilder.pedigree.wording.sharedDonorsLabel',
    defaultMessage: 'Shared donors question',
    description:
      'Label of the question asking which donors a new sibling shares, for someone with only egg or sperm donors as parents, and whether they share the surrogate who carried them where one is recorded.',
  },
  wordingSharedSurrogateLabel: {
    id: 'protocolBuilder.pedigree.wording.sharedSurrogateLabel',
    defaultMessage: 'Shared surrogate question',
    description:
      'Label of the question asking whether the surrogate who carried a person with no parents recorded yet also carried a new sibling.',
  },
  wordingSharedParentsNotSibling: {
    id: 'protocolBuilder.pedigree.wording.sharedParentsNotSibling',
    defaultMessage: 'Shared parents that do not make a sibling',
    description:
      'Label of the error shown when the only parents chosen for a new sibling are a step or social parent, or the surrogate who carried the person, which does not make someone a sibling.',
  },
  wordingSiblingBiologicalParentLabel: {
    id: 'protocolBuilder.pedigree.wording.siblingBiologicalParentLabel',
    defaultMessage: 'Sibling’s biological parent question',
    description:
      'Label of the question asking which of the parents a new sibling shares is their biological parent, when only one of them could be.',
  },
  wordingSiblingOtherBiologicalParentLabel: {
    id: 'protocolBuilder.pedigree.wording.siblingOtherBiologicalParentLabel',
    defaultMessage: 'Sibling’s other biological parent question',
    description:
      'Label of the question asking which of the parents a new biological sibling shares is their other biological parent, when the first answer still leaves more than one.',
  },
  wordingSiblingTwinLabel: {
    id: 'protocolBuilder.pedigree.wording.siblingTwinLabel',
    defaultMessage: 'Twin question',
    description:
      'Label of the question asking whether a new sibling is a twin of the person they are added to.',
  },
  wordingSiblingTwinHint: {
    id: 'protocolBuilder.pedigree.wording.siblingTwinHint',
    defaultMessage: 'Twin question hint',
    description:
      'Label of the hint under the question asking whether a new sibling is a twin.',
  },
  wordingSiblingTwinNo: {
    id: 'protocolBuilder.pedigree.wording.siblingTwinNo',
    defaultMessage: 'Not a twin option',
    description: 'Label of the option that a new sibling is not a twin.',
  },
  wordingSiblingTwinIdentical: {
    id: 'protocolBuilder.pedigree.wording.siblingTwinIdentical',
    defaultMessage: 'Identical twin option',
    description: 'Label of the option that a new sibling is an identical twin.',
  },
  wordingSiblingTwinFraternal: {
    id: 'protocolBuilder.pedigree.wording.siblingTwinFraternal',
    defaultMessage: 'Fraternal twin option',
    description: 'Label of the option that a new sibling is a fraternal twin.',
  },
  wordingSiblingTwinUnknown: {
    id: 'protocolBuilder.pedigree.wording.siblingTwinUnknown',
    defaultMessage: 'Twin, not known if identical, option',
    description:
      'Label of the option that a new sibling is a twin, without knowing whether they are identical.',
  },
  wordingTwinsLabel: {
    id: 'protocolBuilder.pedigree.wording.twinsLabel',
    defaultMessage: 'Twins question',
    description:
      'Label of the question in a family member’s panel asking which of their siblings are their twins.',
  },
  wordingTwinsHint: {
    id: 'protocolBuilder.pedigree.wording.twinsHint',
    defaultMessage: 'Twins hint',
    description:
      'Label of the hint under the question asking which siblings are twins.',
  },
  wordingTwinZygosityLabel: {
    id: 'protocolBuilder.pedigree.wording.twinZygosityLabel',
    defaultMessage: 'Identical twins question',
    description:
      'Label of the question asking whether two twins are identical.',
  },
  wordingZygosityIdentical: {
    id: 'protocolBuilder.pedigree.wording.zygosityIdentical',
    defaultMessage: 'Identical option',
    description: 'Label of the option that two twins are identical.',
  },
  wordingZygosityFraternal: {
    id: 'protocolBuilder.pedigree.wording.zygosityFraternal',
    defaultMessage: 'Fraternal option',
    description: 'Label of the option that two twins are fraternal.',
  },
  wordingZygosityUnknown: {
    id: 'protocolBuilder.pedigree.wording.zygosityUnknown',
    defaultMessage: 'Not known if identical option',
    description:
      'Label of the option that the participant does not know whether two twins are identical.',
  },
  wordingUnavailableAncestor: {
    id: 'protocolBuilder.pedigree.wording.unavailableAncestor',
    defaultMessage: 'Unavailable choice: own ancestor',
    description:
      'Label of the reason shown under the choice to make someone a parent of one of their own ancestors.',
  },
  wordingUnavailableCarrierRecorded: {
    id: 'protocolBuilder.pedigree.wording.unavailableCarrierRecorded',
    defaultMessage: 'Unavailable answers hint: someone else carried',
    description:
      'Label of the hint explaining that answers are unavailable because someone else is recorded as having carried the pregnancy.',
  },
  wordingUnavailableCannotCarry: {
    id: 'protocolBuilder.pedigree.wording.unavailableCannotCarry',
    defaultMessage: 'Unavailable answers hint: cannot have carried',
    description:
      'Label of the hint explaining that answers are unavailable because the person is recorded as male at birth, so cannot have carried a pregnancy.',
  },
  wordingUnavailableCarried: {
    id: 'protocolBuilder.pedigree.wording.unavailableCarried',
    defaultMessage: 'Unavailable answers hint: carried a child',
    description:
      'Label of the hint explaining that a sex at birth is unavailable because the person is recorded as having carried the pregnancy of one or more children.',
  },
  wordingUnavailableSameSexAsCoParent: {
    id: 'protocolBuilder.pedigree.wording.unavailableSameSexAsCoParent',
    defaultMessage:
      'Unavailable answers hint: other genetic parent has that sex at birth',
    description:
      'Label of the hint explaining that a sex at birth is unavailable for a genetic parent because the other genetic parent of their children is recorded with that sex at birth.',
  },
  wordingUnavailableGeneticParentsFull: {
    id: 'protocolBuilder.pedigree.wording.unavailableGeneticParentsFull',
    defaultMessage: 'Unavailable answers hint: two genetic parents',
    description:
      'Label of the hint explaining that answers are unavailable because the child already has two genetic parents recorded.',
  },
  wordingUnavailableSameSexGeneticParent: {
    id: 'protocolBuilder.pedigree.wording.unavailableSameSexGeneticParent',
    defaultMessage:
      'Unavailable answers hint: same sex at birth as the other genetic parent',
    description:
      'Label of the hint explaining that answers are unavailable because the child’s other genetic parent is recorded with the same sex at birth.',
  },
  wordingUnavailableBothSameSex: {
    id: 'protocolBuilder.pedigree.wording.unavailableBothSameSex',
    defaultMessage:
      'Unavailable answers hint: both parents the same sex at birth',
    description:
      'Label of the hint explaining that both parents cannot be a new child’s genetic parents because they are recorded with the same sex at birth.',
  },
  wordingUnavailableIdenticalTwin: {
    id: 'protocolBuilder.pedigree.wording.unavailableIdenticalTwin',
    defaultMessage: 'Unavailable answers hint: twins’ parents differ',
    description:
      'Label of the hint explaining that two twins cannot be recorded as identical because their biological parents and donors differ.',
  },
  wordingUnavailableIdenticalTwinNew: {
    id: 'protocolBuilder.pedigree.wording.unavailableIdenticalTwinNew',
    defaultMessage: 'Unavailable answers hint: new twin’s parents differ',
    description:
      'Label of the hint explaining that a new sibling cannot be an identical twin because they would not have all the same biological parents and donors.',
  },
  wordingTitle: {
    id: 'protocolBuilder.pedigree.wording.title',
    defaultMessage: 'Participant wording',
    description:
      'Heading of the section holding the words the participant sees on this stage.',
  },
  wordingDescription: {
    id: 'protocolBuilder.pedigree.wording.description',
    defaultMessage:
      'The words the interface shows the participant while they draw their family, in the order they meet them. Each starts with Network Canvas’s wording in each language the protocol has, and you can change it.',
    description: 'Description of the participant wording section.',
  },
  wordingDrawingTitle: {
    id: 'protocolBuilder.pedigree.wording.drawingTitle',
    defaultMessage: 'Drawing the family',
    description:
      'Heading of the group of words shown while the participant draws their family on the canvas.',
  },
  wordingConnectingTitle: {
    id: 'protocolBuilder.pedigree.wording.connectingTitle',
    defaultMessage: 'Connecting people',
    description:
      'Heading of the group of words shown while the participant connects and removes people.',
  },
  wordingAddingTitle: {
    id: 'protocolBuilder.pedigree.wording.addingTitle',
    defaultMessage: 'Adding a family member',
    description:
      'Heading of the group of words shown in the side panel for a family member the participant adds or edits.',
  },
  wordingChoosesFramingHint: {
    id: 'protocolBuilder.pedigree.wording.choosesFramingHint',
    defaultMessage:
      'Shown only when participants choose the words used for family members.',
    description:
      'Hint on the wording settings that are shown only when participants choose the words used for family members.',
  },
  wordingLimitsNominationBySexHint: {
    id: 'protocolBuilder.pedigree.wording.limitsNominationBySexHint',
    defaultMessage:
      'Shown only when a question about the family applies only to people of one sex assigned at birth.',
    description:
      'Hint on the wording setting that is shown only while a nomination prompt is limited to people of one sex assigned at birth.',
  },
  wordingGenderIdentityHint: {
    id: 'protocolBuilder.pedigree.wording.genderIdentityHint',
    defaultMessage: 'Shown only when the interface asks about gender identity.',
    description:
      'Hint on the gender identity wording setting, which is shown only when the interface asks about gender identity.',
  },
});
