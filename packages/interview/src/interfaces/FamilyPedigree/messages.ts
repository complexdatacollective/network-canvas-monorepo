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
  unnamedPerson: {
    id: 'interview.familyPedigree.unnamedPerson',
    defaultMessage: 'Unnamed',
    description:
      'Label shown beneath a family member whose name has not been entered yet.',
  },
  personAccessibleName: {
    id: 'interview.familyPedigree.personAccessibleName',
    defaultMessage:
      '{isYou, select, true {You} other {{name}}}{missing, select, true {, some details missing} other {}}',
    description:
      'Accessible name of a family member’s symbol in the family tree. {name} is the person’s name or “Unnamed”. The second part is read out when required details about the person have not been given yet.',
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
    defaultMessage: 'Name',
    description: 'Label of the field for a family member’s name.',
  },
  yourNameLabel: {
    id: 'interview.familyPedigree.yourNameLabel',
    defaultMessage: 'Your name (optional)',
    description: 'Label of the field for the participant’s own name.',
  },
  nameHint: {
    id: 'interview.familyPedigree.nameHint',
    defaultMessage: 'A first name or nickname is fine.',
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
  sharedParentsLabel: {
    id: 'interview.familyPedigree.sharedParentsLabel',
    defaultMessage: 'Which parents do they share?',
    description:
      'Question in the side panel for adding a sibling: which parents the two siblings have in common. Options are the parents’ names.',
  },
  placeholderParentsNote: {
    id: 'interview.familyPedigree.placeholderParentsNote',
    defaultMessage:
      'Two parents will be added for you to fill in later, so the family tree can show these siblings together.',
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
  addedAnnouncement: {
    id: 'interview.familyPedigree.addedAnnouncement',
    defaultMessage: '{name} added to your family.',
    description:
      'Screen reader announcement after a family member is added. {name} is their name or “Unnamed”.',
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
      'Screen reader announcement after a family member is removed. {name} is their name or “Unnamed”.',
  },
});
