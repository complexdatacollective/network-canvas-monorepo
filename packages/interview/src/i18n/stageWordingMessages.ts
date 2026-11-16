import { defineMessages } from '@codaco/app-i18n/messages';

// The interview's wording for the stage settings a protocol may reword: what
// a stage shows for a setting it does not hold. The schema names each setting
// and the message that words it (`@codaco/protocol-validation`, the
// `stage-wording` tables); the interview reads the wording through
// `useStageWording`, from the catalogues in `locales/`, so nothing formats
// these messages directly. They are declared here so that their English and
// descriptions are extracted into `locales/en.json` with every other message.
export const stageWordingMessages = defineMessages({
  'bins.unplacedNodesNotice': {
    id: 'interview.stageWording.bins.unplacedNodesNotice',
    defaultMessage: 'You must place every item before you can continue.',
    description:
      'The notice when the participant tries to continue with nodes unplaced.',
  },
  'familyPedigree.completeness.itemText.children.listItem': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.children.listItem',
    defaultMessage:
      '{isYou, select, true {Add your biological children, or say you have none} other {Add biological children for {name}, or say they have none}}',
    description:
      'The tracker entry for a person whose biological children are not yet recorded.',
  },
  'familyPedigree.completeness.itemText.children.noneButton': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.children.noneButton',
    defaultMessage:
      '{isYou, select, true {I have no biological children} other {{name} has no biological children}}',
    description: 'The button under it recording that they have none.',
  },
  'familyPedigree.completeness.itemText.children.question': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.children.question',
    defaultMessage:
      '{isYou, select, true {Do you have any biological children?} other {Does {name} have any biological children?}}',
    description: 'The question asking it in the side panel.',
  },
  'familyPedigree.completeness.itemText.details.listItem': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.details.listItem',
    defaultMessage:
      '{isYou, select, true {Some details are missing about you} other {Some details are missing for {name}}}',
    description: 'The tracker entry for a person missing a required detail.',
  },
  'familyPedigree.completeness.itemText.parents.listItem': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.parents.listItem',
    defaultMessage:
      '{isYou, select, true {Add your biological parents} other {Add biological parents for {name}}}',
    description: 'The tracker entry for a person missing biological parents.',
  },
  'familyPedigree.completeness.itemText.siblings.listItem': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.siblings.listItem',
    defaultMessage:
      '{isYou, select, true {Add your biological brothers and sisters, or say you have none} other {Add biological brothers and sisters for {name}, or say they have none}}',
    description:
      'The tracker entry for a person whose biological siblings are not yet recorded.',
  },
  'familyPedigree.completeness.itemText.siblings.noneButton': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.siblings.noneButton',
    defaultMessage:
      '{isYou, select, true {I have no biological siblings} other {{name} has no biological siblings}}',
    description: 'The button under it recording that they have none.',
  },
  'familyPedigree.completeness.itemText.siblings.question': {
    id: 'interview.stageWording.familyPedigree.completeness.itemText.siblings.question',
    defaultMessage:
      '{isYou, select, true {Do you have any biological brothers or sisters, including half-brothers and half-sisters?} other {Does {name} have any biological brothers or sisters, including half-brothers and half-sisters?}}',
    description: 'The question asking it in the side panel.',
  },
  'familyPedigree.completeness.recommendedNote': {
    id: 'interview.stageWording.familyPedigree.completeness.recommendedNote',
    defaultMessage:
      'You can also continue without these by pressing Next again.',
    description:
      'The note under the tracker when the family is recommended rather than required.',
  },
  'familyPedigree.nodeConfiguration.nameField.hint': {
    id: 'interview.stageWording.familyPedigree.nodeConfiguration.nameField.hint',
    defaultMessage:
      'A first name or nickname is fine. If you don’t know it, leave this blank and they will be shown by how they are related to you.',
    description: 'The hint beneath it.',
  },
  'familyPedigree.nodeConfiguration.nameField.prompt': {
    id: 'interview.stageWording.familyPedigree.nodeConfiguration.nameField.prompt',
    defaultMessage: 'Name (optional)',
    description: 'The name question in the side panel.',
  },
  'familyPedigree.wording.alsoParentOfLabel': {
    id: 'interview.stageWording.familyPedigree.wording.alsoParentOfLabel',
    defaultMessage: 'Are they also the parent of…',
    description:
      'The question introducing the siblings the new parent may also be the parent of.',
  },
  'familyPedigree.wording.biologicalParentBoth': {
    id: 'interview.stageWording.familyPedigree.wording.biologicalParentBoth',
    defaultMessage:
      '{firstIsYou, select, true {Both you and {second}} other {Both {first} and {second}}}',
    description:
      'The option that both parents of a new child are its biological parents.',
  },
  'familyPedigree.wording.biologicalParentHint': {
    id: 'interview.stageWording.familyPedigree.wording.biologicalParentHint',
    defaultMessage:
      'A parent who is not a biological parent is added as a step or social parent.',
    description:
      'The hint under the question asking which parent is biological.',
  },
  'familyPedigree.wording.biologicalParentLabel': {
    id: 'interview.stageWording.familyPedigree.wording.biologicalParentLabel',
    defaultMessage: 'Who is the child’s biological parent?',
    description:
      'The question asking which parents of a new child are biological, when the child has a partner as the other parent.',
  },
  'familyPedigree.wording.carriedSiblingsPregnancyLabel': {
    id: 'interview.stageWording.familyPedigree.wording.carriedSiblingsPregnancyLabel',
    defaultMessage:
      '{single, select, true {{isYou, select, true {Was this parent pregnant with you?} other {Was this parent pregnant with {name}?}}} other {Was this parent pregnant with each of the {count} people chosen above who have nobody recorded as having carried them?}}',
    description:
      'The yes or no question asking whether a parent carried the pregnancy of each person chosen who has no recorded carrier.',
  },
  'familyPedigree.wording.carrierLabel': {
    id: 'interview.stageWording.familyPedigree.wording.carrierLabel',
    defaultMessage: 'Who carried the pregnancy?',
    description: 'The question asking who carried the pregnancy.',
  },
  'familyPedigree.wording.carrierReplaced': {
    id: 'interview.stageWording.familyPedigree.wording.carrierReplaced',
    defaultMessage:
      '{who, select, carrierIsYou {Choosing {answer} means you will no longer be recorded as having carried {child}, as only one person carries a pregnancy.} childIsYou {Choosing {answer} means {carrier} will no longer be recorded as having carried you, as only one person carries a pregnancy.} other {Choosing {answer} means {carrier} will no longer be recorded as having carried {child}, as only one person carries a pregnancy.}}',
    description:
      'What choosing an answer that records someone else as having carried a child does: the person recorded as having carried them no longer is. Names the answer.',
  },
  'familyPedigree.wording.carrierUnknown': {
    id: 'interview.stageWording.familyPedigree.wording.carrierUnknown',
    defaultMessage: 'Someone else, or I don’t know',
    description:
      'The option that none of the parents offered carried the pregnancy, or the participant does not know.',
  },
  'familyPedigree.wording.changeWouldCutOff': {
    id: 'interview.stageWording.familyPedigree.wording.changeWouldCutOff',
    defaultMessage:
      '{count, plural, one {This would leave {names} outside your family tree, because it removes their only connection to you. Connect them to someone else in your family first.} other {This would leave {names} outside your family tree, because it removes their only connection to you. Connect them to someone else in your family first.}}',
    description:
      'The notice shown when a change made in the panel, or a connection, would leave people outside the family tree, so is not made.',
  },
  'familyPedigree.wording.childKindAdoptive': {
    id: 'interview.stageWording.familyPedigree.wording.childKindAdoptive',
    defaultMessage: 'An adopted child',
    description: 'The option for a child through adoption.',
  },
  'familyPedigree.wording.childKindBiological': {
    id: 'interview.stageWording.familyPedigree.wording.childKindBiological',
    defaultMessage: 'A biological child',
    description: 'The option for a genetically related child.',
  },
  'familyPedigree.wording.childKindDonor': {
    id: 'interview.stageWording.familyPedigree.wording.childKindDonor',
    defaultMessage:
      '{isYou, select, true {A child conceived with an egg or sperm you donated} other {A child conceived with an egg or sperm they donated}}',
    description:
      'The option for a child conceived with an egg or sperm the person donated. `isYou` is whether that person is the participant.',
  },
  'familyPedigree.wording.childKindLabel': {
    id: 'interview.stageWording.familyPedigree.wording.childKindLabel',
    defaultMessage: 'Is this child…',
    description: 'The question asking how a child is related to their parents.',
  },
  'familyPedigree.wording.childKindSocial': {
    id: 'interview.stageWording.familyPedigree.wording.childKindSocial',
    defaultMessage:
      '{isYou, select, true {A step-child or other child you raise} other {A step-child or other child they raise}}',
    description:
      'The option for a child who is neither genetically related nor adopted, such as a step-child. `isYou` is whether the parent is the participant.',
  },
  'familyPedigree.wording.childKindSurrogate': {
    id: 'interview.stageWording.familyPedigree.wording.childKindSurrogate',
    defaultMessage:
      '{isYou, select, true {A child you carried as a surrogate} other {A child they carried as a surrogate}}',
    description:
      'The option for a child the person carried as a surrogate. `isYou` is whether that person is the participant.',
  },
  'familyPedigree.wording.connectParent': {
    id: 'interview.stageWording.familyPedigree.wording.connectParent',
    defaultMessage:
      '{parentIsYou, select, true {You are a parent of {child}} other {{childIsYou, select, true {{parent} is your parent} other {{parent} is a parent of {child}}}}}',
    description:
      'The menu option for connecting a parent and child, naming both.',
  },
  'familyPedigree.wording.connectPartners': {
    id: 'interview.stageWording.familyPedigree.wording.connectPartners',
    defaultMessage:
      '{current, select, true {{firstIsYou, select, true {You and {second} are partners} other {{first} and {second} are partners}}} other {{firstIsYou, select, true {You and {second} were partners} other {{first} and {second} were partners}}}}',
    description:
      'The menu option for connecting two people who are, or were, partners.',
  },
  'familyPedigree.wording.connectQuestion': {
    id: 'interview.stageWording.familyPedigree.wording.connectQuestion',
    defaultMessage:
      '{firstIsYou, select, true {How are you and {second} related?} other {How are {first} and {second} related?}}',
    description:
      'The heading of the menu shown after two people are selected to connect.',
  },
  'familyPedigree.wording.disconnectConfirmDescription': {
    id: 'interview.stageWording.familyPedigree.wording.disconnectConfirmDescription',
    defaultMessage:
      'Both people stay in your family tree. Only the connection between them is removed.',
    description:
      'The explanation shown before removing the connection between two people.',
  },
  'familyPedigree.wording.disconnectConfirmTitle': {
    id: 'interview.stageWording.familyPedigree.wording.disconnectConfirmTitle',
    defaultMessage:
      '{firstIsYou, select, true {Remove the connection between you and {second}?} other {Remove the connection between {first} and {second}?}}',
    description:
      'The title of the confirmation shown before removing the connection between two people.',
  },
  'familyPedigree.wording.disconnectStandIn': {
    id: 'interview.stageWording.familyPedigree.wording.disconnectStandIn',
    defaultMessage:
      '{childIsYou, select, true {{standIn} stands in for a parent of yours who has not been added yet, so this connection cannot be removed. Add that parent to you instead, and they will take this place.} other {{standIn} stands in for a parent of {child} who has not been added yet, so this connection cannot be removed. Add that parent to {child} instead, and they will take this place.}}',
    description:
      'The notice shown when the connection between an unnamed parent and their child cannot be removed, because the unnamed parent holds the place of a parent not yet added.',
  },
  'familyPedigree.wording.disconnectWouldCutOff': {
    id: 'interview.stageWording.familyPedigree.wording.disconnectWouldCutOff',
    defaultMessage:
      '{count, plural, one {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.} other {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.}}',
    description:
      'The notice shown when removing a connection would leave people outside the family tree.',
  },
  'familyPedigree.wording.genderIdentityLabel': {
    id: 'interview.stageWording.familyPedigree.wording.genderIdentityLabel',
    defaultMessage: 'Gender identity',
    description:
      "The question about a family member's gender identity. Asked only when the stage asks about it.",
  },
  'familyPedigree.wording.generatedLabelOf': {
    id: 'interview.stageWording.familyPedigree.wording.generatedLabelOf',
    defaultMessage:
      '{relation, select, partner {{isYou, select, true {{term} (your partner)} other {{term} (partner of {name})}}} formerPartner {{isYou, select, true {{term} (your former partner)} other {{term} (former partner of {name})}}} parent {{isYou, select, true {{term} (your parent)} other {{term} (parent of {name})}}} sibling {{isYou, select, true {{term} (your sibling)} other {{term} (sibling of {name})}}} owner {{owner}’s {term}} other {{isYou, select, true {{term} (your child)} other {{term} (child of {name})}}}}',
    description:
      'The label for a relative the participant did not name, which is also saved as their name.',
  },
  'familyPedigree.wording.geneticParentReplaced': {
    id: 'interview.stageWording.familyPedigree.wording.geneticParentReplaced',
    defaultMessage:
      '{who, select, parentIsYou {Choosing {answer} means you will no longer be recorded as a biological parent of {child}. You will be asked what kind of parent you are to {child} instead.} childIsYou {Choosing {answer} means {parent} will no longer be recorded as your biological parent. You will be asked what kind of parent {parent} is to you instead.} other {Choosing {answer} means {parent} will no longer be recorded as a biological parent of {child}. You will be asked what kind of parent {parent} is to {child} instead.}}',
    description:
      'What choosing an answer that records a new genetic parent does: the biological parent of the same sex at birth recorded no longer is one, and the participant is asked what kind of parent they are instead. Names the answer.',
  },
  'familyPedigree.wording.identicalTwinSharesParents': {
    id: 'interview.stageWording.familyPedigree.wording.identicalTwinSharesParents',
    defaultMessage:
      '{who, select, personIsYou {Choosing {answer} records the same biological parents and donors for you and {twin}.} twinIsYou {Choosing {answer} records the same biological parents and donors for {name} and you.} other {Choosing {answer} records the same biological parents and donors for {name} and {twin}.}}',
    description:
      'What recording two twins as identical does while their biological parents and donors differ: it records the same ones for both.',
  },
  'familyPedigree.wording.otherParentBiologicalLabel': {
    id: 'interview.stageWording.familyPedigree.wording.otherParentBiologicalLabel',
    defaultMessage:
      '{otherIsYou, select, true {Are you the child’s biological parent?} other {Is {other} the child’s biological parent?}}',
    description:
      'The yes or no question asking whether the other parent of a new step-child or adopted child is the child’s biological parent.',
  },
  'familyPedigree.wording.otherParentLabel': {
    id: 'interview.stageWording.familyPedigree.wording.otherParentLabel',
    defaultMessage: 'Who is the child’s other parent?',
    description: "The question asking who a child's other parent is.",
  },
  'familyPedigree.wording.otherParentNone': {
    id: 'interview.stageWording.familyPedigree.wording.otherParentNone',
    defaultMessage: 'No other parent',
    description: 'The option that the child has only the one parent.',
  },
  'familyPedigree.wording.otherParentUnknown': {
    id: 'interview.stageWording.familyPedigree.wording.otherParentUnknown',
    defaultMessage: 'Someone not shown yet',
    description:
      "The option that the child's other parent is not in the family tree yet.",
  },
  'familyPedigree.wording.panelTitle': {
    id: 'interview.stageWording.familyPedigree.wording.panelTitle',
    defaultMessage:
      '{relation, select, edit {{isYou, select, true {About you} other {About {name}}}} parent {{isYou, select, true {Add your parent} other {Add a parent of {name}}}} sibling {{isYou, select, true {Add your sibling} other {Add a sibling of {name}}}} partner {{isYou, select, true {Add your partner} other {Add a partner of {name}}}} other {{isYou, select, true {Add your child} other {Add a child of {name}}}}}',
    description:
      'The title of the side panel for a family member being described or added.',
  },
  'familyPedigree.wording.parentCarriedLabel': {
    id: 'interview.stageWording.familyPedigree.wording.parentCarriedLabel',
    defaultMessage:
      '{named, select, true {{parentIsYou, select, true {Did you carry the pregnancy?} other {Did {parent} carry the pregnancy?}}} other {Did this parent carry the pregnancy?}}',
    description:
      'The yes or no question asking whether a biological parent carried the pregnancy.',
  },
  'familyPedigree.wording.parentKindCarrier': {
    id: 'interview.stageWording.familyPedigree.wording.parentKindCarrier',
    defaultMessage: '{parentKind} (carried the pregnancy)',
    description:
      'The menu option for a parent of any kind who also carried the pregnancy. The kind of parent is written in before it.',
  },
  'familyPedigree.wording.parentKindLabel': {
    id: 'interview.stageWording.familyPedigree.wording.parentKindLabel',
    defaultMessage: 'What kind of parent are they?',
    description:
      'The question asking how a new parent is a parent of the selected family member.',
  },
  'familyPedigree.wording.parentLinkKindLabel': {
    id: 'interview.stageWording.familyPedigree.wording.parentLinkKindLabel',
    defaultMessage:
      '{parentIsYou, select, true {What kind of parent are you to {child}?} other {{personIsYou, select, true {What kind of parent is {parent} to you?} other {What kind of parent is {parent} to {child}?}}}}',
    description:
      'The question asking what kind of parent someone is to a family member, which the chosen kind of parent answers.',
  },
  'familyPedigree.wording.parentPartnerLabel': {
    id: 'interview.stageWording.familyPedigree.wording.parentPartnerLabel',
    defaultMessage: 'Are they the partner of another parent?',
    description:
      'The question asking whether a new parent is, or was, the partner of a parent already in the family.',
  },
  'familyPedigree.wording.placeholderParentsNote': {
    id: 'interview.stageWording.familyPedigree.wording.placeholderParentsNote',
    defaultMessage:
      '{shared, select, eggParent {{framing, select, gamete {An egg parent and a sperm parent will be added for you to fill in later. The sibling shares the egg parent, and is given a sperm parent of their own.} other {A biological mother and a biological father will be added for you to fill in later. The sibling shares the mother, and is given a biological father of their own.}}} spermParent {{framing, select, gamete {An egg parent and a sperm parent will be added for you to fill in later. The sibling shares the sperm parent, and is given an egg parent of their own.} other {A biological mother and a biological father will be added for you to fill in later. The sibling shares the father, and is given a biological mother of their own.}}} other {{framing, select, gamete {An egg parent and a sperm parent will be added for you to fill in later, so the family tree can show these siblings together.} other {A biological mother and a biological father will be added for you to fill in later, so the family tree can show these siblings together.}}}}',
    description:
      'The note shown when adding a sibling to someone who has no parents recorded yet.',
  },
  'familyPedigree.wording.relativeTerm': {
    id: 'interview.stageWording.familyPedigree.wording.relativeTerm',
    defaultMessage:
      '{term, select, mother {Mother} father {Father} parent {Parent} eggParent {Egg parent} spermParent {Sperm parent} biologicalMother {Biological mother} biologicalFather {Biological father} adoptiveMother {Adoptive mother} adoptiveFather {Adoptive father} adoptiveParent {Adoptive parent} stepmother {Stepmother} stepfather {Stepfather} stepparent {Step-parent} eggDonor {Egg donor} spermDonor {Sperm donor} donor {Donor} surrogate {Surrogate} daughter {Daughter} son {Son} child {Child} stepdaughter {Stepdaughter} stepson {Stepson} stepchild {Stepchild} donorConceivedChild {Donor-conceived child} surrogacyChild {Surrogacy child} sister {Sister} brother {Brother} sibling {Sibling} halfSister {Half-sister} halfBrother {Half-brother} halfSibling {Half-sibling} adoptiveSister {Adoptive sister} adoptiveBrother {Adoptive brother} adoptiveSibling {Adoptive sibling} stepsister {Stepsister} stepbrother {Stepbrother} stepsibling {Step-sibling} partner {Partner} formerPartner {Former partner} grandmother {Grandmother} grandfather {Grandfather} grandparent {Grandparent} maternalGrandmother {Maternal grandmother} maternalGrandfather {Maternal grandfather} maternalGrandparent {Maternal grandparent} paternalGrandmother {Paternal grandmother} paternalGrandfather {Paternal grandfather} paternalGrandparent {Paternal grandparent} greatGrandmother {Great-grandmother} greatGrandfather {Great-grandfather} greatGrandparent {Great-grandparent} stepGrandmother {Step-grandmother} stepGrandfather {Step-grandfather} stepGrandparent {Step-grandparent} granddaughter {Granddaughter} grandson {Grandson} grandchild {Grandchild} greatGranddaughter {Great-granddaughter} greatGrandson {Great-grandson} greatGrandchild {Great-grandchild} aunt {Aunt} uncle {Uncle} maternalAunt {Maternal aunt} maternalUncle {Maternal uncle} paternalAunt {Paternal aunt} paternalUncle {Paternal uncle} parentsSibling {Parent’s sibling} greatAunt {Great-aunt} greatUncle {Great-uncle} grandparentsSibling {Grandparent’s sibling} niece {Niece} nephew {Nephew} siblingsChild {Sibling’s child} cousin {Cousin} motherInLaw {Mother-in-law} fatherInLaw {Father-in-law} parentInLaw {Parent-in-law} sisterInLaw {Sister-in-law} brotherInLaw {Brother-in-law} siblingInLaw {Sibling-in-law} daughterInLaw {Daughter-in-law} sonInLaw {Son-in-law} childInLaw {Child-in-law} other {Relative}}',
    description:
      'The kinship word for a family member whose name is not known.',
  },
  'familyPedigree.wording.removeConfirmDescription': {
    id: 'interview.stageWording.familyPedigree.wording.removeConfirmDescription',
    defaultMessage:
      '{hasOthers, select, true {They will be removed from your family tree, along with their connections to other people. {count, plural, one {{names} is connected to you only through them, so will be removed too.} other {{names} are connected to you only through them, so will be removed too.}}} other {They will be removed from your family tree, along with their connections to other people.}}',
    description:
      'The explanation shown before removing a family member, naming anyone who would be removed with them.',
  },
  'familyPedigree.wording.removeConfirmTitle': {
    id: 'interview.stageWording.familyPedigree.wording.removeConfirmTitle',
    defaultMessage: 'Remove {name}?',
    description:
      'The title of the confirmation shown before removing a family member.',
  },
  'familyPedigree.wording.sexAssignedAtBirthLabel': {
    id: 'interview.stageWording.familyPedigree.wording.sexAssignedAtBirthLabel',
    defaultMessage: 'Sex assigned at birth',
    description:
      'The label of the question about the sex a family member was assigned at birth.',
  },
  'familyPedigree.wording.sexChangeClearsCoParentSex': {
    id: 'interview.stageWording.familyPedigree.wording.sexChangeClearsCoParentSex',
    defaultMessage:
      '{who, select, personIsYou {You and {coParent} are both genetic parents of {children}, and {coParent} is also recorded as {sex} at birth. Nobody has two genetic parents of the same sex at birth, so if you save, the sex at birth of {coParent} will be cleared for you to answer again.} childIsYou {This person and {coParent} are both your genetic parents, and {coParent} is also recorded as {sex} at birth. Nobody has two genetic parents of the same sex at birth, so if you save, the sex at birth of {coParent} will be cleared for you to answer again.} coParentIsYou {You and this person are both genetic parents of {children}, and you are also recorded as {sex} at birth. Nobody has two genetic parents of the same sex at birth, so if you save, your own sex at birth will be cleared for you to answer again.} other {This person and {coParent} are both genetic parents of {children}, and {coParent} is also recorded as {sex} at birth. Nobody has two genetic parents of the same sex at birth, so if you save, the sex at birth of {coParent} will be cleared for you to answer again.}}',
    description:
      "What saving a sex at birth changes for a genetic parent of children whose other genetic parent is recorded with that sex at birth: the other's is cleared.",
  },
  'familyPedigree.wording.sexChangeEndsCarrying': {
    id: 'interview.stageWording.familyPedigree.wording.sexChangeEndsCarrying',
    defaultMessage:
      '{who, select, personIsYou {You are recorded as having carried {children}, and nobody recorded as {sex} at birth can carry a pregnancy. If you save, you will no longer be recorded as having carried {children}.} childIsYou {This person is recorded as having carried you, and nobody recorded as {sex} at birth can carry a pregnancy. If you save, they will no longer be recorded as having carried you.} other {This person is recorded as having carried {children}, and nobody recorded as {sex} at birth can carry a pregnancy. If you save, they will no longer be recorded as having carried {children}.}}',
    description:
      'What saving a sex at birth that rules out carrying a pregnancy changes for someone recorded as having carried one: they are no longer recorded as having carried it.',
  },
  'familyPedigree.wording.sharedDonorsLabel': {
    id: 'interview.stageWording.familyPedigree.wording.sharedDonorsLabel',
    defaultMessage:
      '{isYou, select, true {{hasSurrogate, select, true {Do they share any of your donors, or the surrogate who carried you?} other {Do they share any of your donors?}}} other {{hasSurrogate, select, true {Do they share any donors with {name}, or the surrogate who carried {name}?} other {Do they share any donors with {name}?}}}}',
    description:
      'The question asking which donors a new sibling shares, for someone recorded with only egg or sperm donors as parents, and the surrogate who carried them where one is recorded.',
  },
  'familyPedigree.wording.sharedParentCountBoth': {
    id: 'interview.stageWording.familyPedigree.wording.sharedParentCountBoth',
    defaultMessage: 'Both parents',
    description: 'The option that a new sibling shares both parents.',
  },
  'familyPedigree.wording.sharedParentCountLabel': {
    id: 'interview.stageWording.familyPedigree.wording.sharedParentCountLabel',
    defaultMessage:
      '{isYou, select, true {Which parents do they share with you?} other {Which parents do they share with {name}?}}',
    description: 'The question asking which parents a new sibling shares.',
  },
  'familyPedigree.wording.sharedParentEggOnly': {
    id: 'interview.stageWording.familyPedigree.wording.sharedParentEggOnly',
    defaultMessage:
      '{parent, select, egg {{framing, select, gamete {Only the egg parent} other {Only the biological mother}}} other {{framing, select, gamete {Only the sperm parent} other {Only the biological father}}}}',
    description:
      'The option that a new sibling shares only the parent who provided the egg or the sperm.',
  },
  'familyPedigree.wording.sharedParentsNotSibling': {
    id: 'interview.stageWording.familyPedigree.wording.sharedParentsNotSibling',
    defaultMessage:
      '{isYou, select, true {Someone who shares only {chosen} with you is not your sibling. Choose a parent you both share as well, or add them as a child of their own parent instead.} other {Someone who shares only {chosen} with {name} is not their sibling. Choose a parent they both share as well, or add them as a child of their own parent instead.}}',
    description:
      'The error shown when the only parents chosen for a new sibling are a step or social parent, or the surrogate who carried the person, which does not make someone a sibling.',
  },
  'familyPedigree.wording.sharedSurrogateLabel': {
    id: 'interview.stageWording.familyPedigree.wording.sharedSurrogateLabel',
    defaultMessage:
      '{isYou, select, true {Did the surrogate who carried you carry them too?} other {Did the surrogate who carried {name} carry them too?}}',
    description:
      'The question asking whether the surrogate who carried someone with no parents recorded yet carried a new sibling too.',
  },
  'familyPedigree.wording.siblingBiologicalParentLabel': {
    id: 'interview.stageWording.familyPedigree.wording.siblingBiologicalParentLabel',
    defaultMessage: 'Which of them is the sibling’s biological parent?',
    description:
      'The question asking which of the parents a new biological sibling shares is their biological parent, when only one of them could be.',
  },
  'familyPedigree.wording.siblingKindLabel': {
    id: 'interview.stageWording.familyPedigree.wording.siblingKindLabel',
    defaultMessage: 'To the parents they share, are they…',
    description:
      'The question asking how a new sibling is related to the parents chosen.',
  },
  'familyPedigree.wording.siblingOtherBiologicalParentLabel': {
    id: 'interview.stageWording.familyPedigree.wording.siblingOtherBiologicalParentLabel',
    defaultMessage: 'Which of them is the sibling’s other biological parent?',
    description:
      'The question asking which of the parents a new biological sibling shares is their other biological parent, when the first answer still leaves more than one.',
  },
  'familyPedigree.wording.siblingTwinFraternal': {
    id: 'interview.stageWording.familyPedigree.wording.siblingTwinFraternal',
    defaultMessage: 'Yes, fraternal (non-identical) twins',
    description:
      'The option that a new sibling is a fraternal twin of the person they are added to.',
  },
  'familyPedigree.wording.siblingTwinHint': {
    id: 'interview.stageWording.familyPedigree.wording.siblingTwinHint',
    defaultMessage: 'Answer yes for triplets and other multiple births too.',
    description:
      'The hint under the question asking whether a new sibling is a twin.',
  },
  'familyPedigree.wording.siblingTwinIdentical': {
    id: 'interview.stageWording.familyPedigree.wording.siblingTwinIdentical',
    defaultMessage: 'Yes, identical twins',
    description:
      'The option that a new sibling is an identical twin of the person they are added to.',
  },
  'familyPedigree.wording.siblingTwinLabel': {
    id: 'interview.stageWording.familyPedigree.wording.siblingTwinLabel',
    defaultMessage:
      '{isYou, select, true {Are they your twin?} other {Are they a twin of {name}?}}',
    description:
      'The question asking whether a new sibling is a twin of the person they are added to.',
  },
  'familyPedigree.wording.siblingTwinNo': {
    id: 'interview.stageWording.familyPedigree.wording.siblingTwinNo',
    defaultMessage: 'No',
    description:
      'The option that a new sibling is not a twin of the person they are added to.',
  },
  'familyPedigree.wording.siblingTwinUnknown': {
    id: 'interview.stageWording.familyPedigree.wording.siblingTwinUnknown',
    defaultMessage: 'Yes, but I don’t know if they are identical',
    description:
      'The option that a new sibling is a twin of the person they are added to, not known to be identical or fraternal.',
  },
  'familyPedigree.wording.standInPlaceTaken': {
    id: 'interview.stageWording.familyPedigree.wording.standInPlaceTaken',
    defaultMessage:
      '{anchorIsYou, select, true {{count, plural, one {{names} has the same unnamed parent as you, so this person becomes their parent too.} other {{names} have the same unnamed parent as you, so this person becomes their parent too.}}} other {{count, plural, one {{names} has the same unnamed parent as {anchor}, so this person becomes their parent too.} other {{names} have the same unnamed parent as {anchor}, so this person becomes their parent too.}}}}',
    description:
      'The hint under the question asking which siblings a new biological parent or donor is also the parent of, naming the siblings who share the unnamed parent they take the place of.',
  },
  'familyPedigree.wording.stillTogetherLabel': {
    id: 'interview.stageWording.familyPedigree.wording.stillTogetherLabel',
    defaultMessage:
      '{named, select, true {{personIsYou, select, true {Are you still together with {partner}?} other {{partnerIsYou, select, true {Are you still together?} other {Are they still together with {partner}?}}}}} other {Are they still together?}}',
    description:
      'The yes or no question asking whether a partnership is still current.',
  },
  'familyPedigree.wording.twinZygosityLabel': {
    id: 'interview.stageWording.familyPedigree.wording.twinZygosityLabel',
    defaultMessage:
      '{who, select, personIsYou {Are you and {twin} identical twins?} twinIsYou {Are {name} and you identical twins?} other {Are {name} and {twin} identical twins?}}',
    description:
      'The question asking whether a family member and one of their twins are identical twins.',
  },
  'familyPedigree.wording.twinsHint': {
    id: 'interview.stageWording.familyPedigree.wording.twinsHint',
    defaultMessage: 'Include triplets and other multiple births.',
    description:
      'The hint under the question asking which of a family member’s siblings are their twins.',
  },
  'familyPedigree.wording.twinsLabel': {
    id: 'interview.stageWording.familyPedigree.wording.twinsLabel',
    defaultMessage:
      '{isYou, select, true {Are any of these siblings your twins?} other {Are any of these siblings twins with {name}?}}',
    description:
      'The question asking which of a family member’s siblings are their twins.',
  },
  'familyPedigree.wording.unavailableAncestor': {
    id: 'interview.stageWording.familyPedigree.wording.unavailableAncestor',
    defaultMessage:
      '{who, select, parentIsYou {You cannot be a parent of {child}, who is already one of your ancestors.} childIsYou {{parent} cannot be your parent, because you are already one of their ancestors.} other {{parent} cannot be a parent of {child}, who is already one of their ancestors.}}',
    description:
      'Why someone cannot be made a parent of one of their own ancestors, shown under the choice it makes unavailable.',
  },
  'familyPedigree.wording.unavailableBothSameSex': {
    id: 'interview.stageWording.familyPedigree.wording.unavailableBothSameSex',
    defaultMessage:
      '{firstIsYou, select, true {{count, plural, one {{answers} is unavailable because you and {second} are both recorded as {sex} at birth, so you cannot both be the child’s genetic parents. To choose it, first change one of your sexes at birth.} other {{answers} are unavailable because you and {second} are both recorded as {sex} at birth, so you cannot both be the child’s genetic parents. To choose one, first change one of your sexes at birth.}}} other {{count, plural, one {{answers} is unavailable because {first} and {second} are both recorded as {sex} at birth, so they cannot both be the child’s genetic parents. To choose it, first change the sex at birth of one of them.} other {{answers} are unavailable because {first} and {second} are both recorded as {sex} at birth, so they cannot both be the child’s genetic parents. To choose one, first change the sex at birth of one of them.}}}}',
    description:
      'Why two parents recorded with the same sex at birth cannot both be a new child’s genetic parents, naming the answers it makes unavailable.',
  },
  'familyPedigree.wording.unavailableCannotCarry': {
    id: 'interview.stageWording.familyPedigree.wording.unavailableCannotCarry',
    defaultMessage:
      '{who, select, you {{count, plural, one {{answers} is unavailable because you are recorded as {sex} at birth, so you cannot have carried a pregnancy. To choose it, first change your sex at birth.} other {{answers} are unavailable because you are recorded as {sex} at birth, so you cannot have carried a pregnancy. To choose one, first change your sex at birth.}}} this {{count, plural, one {{answers} is unavailable because this person is recorded as {sex} at birth, so they cannot have carried a pregnancy. To choose it, first change their sex at birth.} other {{answers} are unavailable because this person is recorded as {sex} at birth, so they cannot have carried a pregnancy. To choose one, first change their sex at birth.}}} other {{count, plural, one {{answers} is unavailable because {name} is recorded as {sex} at birth, so they cannot have carried a pregnancy. To choose it, first change their sex at birth.} other {{answers} are unavailable because {name} is recorded as {sex} at birth, so they cannot have carried a pregnancy. To choose one, first change their sex at birth.}}}}',
    description:
      'Why someone recorded as male at birth cannot be recorded as having carried a pregnancy, naming the answers it makes unavailable.',
  },
  'familyPedigree.wording.unavailableCarried': {
    id: 'interview.stageWording.familyPedigree.wording.unavailableCarried',
    defaultMessage:
      '{who, select, personIsYou {{sex} is unavailable because you are recorded as having carried {children}, and nobody recorded as {sex} at birth can carry a pregnancy. To choose it, first change how you are connected to {children}.} childIsYou {{sex} is unavailable because this person is recorded as having carried you, and nobody recorded as {sex} at birth can carry a pregnancy. To choose it, first change how they are connected to you.} other {{sex} is unavailable because this person is recorded as having carried {children}, and nobody recorded as {sex} at birth can carry a pregnancy. To choose it, first change how they are connected to {children}.}}',
    description:
      'Why a sex at birth is unavailable for someone recorded as having carried the pregnancy of the children named.',
  },
  'familyPedigree.wording.unavailableCarrierRecorded': {
    id: 'interview.stageWording.familyPedigree.wording.unavailableCarrierRecorded',
    defaultMessage:
      '{who, select, carrierIsYou {{count, plural, one {{answers} is unavailable because you are recorded as having carried {child}, and only one person carries a pregnancy. To choose it, first change how you are connected to {child}.} other {{answers} are unavailable because you are recorded as having carried {child}, and only one person carries a pregnancy. To choose one, first change how you are connected to {child}.}}} childIsYou {{count, plural, one {{answers} is unavailable because {carrier} is recorded as having carried you, and only one person carries a pregnancy. To choose it, first change how {carrier} is connected to you.} other {{answers} are unavailable because {carrier} is recorded as having carried you, and only one person carries a pregnancy. To choose one, first change how {carrier} is connected to you.}}} other {{count, plural, one {{answers} is unavailable because {carrier} is recorded as having carried {child}, and only one person carries a pregnancy. To choose it, first change how {carrier} is connected to {child}.} other {{answers} are unavailable because {carrier} is recorded as having carried {child}, and only one person carries a pregnancy. To choose one, first change how {carrier} is connected to {child}.}}}}',
    description:
      'Why answers that would record someone else as having carried a child are unavailable: someone already did. Names the answers it makes unavailable.',
  },
  'familyPedigree.wording.unavailableGeneticParentsFull': {
    id: 'interview.stageWording.familyPedigree.wording.unavailableGeneticParentsFull',
    defaultMessage:
      '{who, select, childIsYou {{count, plural, one {{answers} is unavailable because you already have two genetic parents recorded, {first} and {second}. To choose it, first change how one of them is connected to you.} other {{answers} are unavailable because you already have two genetic parents recorded, {first} and {second}. To choose one, first change how one of them is connected to you.}}} includesYou {{count, plural, one {{answers} is unavailable because {child} already has two genetic parents recorded, you and {second}. To choose it, first change how one of you is connected to {child}.} other {{answers} are unavailable because {child} already has two genetic parents recorded, you and {second}. To choose one, first change how one of you is connected to {child}.}}} other {{count, plural, one {{answers} is unavailable because {child} already has two genetic parents recorded, {first} and {second}. To choose it, first change how one of them is connected to {child}.} other {{answers} are unavailable because {child} already has two genetic parents recorded, {first} and {second}. To choose one, first change how one of them is connected to {child}.}}}}',
    description:
      'Why nobody else can be a genetic parent of a child who already has two, naming the answers it makes unavailable.',
  },
  'familyPedigree.wording.unavailableSameSexGeneticParent': {
    id: 'interview.stageWording.familyPedigree.wording.unavailableSameSexGeneticParent',
    defaultMessage:
      '{who, select, coParentIsYou {{count, plural, one {{answers} is unavailable because you are recorded as {sex} at birth and are a genetic parent of {child}, who cannot have two genetic parents of the same sex at birth. To choose it, first change your sex at birth or how you are connected to {child}.} other {{answers} are unavailable because you are recorded as {sex} at birth and are a genetic parent of {child}, who cannot have two genetic parents of the same sex at birth. To choose one, first change your sex at birth or how you are connected to {child}.}}} childIsYou {{count, plural, one {{answers} is unavailable because {coParent}, your genetic parent, is recorded as {sex} at birth, and you cannot have two genetic parents of the same sex at birth. To choose it, first change the sex at birth of {coParent} or how they are connected to you.} other {{answers} are unavailable because {coParent}, your genetic parent, is recorded as {sex} at birth, and you cannot have two genetic parents of the same sex at birth. To choose one, first change the sex at birth of {coParent} or how they are connected to you.}}} other {{count, plural, one {{answers} is unavailable because {coParent}, a genetic parent of {child}, is recorded as {sex} at birth, and {child} cannot have two genetic parents of the same sex at birth. To choose it, first change the sex at birth of {coParent} or how they are connected to {child}.} other {{answers} are unavailable because {coParent}, a genetic parent of {child}, is recorded as {sex} at birth, and {child} cannot have two genetic parents of the same sex at birth. To choose one, first change the sex at birth of {coParent} or how they are connected to {child}.}}}}',
    description:
      'Why someone cannot be a genetic parent of a child whose genetic parent recorded already has the same sex at birth, naming the answers it makes unavailable.',
  },
  'familyPedigree.wording.you': {
    id: 'interview.stageWording.familyPedigree.wording.you',
    defaultMessage: 'You',
    description:
      "The label shown inside the participant's own symbol in the family tree.",
  },
  'familyPedigree.wording.zygosityFraternal': {
    id: 'interview.stageWording.familyPedigree.wording.zygosityFraternal',
    defaultMessage: 'No, fraternal (non-identical)',
    description: 'The option that two twins are fraternal twins.',
  },
  'familyPedigree.wording.zygosityIdentical': {
    id: 'interview.stageWording.familyPedigree.wording.zygosityIdentical',
    defaultMessage: 'Yes, identical',
    description: 'The option that two twins are identical twins.',
  },
  'finishSession.finishConfirmation': {
    id: 'interview.stageWording.finishSession.finishConfirmation',
    defaultMessage: 'Are you sure you want to finish the interview?',
    description:
      'The question the Finish button asks before the interview ends.',
  },
  'finishSession.finishFailed': {
    id: 'interview.stageWording.finishSession.finishFailed',
    defaultMessage:
      'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
    description: 'What the interview says when it could not be ended.',
  },
  'finishSession.finishLabel': {
    id: 'interview.stageWording.finishSession.finishLabel',
    defaultMessage: 'Finish',
    description:
      "The button that ends the interview, and the confirmation's own button.",
  },
  'geospatial.outsideAreasLabel': {
    id: 'interview.stageWording.geospatial.outsideAreasLabel',
    defaultMessage: 'Outside Selectable Areas',
    description:
      'The label of the button that picks a location outside the selectable areas.',
  },
  'languageChooser.title': {
    id: 'interview.stageWording.languageChooser.title',
    defaultMessage: 'Choose a language',
    description:
      'The heading over the languages a participant chooses between.',
  },
  'nameGenerator.maxNodesNotice': {
    id: 'interview.stageWording.nameGenerator.maxNodesNotice',
    defaultMessage:
      'You have completed this task. Click the next arrow to continue.',
    description: 'The notice once a maximum is reached: the stage is complete.',
  },
  'nameGenerator.minNodesNotice': {
    id: 'interview.stageWording.nameGenerator.minNodesNotice',
    defaultMessage:
      '{count, plural, one {You must create at least # item before you can continue.} other {You must create at least # items before you can continue.}}',
    description:
      "The notice that says how many people are still needed. Each language's message counts with `#` rather than a number format, which the schema does not allow, and each plural form says the number in its own words.",
  },
  'nameGeneratorQuickAdd.addNamePlaceholder': {
    id: 'interview.stageWording.nameGeneratorQuickAdd.addNamePlaceholder',
    defaultMessage: 'Type a name, then press Enter',
    description:
      'The name field that adds a node, before anything is typed in it.',
  },
  'nameGeneratorRoster.allAddedNotice': {
    id: 'interview.stageWording.nameGeneratorRoster.allAddedNotice',
    defaultMessage: 'There is nothing left to add from this list.',
    description: 'The notice once everything the roster offers has been added.',
  },
  'nameGeneratorRoster.panelTitle': {
    id: 'interview.stageWording.nameGeneratorRoster.panelTitle',
    defaultMessage: 'Available to add',
    description:
      "The heading above the people a Name Generator Roster offers, in each language Network Canvas's apps ship in.",
  },
  'nameGeneratorRoster.unnamedLabel': {
    id: 'interview.stageWording.nameGeneratorRoster.unnamedLabel',
    defaultMessage: 'Unnamed {count}',
    description:
      'The label of an item the roster has no name for, numbered to tell unnamed items apart.',
  },
  'narrative.attributesHeading': {
    id: 'interview.stageWording.narrative.attributesHeading',
    defaultMessage: 'Attributes',
    description:
      'The legend heading over the attributes a preset can highlight.',
  },
  'narrative.groupsHeading': {
    id: 'interview.stageWording.narrative.groupsHeading',
    defaultMessage: 'Groups',
    description: "The Groups tool's name, shown in its tooltip.",
  },
  'narrative.linksHeading': {
    id: 'interview.stageWording.narrative.linksHeading',
    defaultMessage: 'Links',
    description:
      'The legend heading over the connection types a preset displays.',
  },
  'narrativePedigree.conditionText.selectCondition': {
    id: 'interview.stageWording.narrativePedigree.conditionText.selectCondition',
    defaultMessage: 'Select a condition',
    description:
      "The condition menu's text while no condition is chosen, and its choice for choosing none.",
  },
  'narrativePedigree.conditionText.snapshotCondition': {
    id: 'interview.stageWording.narrativePedigree.conditionText.snapshotCondition',
    defaultMessage: '{title}: {condition}',
    description:
      "The snapshot's heading for a condition: the stage's title, then the condition.",
  },
  'narrativePedigree.conditionText.snapshotInheritance': {
    id: 'interview.stageWording.narrativePedigree.conditionText.snapshotInheritance',
    defaultMessage: '{title}: {condition} — inheritance for {name}',
    description: "The snapshot's heading for a condition focused on a person.",
  },
  'narrativePedigree.saveSnapshot': {
    id: 'interview.stageWording.narrativePedigree.saveSnapshot',
    defaultMessage: 'Save snapshot',
    description: 'The label of the button that saves an image of the pedigree.',
  },
});
