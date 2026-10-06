import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  canvasLabel: {
    id: 'interview.familyPedigree.canvasLabel',
    defaultMessage: 'Your family',
    description:
      'Accessible name for the area showing the family members the participant has added, drawn as a family tree.',
  },
  you: {
    id: 'interview.familyPedigree.you',
    defaultMessage: 'You',
    description:
      'Label shown beneath the participant’s own symbol in their family tree.',
  },
  relativeTerm: {
    id: 'interview.familyPedigree.relativeTerm',
    defaultMessage:
      "{term, select, mother {Mother} father {Father} parent {Parent} eggParent {Egg parent} spermParent {Sperm parent} biologicalMother {Bio\u00ADlogical mother} biologicalFather {Bio\u00ADlogical father} adoptiveMother {Adoptive mother} adoptiveFather {Adoptive father} adoptiveParent {Adoptive parent} stepmother {Stepmother} stepfather {Stepfather} stepparent {Step-parent} eggDonor {Egg donor} spermDonor {Sperm donor} donor {Donor} surrogate {Surrogate} daughter {Daughter} son {Son} child {Child} stepdaughter {Stepdaughter} stepson {Stepson} stepchild {Stepchild} donorConceivedChild {Donor-conceived child} surrogacyChild {Child born through surrogacy} sister {Sister} brother {Brother} sibling {Sibling} halfSister {Half-sister} halfBrother {Half-brother} halfSibling {Half-sibling} stepsister {Stepsister} stepbrother {Stepbrother} stepsibling {Step-sibling} partner {Partner} formerPartner {Former partner} grandmother {Grandmother} grandfather {Grandfather} grandparent {Grandparent} maternalGrandmother {Maternal grandmother} maternalGrandfather {Maternal grandfather} maternalGrandparent {Maternal grandparent} paternalGrandmother {Paternal grandmother} paternalGrandfather {Paternal grandfather} paternalGrandparent {Paternal grandparent} greatGrandmother {Great-grandmother} greatGrandfather {Great-grandfather} greatGrandparent {Great-grandparent} granddaughter {Granddaughter} grandson {Grandson} grandchild {Grandchild} greatGranddaughter {Great-granddaughter} greatGrandson {Great-grandson} greatGrandchild {Great-grandchild} aunt {Aunt} uncle {Uncle} maternalAunt {Maternal aunt} maternalUncle {Maternal uncle} paternalAunt {Paternal aunt} paternalUncle {Paternal uncle} parentsSibling {Parent's sibling} greatAunt {Great-aunt} greatUncle {Great-uncle} grandparentsSibling {Grandparent's sibling} niece {Niece} nephew {Nephew} siblingsChild {Sibling's child} cousin {Cousin} motherInLaw {Mother-in-law} fatherInLaw {Father-in-law} parentInLaw {Parent-in-law} sisterInLaw {Sister-in-law} brotherInLaw {Brother-in-law} siblingInLaw {Sibling-in-law} daughterInLaw {Daughter-in-law} sonInLaw {Son-in-law} childInLaw {Child-in-law} other {Relative}}",
    description:
      'Label for a family member whose name is not known: their kinship to the participant (for example, the participant’s maternal grandmother). Depending on the study, either gendered words (mother, aunt) or words that do not assume gender (egg parent, parent’s sibling) are used. Display only; nothing here is saved as research data. Labels sit inside a small circle, so a long word carries a soft hyphen (U+00AD) where it may break; add one to long words in your language.',
  },
  relativeOf: {
    id: 'interview.familyPedigree.relativeOf',
    defaultMessage:
      "{owner}'s {term, select, mother {mother} father {father} parent {parent} eggParent {egg parent} spermParent {sperm parent} biologicalMother {bio\u00ADlogical mother} biologicalFather {bio\u00ADlogical father} adoptiveMother {adoptive mother} adoptiveFather {adoptive father} adoptiveParent {adoptive parent} stepmother {stepmother} stepfather {stepfather} stepparent {step-parent} eggDonor {egg donor} spermDonor {sperm donor} donor {donor} surrogate {surrogate} daughter {daughter} son {son} child {child} stepdaughter {stepdaughter} stepson {stepson} stepchild {stepchild} donorConceivedChild {donor-conceived child} surrogacyChild {child born through surrogacy} sister {sister} brother {brother} sibling {sibling} halfSister {half-sister} halfBrother {half-brother} halfSibling {half-sibling} stepsister {stepsister} stepbrother {stepbrother} stepsibling {step-sibling} partner {partner} formerPartner {former partner} other {relative}}",
    description:
      'Label for a family member whose name is not known and who has no everyday kinship word, described through a relative of theirs: owner is that relative’s label (for example “Cousin”), and term is how this person is related to them. Translate the possessive grammar as a whole; owner stays verbatim. Display only.',
  },
  numberedRelative: {
    id: 'interview.familyPedigree.numberedRelative',
    defaultMessage: '{label} {number, number}',
    description:
      'Tells apart several family members who would otherwise share a label (for example two unnamed children). label is the already translated label; number is their position in the order they were added.',
  },
  familyMember: {
    id: 'interview.familyPedigree.familyMember',
    defaultMessage: 'Family member',
    description:
      'Label for a family member whose name is not known and who is not connected to the participant in the family tree.',
  },
  personAccessibleName: {
    id: 'interview.familyPedigree.personAccessibleName',
    defaultMessage:
      '{isYou, select, true {You} other {{name}}}{missing, select, true {, some details missing} other {}}',
    description:
      'Accessible name of a family member’s symbol in the family tree. {name} is the person’s name or, when it is not known, how they are related to the participant. The second part is read out when required details about the person have not been given yet.',
  },
  missingDetails: {
    id: 'interview.familyPedigree.missingDetails',
    defaultMessage: 'Some details are missing',
    description:
      'Tooltip on the warning icon next to a family member whose required details have not been given yet.',
  },
  missingDetailsList: {
    id: 'interview.familyPedigree.missingDetailsList',
    defaultMessage: 'Some details are missing: {details}.',
    description:
      'Notice at the top of the panel showing a family member’s details. {details} is a list of the questions not yet answered, e.g. “Name and Gender identity”.',
  },
  actionsLabel: {
    id: 'interview.familyPedigree.actionsLabel',
    defaultMessage:
      '{isYou, select, true {Add your relatives} other {Add relatives of {name}}}',
    description:
      'Accessible name of the group of buttons that appears around a selected family member, used to add their parent, sibling, partner or child.',
  },
  addParent: {
    id: 'interview.familyPedigree.addParent',
    defaultMessage: 'Parent',
    description:
      'Short button label next to a selected family member: adds a parent of that person.',
  },
  addSibling: {
    id: 'interview.familyPedigree.addSibling',
    defaultMessage: 'Sibling',
    description:
      'Short button label next to a selected family member: adds a brother, sister or sibling of that person.',
  },
  addPartner: {
    id: 'interview.familyPedigree.addPartner',
    defaultMessage: 'Partner',
    description:
      'Short button label next to a selected family member: adds a partner (spouse or romantic partner, current or former) of that person.',
  },
  addChild: {
    id: 'interview.familyPedigree.addChild',
    defaultMessage: 'Child',
    description:
      'Short button label next to a selected family member: adds a child of that person.',
  },
  addParentTitle: {
    id: 'interview.familyPedigree.addParentTitle',
    defaultMessage:
      '{isYou, select, true {Add your parent} other {Add a parent of {name}}}',
    description:
      'Title of the side panel used to add a parent of a family member. {name} is that family member’s name or “Unnamed”.',
  },
  addSiblingTitle: {
    id: 'interview.familyPedigree.addSiblingTitle',
    defaultMessage:
      '{isYou, select, true {Add your sibling} other {Add a sibling of {name}}}',
    description:
      'Title of the side panel used to add a sibling of a family member. {name} is that family member’s name or “Unnamed”.',
  },
  addPartnerTitle: {
    id: 'interview.familyPedigree.addPartnerTitle',
    defaultMessage:
      '{isYou, select, true {Add your partner} other {Add a partner of {name}}}',
    description:
      'Title of the side panel used to add a partner of a family member. {name} is that family member’s name or “Unnamed”.',
  },
  addChildTitle: {
    id: 'interview.familyPedigree.addChildTitle',
    defaultMessage:
      '{isYou, select, true {Add your child} other {Add a child of {name}}}',
    description:
      'Title of the side panel used to add a child of a family member. {name} is that family member’s name or “Unnamed”.',
  },
  editTitle: {
    id: 'interview.familyPedigree.editTitle',
    defaultMessage: '{isYou, select, true {About you} other {About {name}}}',
    description:
      'Title of the side panel showing the details about a family member. {name} is that family member’s name or “Unnamed”.',
  },
  aboutThisPerson: {
    id: 'interview.familyPedigree.aboutThisPerson',
    defaultMessage: 'About this person',
    description:
      'Heading above the name, gender identity and sex assigned at birth questions in the side panel for adding a family member.',
  },
  relationshipSection: {
    id: 'interview.familyPedigree.relationshipSection',
    defaultMessage: 'How you are related',
    description:
      'Heading above the questions about how a new family member is related to the selected person.',
  },
  relationshipsSection: {
    id: 'interview.familyPedigree.relationshipsSection',
    defaultMessage: 'Relationships',
    description:
      'Heading above the questions about a family member’s existing partnerships and parents, in the panel showing their details.',
  },
  stillTogetherLabel: {
    id: 'interview.familyPedigree.stillTogetherLabel',
    defaultMessage:
      '{personIsYou, select, true {Are you still together with {partner}?} other {{partnerIsYou, select, true {Are you still together?} other {Are they still together with {partner}?}}}}',
    description:
      'Yes/no question in the details panel about one of the family member’s partnerships: whether it is current, rather than separated or ended. {partner} is the partner’s name or “Unnamed”.',
  },
  parentLinkKindLabel: {
    id: 'interview.familyPedigree.parentLinkKindLabel',
    defaultMessage:
      '{parentIsYou, select, true {How are you their parent?} other {{personIsYou, select, true {How is {parent} your parent?} other {How is {parent} their parent?}}}}',
    description:
      'Question in the details panel about one of the family member’s parents. {parent} is the parent’s name or “Unnamed”. Options are the kinds of parent.',
  },
  parentCarriedLabel: {
    id: 'interview.familyPedigree.parentCarriedLabel',
    defaultMessage:
      '{parentIsYou, select, true {Did you carry the pregnancy?} other {Did {parent} carry the pregnancy?}}',
    description:
      'Yes/no question in the details panel: whether this biological parent was pregnant with the family member. {parent} is the parent’s name or “Unnamed”.',
  },
  moreAboutThisPerson: {
    id: 'interview.familyPedigree.moreAboutThisPerson',
    defaultMessage: 'More about this person',
    description:
      'Heading above the study’s own additional questions about a family member.',
  },
  nameLabel: {
    id: 'interview.familyPedigree.nameLabel',
    defaultMessage: 'Name (optional)',
    description:
      'Label of the field for a family member’s name, which the participant may not know.',
  },
  yourNameLabel: {
    id: 'interview.familyPedigree.yourNameLabel',
    defaultMessage: 'Your name (optional)',
    description: 'Label of the field for the participant’s own name.',
  },
  nameHint: {
    id: 'interview.familyPedigree.nameHint',
    defaultMessage:
      'A first name or nickname is fine. If you don’t know it, leave this blank and they will be shown by how they are related to you.',
    description: 'Hint beneath the field for a family member’s name.',
  },
  genderIdentityLabel: {
    id: 'interview.familyPedigree.genderIdentityLabel',
    defaultMessage: 'Gender identity',
    description: 'Label of the question about a family member’s gender.',
  },
  sexAssignedAtBirthLabel: {
    id: 'interview.familyPedigree.sexAssignedAtBirthLabel',
    defaultMessage: 'Sex assigned at birth',
    description:
      'Label of the question about the sex a family member was assigned at birth.',
  },
  genderWoman: {
    id: 'interview.familyPedigree.gender.woman',
    defaultMessage: 'Woman',
    description: 'Gender identity option.',
  },
  genderMan: {
    id: 'interview.familyPedigree.gender.man',
    defaultMessage: 'Man',
    description: 'Gender identity option.',
  },
  genderNonBinary: {
    id: 'interview.familyPedigree.gender.nonBinary',
    defaultMessage: 'Non-binary',
    description: 'Gender identity option.',
  },
  genderDifferentIdentity: {
    id: 'interview.familyPedigree.gender.differentIdentity',
    defaultMessage: 'A different identity',
    description: 'Gender identity option.',
  },
  dontKnow: {
    id: 'interview.familyPedigree.dontKnow',
    defaultMessage: 'Don’t know',
    description:
      'Answer option for a question about a family member, when the participant does not know.',
  },
  preferNotToSay: {
    id: 'interview.familyPedigree.preferNotToSay',
    defaultMessage: 'Prefer not to say',
    description:
      'Answer option for a question about a family member, when the participant would rather not answer.',
  },
  sexFemale: {
    id: 'interview.familyPedigree.sex.female',
    defaultMessage: 'Female',
    description: 'Sex assigned at birth option.',
  },
  sexMale: {
    id: 'interview.familyPedigree.sex.male',
    defaultMessage: 'Male',
    description: 'Sex assigned at birth option.',
  },
  sexIntersex: {
    id: 'interview.familyPedigree.sex.intersex',
    defaultMessage: 'Intersex',
    description: 'Sex assigned at birth option.',
  },
  parentKindLabel: {
    id: 'interview.familyPedigree.parentKindLabel',
    defaultMessage: 'What kind of parent are they?',
    description:
      'Question in the side panel for adding a parent: how the new person is a parent of the selected family member.',
  },
  parentKindBiological: {
    id: 'interview.familyPedigree.parentKind.biological',
    defaultMessage: 'Biological parent',
    description:
      'Option: a genetic parent, who contributed an egg or sperm and raised the child or was otherwise their parent.',
  },
  parentKindAdoptive: {
    id: 'interview.familyPedigree.parentKind.adoptive',
    defaultMessage: 'Adoptive parent',
    description: 'Option: a parent through adoption.',
  },
  parentKindSocial: {
    id: 'interview.familyPedigree.parentKind.social',
    defaultMessage: 'Step or social parent',
    description:
      'Option: a parent who is not genetically related and did not adopt — for example a step-parent.',
  },
  parentKindDonor: {
    id: 'interview.familyPedigree.parentKind.donor',
    defaultMessage: 'Egg or sperm donor',
    description:
      'Option: someone who donated an egg or sperm but did not raise the child.',
  },
  parentKindSurrogate: {
    id: 'interview.familyPedigree.parentKind.surrogate',
    defaultMessage: 'Surrogate',
    description:
      'Option: someone who carried the pregnancy for someone else and is not genetically related to the child.',
  },
  childKindLabel: {
    id: 'interview.familyPedigree.childKindLabel',
    defaultMessage: 'Is this child…',
    description:
      'Question in the side panel for adding a child: how the child is related to their parents. Followed by the options below.',
  },
  childKindBiological: {
    id: 'interview.familyPedigree.childKind.biological',
    defaultMessage: 'A biological child',
    description: 'Option: a genetically related child.',
  },
  childKindAdoptive: {
    id: 'interview.familyPedigree.childKind.adoptive',
    defaultMessage: 'An adopted child',
    description: 'Option: a child through adoption.',
  },
  childKindSocial: {
    id: 'interview.familyPedigree.childKind.social',
    defaultMessage: 'A step-child or other child they raise',
    description:
      'Option: a child who is neither genetically related nor adopted, such as a step-child.',
  },
  carriedPregnancyLabel: {
    id: 'interview.familyPedigree.carriedPregnancyLabel',
    defaultMessage: 'Did this parent carry the pregnancy?',
    description:
      'Yes/no question in the side panel for adding a biological parent: whether they were pregnant with the child.',
  },
  yes: {
    id: 'interview.familyPedigree.yes',
    defaultMessage: 'Yes',
    description: 'Answer to a yes/no question.',
  },
  no: {
    id: 'interview.familyPedigree.no',
    defaultMessage: 'No',
    description: 'Answer to a yes/no question.',
  },
  parentPartnerLabel: {
    id: 'interview.familyPedigree.parentPartnerLabel',
    defaultMessage: 'Are they the partner of another parent?',
    description:
      'Question in the side panel for adding a parent: whether the new parent is (or was) the partner of a parent already in the family tree. Options are those parents’ names, or “No”.',
  },
  partnershipCurrentLabel: {
    id: 'interview.familyPedigree.partnershipCurrentLabel',
    defaultMessage: 'Are they still together?',
    description:
      'Yes/no question: whether a partnership is current, rather than separated or ended.',
  },
  alsoParentOfLabel: {
    id: 'interview.familyPedigree.alsoParentOfLabel',
    defaultMessage: 'Are they also the parent of…',
    description:
      'Question in the side panel for adding a parent: which of the selected person’s siblings share this parent. Options are the siblings’ names.',
  },
  framingControlLabel: {
    id: 'interview.familyPedigree.framingControlLabel',
    defaultMessage: 'Words for your family',
    description:
      'Accessible name and tooltip of the toolbar button that opens the choice of words for family members.',
  },
  framingChoiceTitle: {
    id: 'interview.familyPedigree.framingChoiceTitle',
    defaultMessage: 'How should we describe your family?',
    description:
      'Heading of the popover, opened from the stage’s toolbar, that asks which words to use for family members. Open when the participant first reaches the stage.',
  },
  framingChoiceDescription: {
    id: 'interview.familyPedigree.framingChoiceDescription',
    defaultMessage:
      'Choose the words you would like us to use for the people in your family. You can change this at any time.',
    description:
      'Explanation under the heading of the popover asking which words to use for family members.',
  },
  framingChoiceGendered: {
    id: 'interview.familyPedigree.framingChoiceGendered',
    defaultMessage: 'Mother, father, sister, brother',
    description:
      'Option in the popover asking which words to use for family members: the usual words, chosen by each person’s gender.',
  },
  framingChoiceGenderedDescription: {
    id: 'interview.familyPedigree.framingChoiceGenderedDescription',
    defaultMessage:
      'Words that follow each person’s gender, such as grandmother, uncle or niece. Anyone who is neither a woman nor a man is described with words like parent or sibling.',
    description:
      'Explanation of the option to describe family members by their gender.',
  },
  framingChoiceGamete: {
    id: 'interview.familyPedigree.framingChoiceGamete',
    defaultMessage: 'Egg parent, sperm parent, sibling',
    description:
      'Option in the popover asking which words to use for family members: words that do not depend on anyone’s gender.',
  },
  framingChoiceGameteDescription: {
    id: 'interview.familyPedigree.framingChoiceGameteDescription',
    defaultMessage:
      'Words that do not depend on anyone’s gender. Biological parents are described by whether they gave the egg or the sperm, and everyone else with words like grandparent or parent’s sibling.',
    description:
      'Explanation of the option to describe family members without reference to gender.',
  },
  siblingKindLabel: {
    id: 'interview.familyPedigree.siblingKindLabel',
    defaultMessage: 'To the parents they share, are they…',
    description:
      'Question in the side panel for adding a sibling: how the new sibling is related to the parents chosen above. Followed by the options "A biological child", "An adopted child", "A step-child or other child they raise".',
  },
  siblingKindHint: {
    id: 'interview.familyPedigree.siblingKindHint',
    defaultMessage:
      '{isYou, select, true {This can differ from how you are related to them, for example if only one of you was adopted.} other {This can differ from how “{name}” is related to them, for example if only one of the two siblings was adopted.}}',
    description:
      'Hint under the question about how a new sibling is related to the parents they share. name is the person the sibling is being added to.',
  },
  placeholderParentsNote: {
    id: 'interview.familyPedigree.placeholderParentsNote',
    defaultMessage:
      '{framing, select, gamete {An egg parent and a sperm parent will be added for you to fill in later, so the family tree can show these siblings together.} other {A biological mother and a biological father will be added for you to fill in later, so the family tree can show these siblings together.}}',
    description:
      'Note in the side panel for adding a sibling, shown when the selected person has no parents yet.',
  },
  otherParentLabel: {
    id: 'interview.familyPedigree.otherParentLabel',
    defaultMessage: 'Who is the child’s other parent?',
    description:
      'Question in the side panel for adding a child. Options are the selected person’s partners, someone not in the family tree yet, or no other parent.',
  },
  otherParentUnknown: {
    id: 'interview.familyPedigree.otherParentUnknown',
    defaultMessage: 'Someone not shown yet',
    description:
      'Option: the child’s other parent is not in the family tree yet; an unnamed person is added to fill in later.',
  },
  otherParentNone: {
    id: 'interview.familyPedigree.otherParentNone',
    defaultMessage: 'No other parent',
    description: 'Option: the child has only the one parent.',
  },
  carrierLabel: {
    id: 'interview.familyPedigree.carrierLabel',
    defaultMessage: 'Who carried the pregnancy?',
    description:
      'Question in the side panel for adding a biological child. Options are the child’s parents’ names, or someone else / not known.',
  },
  carrierUnknown: {
    id: 'interview.familyPedigree.carrierUnknown',
    defaultMessage: 'Someone else, or I don’t know',
    description:
      'Option: neither parent shown carried the pregnancy, or the participant does not know.',
  },
  add: {
    id: 'interview.familyPedigree.add',
    defaultMessage: 'Add to family',
    description:
      'Button at the bottom of the side panel that adds the new family member.',
  },
  save: {
    id: 'interview.familyPedigree.save',
    defaultMessage: 'Save',
    description:
      'Button at the bottom of the side panel that saves changes to a family member’s details.',
  },
  cancel: {
    id: 'interview.familyPedigree.cancel',
    defaultMessage: 'Cancel',
    description: 'Button that closes the side panel without saving.',
  },
  remove: {
    id: 'interview.familyPedigree.remove',
    defaultMessage: 'Remove from family',
    description:
      'Button in the side panel that removes a family member from the family tree.',
  },
  removeConfirmTitle: {
    id: 'interview.familyPedigree.removeConfirmTitle',
    defaultMessage: 'Remove {name}?',
    description:
      'Title of the confirmation shown before removing a family member. {name} is their name or “Unnamed”.',
  },
  removeConfirmDescription: {
    id: 'interview.familyPedigree.removeConfirmDescription',
    defaultMessage:
      'They will be removed from your family tree, along with their connections to other people.',
    description:
      'Explanation in the confirmation shown before removing a family member.',
  },
  trackerProgressLabel: {
    id: 'interview.familyPedigree.trackerProgressLabel',
    defaultMessage:
      '{complete, select, true {Your family tree has everything needed} other {Family tree {percent, number, percent} complete}}. Show what’s still needed.',
    description:
      'Accessible name of the round progress indicator in the corner of the family tree, which opens the list of family members still needed. percent is a fraction between 0 and 1.',
  },
  trackerTitle: {
    id: 'interview.familyPedigree.trackerTitle',
    defaultMessage: 'Before you continue, please complete the following:',
    description:
      'Heading of the list of family members the participant still needs to add before moving on.',
  },
  trackerRecommendedNote: {
    id: 'interview.familyPedigree.trackerRecommendedNote',
    defaultMessage:
      'You can also continue without these by pressing Next again.',
    description:
      'Note beneath the list of family members still needed, when the study recommends rather than requires them.',
  },
  trackerComplete: {
    id: 'interview.familyPedigree.trackerComplete',
    defaultMessage: 'Your family tree has everything needed. You can continue.',
    description:
      'Shown in the list of family members still needed once nothing more is needed.',
  },
  itemParents: {
    id: 'interview.familyPedigree.itemParents',
    defaultMessage:
      '{isYou, select, true {{missing, plural, one {Add your other biological parent} other {Add your biological parents}}} other {{missing, plural, one {Add another biological parent for “{name}”} other {Add biological parents for “{name}”}}}}',
    description:
      'Item in the list of family members still needed. missing is how many biological parents the person still needs (1 or 2). name is the person’s name or how they are related to the participant. Biological parents include an egg or sperm donor.',
  },
  itemSiblings: {
    id: 'interview.familyPedigree.itemSiblings',
    defaultMessage:
      '{isYou, select, true {Add your biological brothers and sisters, or say you have none} other {Add biological brothers and sisters for “{name}”, or say they have none}}',
    description:
      'Item in the list of family members still needed: the person’s siblings (including half-siblings), or an answer that they have none or that the participant does not know. name is the person’s name or how they are related to the participant.',
  },
  itemChildren: {
    id: 'interview.familyPedigree.itemChildren',
    defaultMessage:
      '{isYou, select, true {Add your biological children, or say you have none} other {Add biological children for “{name}”, or say they have none}}',
    description:
      'Item in the list of family members still needed: the person’s biological children, or an answer that they have none or that the participant does not know. name is the person’s name or how they are related to the participant.',
  },
  itemDetails: {
    id: 'interview.familyPedigree.itemDetails',
    defaultMessage:
      '{isYou, select, true {Some details are missing about you} other {Some details are missing for “{name}”}}',
    description:
      'Item in the list of what is still needed before continuing: questions about this person that the study requires have not been answered. name is the person’s name or how they are related to the participant.',
  },
  familySection: {
    id: 'interview.familyPedigree.familySection',
    defaultMessage: 'Their family',
    description:
      'Heading of the questions in a family member’s details about whether they have siblings or children.',
  },
  hasSiblingsQuestion: {
    id: 'interview.familyPedigree.hasSiblingsQuestion',
    defaultMessage:
      '{isYou, select, true {Do you have any biological brothers or sisters, including half-brothers and half-sisters?} other {Does {name} have any biological brothers or sisters, including half-brothers and half-sisters?}}',
    description:
      'Question in a family member’s details. Answering yes means the participant will add them to the family tree. Includes half-siblings who share one biological parent.',
  },
  hasChildrenQuestion: {
    id: 'interview.familyPedigree.hasChildrenQuestion',
    defaultMessage:
      '{isYou, select, true {Do you have any biological children?} other {Does {name} have any biological children?}}',
    description:
      'Question in a family member’s details. Answering yes means the participant will add them to the family tree.',
  },
  hasRelativesYes: {
    id: 'interview.familyPedigree.hasRelativesYes',
    defaultMessage: 'Yes — I’ll add them to the family tree',
    description:
      'Answer to whether a family member has siblings or children: yes, and the participant will add them.',
  },
  addedAnnouncement: {
    id: 'interview.familyPedigree.addedAnnouncement',
    defaultMessage: '{name} added to your family.',
    description:
      'Screen reader announcement after a family member is added. {name} is their name or, when it is not known, how they are related to the participant.',
  },
  savedAnnouncement: {
    id: 'interview.familyPedigree.savedAnnouncement',
    defaultMessage: 'Details saved.',
    description:
      'Screen reader announcement after a family member’s details are saved.',
  },
  removedAnnouncement: {
    id: 'interview.familyPedigree.removedAnnouncement',
    defaultMessage: '{name} removed from your family.',
    description:
      'Screen reader announcement after a family member is removed. {name} is their name or, when it is not known, how they are related to the participant.',
  },
  toolsLabel: {
    id: 'interview.familyPedigree.toolsLabel',
    defaultMessage: 'Family tree tools',
    description:
      'Accessible name of the toolbar above the family tree, which switches between adding or editing people, connecting two people, and removing the connection between two people.',
  },
  toolGroupLabel: {
    id: 'interview.familyPedigree.toolGroupLabel',
    defaultMessage: 'What clicking a person does',
    description:
      'Accessible name of the pair of buttons in the toolbar that choose what selecting a person does.',
  },
  pointerTool: {
    id: 'interview.familyPedigree.pointerTool',
    defaultMessage: 'Add and edit people',
    description:
      'Toolbar button (icon only; this is its name and tooltip). While it is on, selecting a person opens their details and shows buttons to add their relatives.',
  },
  connectTool: {
    id: 'interview.familyPedigree.connectTool',
    defaultMessage: 'Connect two people',
    description:
      'Toolbar button (icon only; this is its name and tooltip). While it is on, selecting one person and then another connects them, for relatives added separately.',
  },
  connectHint: {
    id: 'interview.familyPedigree.connectHint',
    defaultMessage: 'Select a person, then select another to connect them.',
    description:
      'Instruction shown under the toolbar while the tool for connecting two people is on.',
  },
  connectHintLinking: {
    id: 'interview.familyPedigree.connectHintLinking',
    defaultMessage:
      '{isYou, select, true {Now select the person to connect to you.} other {Now select the person to connect to “{name}”.}}',
    description:
      'Instruction shown under the toolbar once the first of two people to connect has been selected. name is that person’s name or how they are related to the participant.',
  },
  connectQuestion: {
    id: 'interview.familyPedigree.connectQuestion',
    defaultMessage:
      '{firstIsYou, select, true {How are you and “{second}” related?} other {How are “{first}” and “{second}” related?}}',
    description:
      'Heading of the menu that appears after selecting two people to connect. first and second are their names or how they are related to the participant.',
  },
  connectPartners: {
    id: 'interview.familyPedigree.connectPartners',
    defaultMessage:
      '{firstIsYou, select, true {You and “{second}” are partners} other {“{first}” and “{second}” are partners}}',
    description:
      'Option in the menu for connecting two people: they are, or were, a couple.',
  },
  connectParent: {
    id: 'interview.familyPedigree.connectParent',
    defaultMessage:
      '{parentIsYou, select, true {You are a parent of “{child}”} other {{childIsYou, select, true {“{parent}” is your parent} other {“{parent}” is a parent of “{child}”}}}}',
    description:
      'Option in the menu for connecting two people, opening a list of kinds of parent (biological, adoptive and so on). parent and child are names or how the people are related to the participant.',
  },
  connectedParentAnnouncement: {
    id: 'interview.familyPedigree.connectedParentAnnouncement',
    defaultMessage: '{relationship} ({kind})',
    description:
      'Screen reader announcement after connecting two people as parent and child. relationship is the chosen menu option (for example “Julie” is a parent of “Rob”); kind is the kind of parent chosen (for example Adoptive parent).',
  },
  connectBack: {
    id: 'interview.familyPedigree.connectBack',
    defaultMessage: 'Back',
    description:
      'Option in the menu for connecting two people, after choosing that one is the other’s parent: return to the list of relationships.',
  },
  connectAlreadyConnected: {
    id: 'interview.familyPedigree.connectAlreadyConnected',
    defaultMessage:
      '{firstIsYou, select, true {You and “{second}” are already connected.} other {“{first}” and “{second}” are already connected.}}',
    description:
      'Shown under the toolbar, and read out, when the participant selects two people to connect who are already connected. first and second are their names or how they are related to the participant.',
  },
  connectFormerPartners: {
    id: 'interview.familyPedigree.connectFormerPartners',
    defaultMessage:
      '{firstIsYou, select, true {You and “{second}” were partners} other {“{first}” and “{second}” were partners}}',
    description:
      'Option in the menu for connecting two people: they were a couple but are no longer together.',
  },
  parentKindBiologicalCarrier: {
    id: 'interview.familyPedigree.parentKind.biologicalCarrier',
    defaultMessage: 'Biological parent who carried the pregnancy',
    description:
      'Option in the menu for connecting a parent and child: a genetic parent who was also pregnant with the child.',
  },
  disconnectTool: {
    id: 'interview.familyPedigree.disconnectTool',
    defaultMessage: 'Remove a connection',
    description:
      'Toolbar button (icon only; this is its name and tooltip). While it is on, selecting one person and then someone they are connected to removes the connection between them, leaving both people in the family tree.',
  },
  disconnectHint: {
    id: 'interview.familyPedigree.disconnectHint',
    defaultMessage:
      'Select a person, then select someone they are connected to, to remove that connection.',
    description:
      'Instruction shown under the toolbar while the tool for removing a connection between two people is on.',
  },
  disconnectHintLinking: {
    id: 'interview.familyPedigree.disconnectHintLinking',
    defaultMessage:
      '{isYou, select, true {Now select the person to disconnect from you.} other {Now select the person to disconnect from “{name}”.}}',
    description:
      'Instruction shown under the toolbar once the first of two people to disconnect has been selected. name is that person’s name or how they are related to the participant.',
  },
  disconnectNotConnected: {
    id: 'interview.familyPedigree.disconnectNotConnected',
    defaultMessage:
      '{firstIsYou, select, true {You and “{second}” are not connected.} other {“{first}” and “{second}” are not connected.}}',
    description:
      'Shown under the toolbar, and read out, when the participant selects two people to disconnect who have no connection between them. first and second are their names or how they are related to the participant.',
  },
  disconnectConfirmTitle: {
    id: 'interview.familyPedigree.disconnectConfirmTitle',
    defaultMessage:
      '{firstIsYou, select, true {Remove the connection between you and “{second}”?} other {Remove the connection between “{first}” and “{second}”?}}',
    description:
      'Title of the confirmation shown before removing the connection between two people. first and second are their names or how they are related to the participant.',
  },
  disconnectConfirmDescription: {
    id: 'interview.familyPedigree.disconnectConfirmDescription',
    defaultMessage:
      'Both people stay in your family tree. Only the connection between them is removed.',
    description:
      'Explanation in the confirmation shown before removing the connection between two people.',
  },
  disconnectConfirm: {
    id: 'interview.familyPedigree.disconnectConfirm',
    defaultMessage: 'Remove connection',
    description:
      'Button in the confirmation that removes the connection between two people.',
  },
  disconnectedAnnouncement: {
    id: 'interview.familyPedigree.disconnectedAnnouncement',
    defaultMessage:
      '{firstIsYou, select, true {The connection between you and “{second}” was removed.} other {The connection between “{first}” and “{second}” was removed.}}',
    description:
      'Screen reader announcement after the connection between two people is removed. first and second are their names or how they are related to the participant.',
  },
  sexRuledOutHint: {
    id: 'interview.familyPedigree.sexRuledOutHint',
    defaultMessage:
      '{isYou, select, true {Some answers are unavailable because they do not fit how you are connected to your children. To choose one, change or remove that connection first.} other {Some answers are unavailable because they do not fit how this person is connected to their children. To choose one, change or remove that connection first.}}',
    description:
      'Hint under the sex assigned at birth question when some answers contradict the person’s recorded children: for example, a child cannot have two biological parents who were both assigned male at birth.',
  },
  biologicalParentLabel: {
    id: 'interview.familyPedigree.biologicalParentLabel',
    defaultMessage: 'Who is the child’s biological parent?',
    description:
      'Question in the side panel for adding a biological child with a partner as the other parent. Options are both of them, or either one.',
  },
  biologicalParentHint: {
    id: 'interview.familyPedigree.biologicalParentHint',
    defaultMessage:
      'A parent who is not a biological parent is added as a step or social parent.',
    description:
      'Hint under the question asking which parent of a new child is a biological parent.',
  },
  biologicalParentBoth: {
    id: 'interview.familyPedigree.biologicalParentBoth',
    defaultMessage:
      '{firstIsYou, select, true {Both you and “{second}”} other {Both “{first}” and “{second}”}}',
    description:
      'Option: both parents of the new child are its biological parents. first and second are their names or how they are related to the participant.',
  },
  trackerNoSiblings: {
    id: 'interview.familyPedigree.trackerNoSiblings',
    defaultMessage:
      '{isYou, select, true {I have no biological siblings} other {“{name}” has no biological siblings}}',
    description:
      'Button under an item in the list of family members still needed: records that the person has no siblings who share a biological parent. name is the person’s name or how they are related to the participant.',
  },
  trackerNoChildren: {
    id: 'interview.familyPedigree.trackerNoChildren',
    defaultMessage:
      '{isYou, select, true {I have no biological children} other {“{name}” has no biological children}}',
    description:
      'Button under an item in the list of family members still needed: records that the person has no biological children. name is the person’s name or how they are related to the participant.',
  },
  siblingsAnsweredAnnouncement: {
    id: 'interview.familyPedigree.siblingsAnsweredAnnouncement',
    defaultMessage:
      '{isYou, select, true {Recorded that you have no biological brothers or sisters.} other {Recorded that “{name}” has no biological brothers or sisters.}}',
    description:
      'Screen reader announcement after answering, from the list of family members still needed, that a person has no siblings. name is the person’s name or how they are related to the participant.',
  },
  childrenAnsweredAnnouncement: {
    id: 'interview.familyPedigree.childrenAnsweredAnnouncement',
    defaultMessage:
      '{isYou, select, true {Recorded that you have no biological children.} other {Recorded that “{name}” has no biological children.}}',
    description:
      'Screen reader announcement after answering, from the list of family members still needed, that a person has no children. name is the person’s name or how they are related to the participant.',
  },
  sharedParentCountLabel: {
    id: 'interview.familyPedigree.sharedParentCountLabel',
    defaultMessage:
      '{isYou, select, true {Which parents do they share with you?} other {Which parents do they share with “{name}”?}}',
    description:
      'Question in the side panel for adding a sibling: which parents the two siblings have in common. Options are the parents’ names, or for someone with no parents yet, both or one of the parents who will be added. name is that person’s name or how they are related to the participant.',
  },
  sharedParentCountBoth: {
    id: 'interview.familyPedigree.sharedParentCountBoth',
    defaultMessage: 'Both parents',
    description:
      'Option: the new sibling shares both parents (a full sibling).',
  },
  sharedParentEggOnly: {
    id: 'interview.familyPedigree.sharedParentEggOnly',
    defaultMessage:
      '{framing, select, gamete {Only the egg parent} other {Only the biological mother}}',
    description:
      'Option: the new sibling shares only the parent who provided the egg (a half-sibling). Gendered or gamete wording depends on the study.',
  },
  sharedParentSpermOnly: {
    id: 'interview.familyPedigree.sharedParentSpermOnly',
    defaultMessage:
      '{framing, select, gamete {Only the sperm parent} other {Only the biological father}}',
    description:
      'Option: the new sibling shares only the parent who provided the sperm (a half-sibling). Gendered or gamete wording depends on the study.',
  },
  sharedParentUnshown: {
    id: 'interview.familyPedigree.sharedParentUnshown',
    defaultMessage:
      '{isYou, select, true {Your other parent, not shown yet} other {The other parent of “{name}”, not shown yet}}',
    description:
      'Option when choosing which parents a new sibling shares, for someone with one parent recorded: their second parent, who is added unnamed for both of them.',
  },
});
