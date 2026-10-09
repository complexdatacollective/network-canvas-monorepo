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
      'Label shown inside the participant’s own symbol in their family tree.',
  },
  relativeTerm: {
    id: 'interview.familyPedigree.relativeTerm',
    defaultMessage:
      '{term, select, mother {Mother} father {Father} parent {Parent} eggParent {Egg parent} spermParent {Sperm parent} biologicalMother {Bio\u00ADlogical mother} biologicalFather {Bio\u00ADlogical father} adoptiveMother {Adoptive mother} adoptiveFather {Adoptive father} adoptiveParent {Adoptive parent} stepmother {Step\u00ADmother} stepfather {Step\u00ADfather} stepparent {Step-parent} eggDonor {Egg donor} spermDonor {Sperm donor} donor {Donor} surrogate {Surro\u00ADgate} daughter {Daughter} son {Son} child {Child} stepdaughter {Step\u00ADdaughter} stepson {Stepson} stepchild {Stepchild} donorConceivedChild {Donor-conceived child} surrogacyChild {Surro\u00ADgacy child} sister {Sister} brother {Brother} sibling {Sibling} halfSister {Half-sister} halfBrother {Half-brother} halfSibling {Half-sibling} adoptiveSister {Adoptive sister} adoptiveBrother {Adoptive brother} adoptiveSibling {Adoptive sibling} stepsister {Step\u00ADsister} stepbrother {Step\u00ADbrother} stepsibling {Step-sibling} partner {Partner} formerPartner {Former partner} grandmother {Grand\u00ADmother} grandfather {Grand\u00ADfather} grandparent {Grand\u00ADparent} maternalGrandmother {Maternal grand\u00ADmother} maternalGrandfather {Maternal grand\u00ADfather} maternalGrandparent {Maternal grand\u00ADparent} paternalGrandmother {Paternal grand\u00ADmother} paternalGrandfather {Paternal grand\u00ADfather} paternalGrandparent {Paternal grand\u00ADparent} greatGrandmother {Great-grand\u00ADmother} greatGrandfather {Great-grand\u00ADfather} greatGrandparent {Great-grand\u00ADparent} stepGrandmother {Step-grand\u00ADmother} stepGrandfather {Step-grand\u00ADfather} stepGrandparent {Step-grand\u00ADparent} granddaughter {Grand\u00ADdaughter} grandson {Grandson} grandchild {Grand\u00ADchild} greatGranddaughter {Great-grand\u00ADdaughter} greatGrandson {Great-grandson} greatGrandchild {Great-grand\u00ADchild} aunt {Aunt} uncle {Uncle} maternalAunt {Maternal aunt} maternalUncle {Maternal uncle} paternalAunt {Paternal aunt} paternalUncle {Paternal uncle} parentsSibling {Parent’s sibling} greatAunt {Great-aunt} greatUncle {Great-uncle} grandparentsSibling {Grand\u00ADparent’s sibling} niece {Niece} nephew {Nephew} siblingsChild {Sibling’s child} cousin {Cousin} motherInLaw {Mother-in-law} fatherInLaw {Father-in-law} parentInLaw {Parent-in-law} sisterInLaw {Sister-in-law} brotherInLaw {Brother-in-law} siblingInLaw {Sibling-in-law} daughterInLaw {Daugh\u00ADter-in-law} sonInLaw {Son-in-law} childInLaw {Child-in-law} other {Relative}}',
    description:
      'Label for a family member whose name is not known: their kinship to the participant (for example, the participant’s maternal grandmother). Depending on the study, either gendered words (mother, aunt) or words that do not assume gender (egg parent, parent’s sibling) are used. Also saved as the name of a family member the participant did not name, when they leave this part of the interview, so they can be recognised later. Labels sit inside a small symbol, so each long word carries a soft hyphen (U+00AD, invisible unless the word breaks there) at a syllable break, as between “Grand” and “mother” in Grandmother, or “Step” and “daughter” in Stepdaughter: the word breaks there, with a hyphen, only when it does not fit on one line, and otherwise reads whole. Place your own soft hyphens at sensible syllable breaks in any word longer than about nine letters in your language, rather than copying these positions; a word without one may break between any two letters. Soft hyphens are removed from the label saved as a name.',
  },
  relativeOf: {
    id: 'interview.familyPedigree.relativeOf',
    defaultMessage:
      '{owner}’s {term, select, mother {mother} father {father} parent {parent} eggParent {egg parent} spermParent {sperm parent} biologicalMother {bio\u00ADlogical mother} biologicalFather {bio\u00ADlogical father} adoptiveMother {adoptive mother} adoptiveFather {adoptive father} adoptiveParent {adoptive parent} stepmother {step\u00ADmother} stepfather {step\u00ADfather} stepparent {step-parent} eggDonor {egg donor} spermDonor {sperm donor} donor {donor} surrogate {surro\u00ADgate} daughter {daughter} son {son} child {child} stepdaughter {step\u00ADdaughter} stepson {stepson} stepchild {stepchild} donorConceivedChild {donor-conceived child} surrogacyChild {surro\u00ADgacy child} sister {sister} brother {brother} sibling {sibling} halfSister {half-sister} halfBrother {half-brother} halfSibling {half-sibling} adoptiveSister {adoptive sister} adoptiveBrother {adoptive brother} adoptiveSibling {adoptive sibling} stepsister {step\u00ADsister} stepbrother {step\u00ADbrother} stepsibling {step-sibling} partner {partner} formerPartner {former partner} grandmother {grand\u00ADmother} grandfather {grand\u00ADfather} grandparent {grand\u00ADparent} maternalGrandmother {maternal grand\u00ADmother} maternalGrandfather {maternal grand\u00ADfather} maternalGrandparent {maternal grand\u00ADparent} paternalGrandmother {paternal grand\u00ADmother} paternalGrandfather {paternal grand\u00ADfather} paternalGrandparent {paternal grand\u00ADparent} greatGrandmother {great-grand\u00ADmother} greatGrandfather {great-grand\u00ADfather} greatGrandparent {great-grand\u00ADparent} stepGrandmother {step-grand\u00ADmother} stepGrandfather {step-grand\u00ADfather} stepGrandparent {step-grand\u00ADparent} granddaughter {grand\u00ADdaughter} grandson {grandson} grandchild {grand\u00ADchild} greatGranddaughter {great-grand\u00ADdaughter} greatGrandson {great-grandson} greatGrandchild {great-grand\u00ADchild} aunt {aunt} uncle {uncle} maternalAunt {maternal aunt} maternalUncle {maternal uncle} paternalAunt {paternal aunt} paternalUncle {paternal uncle} parentsSibling {parent’s sibling} greatAunt {great-aunt} greatUncle {great-uncle} grandparentsSibling {grand\u00ADparent’s sibling} niece {niece} nephew {nephew} siblingsChild {sibling’s child} cousin {cousin} motherInLaw {mother-in-law} fatherInLaw {father-in-law} parentInLaw {parent-in-law} sisterInLaw {sister-in-law} brotherInLaw {brother-in-law} siblingInLaw {sibling-in-law} daughterInLaw {daugh\u00ADter-in-law} sonInLaw {son-in-law} childInLaw {child-in-law} other {relative}}',
    description:
      'Label for a family member whose name is not known and who has no everyday kinship word for their relationship to the participant, described through one relative of theirs: owner is that relative’s name or kinship word (for example “Isaac” or “Cousin”), and term is how this person is related to that relative, which can be any of the kinship words (for example “Isaac’s grandfather” or “Cousin’s son”). Translate the possessive grammar as a whole; owner stays verbatim. Also saved as the name of a family member the participant did not name. As in the kinship words label, each long word carries a soft hyphen (U+00AD) at a syllable break where it may break inside the small symbol; place your own at sensible syllable breaks in long words in your language. Soft hyphens are removed from the label saved as a name.',
  },
  numberedRelative: {
    id: 'interview.familyPedigree.numberedRelative',
    defaultMessage: '{label} {number, number}',
    description:
      'Tells apart several family members who would otherwise share a label (for example two unnamed children). label is the already translated label; number is their position in the order they were added. Shown in the family tree, and saved as the name of an unnamed family member when nothing else tells them apart.',
  },
  generatedLabelPartnerOf: {
    id: 'interview.familyPedigree.generatedLabelPartnerOf',
    defaultMessage:
      '{isYou, select, true {{term} (your partner)} other {{term} (partner of {name})}}',
    description:
      'Label for a family member the participant did not name, when their kinship word alone is shared with someone else. Shown inside their symbol in the family tree, and saved as their name so later parts of the interview show the same label. term is the already translated kinship word, such as “Sister” or “Family member”; name is the name of their partner, or that partner’s own kinship word, such as “Tom” or “Uncle”. The first form is used when their partner is the participant.',
  },
  generatedLabelFormerPartnerOf: {
    id: 'interview.familyPedigree.generatedLabelFormerPartnerOf',
    defaultMessage:
      '{isYou, select, true {{term} (your former partner)} other {{term} (former partner of {name})}}',
    description:
      'Label for a family member the participant did not name, when their kinship word alone is shared with someone else and they are told apart by a partnership that has ended. Shown inside their symbol in the family tree, and saved as their name so later parts of the interview show the same label. term is the already translated kinship word, such as “Sister” or “Family member”; name is the name of their former partner, or that person’s own kinship word, such as “Tom” or “Uncle”. The first form is used when their former partner is the participant.',
  },
  generatedLabelParentOf: {
    id: 'interview.familyPedigree.generatedLabelParentOf',
    defaultMessage:
      '{isYou, select, true {{term} (your parent)} other {{term} (parent of {name})}}',
    description:
      'Label for a family member the participant did not name, when their kinship word alone is shared with someone else. Shown inside their symbol in the family tree, and saved as their name so later parts of the interview show the same label. term is the already translated kinship word, such as “Grandmother”; name is the name of their child, or that child’s own kinship word, such as “Julie” or “Mother”. The first form is used when their child is the participant.',
  },
  generatedLabelChildOf: {
    id: 'interview.familyPedigree.generatedLabelChildOf',
    defaultMessage:
      '{isYou, select, true {{term} (your child)} other {{term} (child of {name})}}',
    description:
      'Label for a family member the participant did not name, when their kinship word alone is shared with someone else. Shown inside their symbol in the family tree, and saved as their name so later parts of the interview show the same label. term is the already translated kinship word, such as “Half-sister”; name is the name of their parent, or that parent’s own kinship word, such as “Ana” or “Stepmother”. The first form is used when their parent is the participant.',
  },
  generatedLabelSiblingOf: {
    id: 'interview.familyPedigree.generatedLabelSiblingOf',
    defaultMessage:
      '{isYou, select, true {{term} (your sibling)} other {{term} (sibling of {name})}}',
    description:
      'Label for a family member the participant did not name, when their kinship word alone is shared with someone else. Shown inside their symbol in the family tree, and saved as their name so later parts of the interview show the same label. term is the already translated kinship word, such as “Cousin”; name is the name of their brother or sister, or that sibling’s own kinship word, such as “Sam” or “Niece”. The first form is used when their sibling is the participant.',
  },
  familyMember: {
    id: 'interview.familyPedigree.familyMember',
    defaultMessage: 'Family member',
    description:
      'Label for a family member whose name is not known and who is not connected to the participant in the family tree. Also saved as their name when they leave this part of the interview, so they can be recognised later.',
  },
  personAccessibleName: {
    id: 'interview.familyPedigree.personAccessibleName',
    defaultMessage:
      '{isYou, select, true {You} other {{name}}}{adopted, select, true {, adopted} other {}}{missing, select, true {, some details missing} other {}}',
    description:
      'Accessible name of a family member’s symbol in the family tree. {name} is the person’s name, exactly as the participant typed it, or, when it is not known, how they are related to the participant. The second part is read out when the person was adopted, which the tree shows by drawing brackets around their symbol. The third part is read out when required details about the person have not been given yet.',
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
      'Title of the side panel used to add a parent of a family member. {name} is that family member’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  addSiblingTitle: {
    id: 'interview.familyPedigree.addSiblingTitle',
    defaultMessage:
      '{isYou, select, true {Add your sibling} other {Add a sibling of {name}}}',
    description:
      'Title of the side panel used to add a sibling of a family member. {name} is that family member’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  addPartnerTitle: {
    id: 'interview.familyPedigree.addPartnerTitle',
    defaultMessage:
      '{isYou, select, true {Add your partner} other {Add a partner of {name}}}',
    description:
      'Title of the side panel used to add a partner of a family member. {name} is that family member’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  addChildTitle: {
    id: 'interview.familyPedigree.addChildTitle',
    defaultMessage:
      '{isYou, select, true {Add your child} other {Add a child of {name}}}',
    description:
      'Title of the side panel used to add a child of a family member. {name} is that family member’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  editTitle: {
    id: 'interview.familyPedigree.editTitle',
    defaultMessage: '{isYou, select, true {About you} other {About {name}}}',
    description:
      'Title of the side panel showing the details about a family member. {name} is that family member’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  aboutThisPerson: {
    id: 'interview.familyPedigree.aboutThisPerson',
    defaultMessage:
      '{isYou, select, true {About you} other {About this person}}',
    description:
      'Heading above the questions about the person themselves (their name, gender identity and sex assigned at birth) in the side panel for adding or editing a family member. On the participant’s own panel, where their name is not asked, it addresses them.',
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
      'Yes/no question in the details panel about one of the family member’s partnerships: whether it is current, rather than separated or ended. {partner} is the partner’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  parentLinkKindLabel: {
    id: 'interview.familyPedigree.parentLinkKindLabel',
    defaultMessage:
      '{parentIsYou, select, true {You are their…} other {{personIsYou, select, true {{parent} is your…} other {{parent} is their…}}}}',
    description:
      'Question in the details panel about one of the family member’s parents, as the start of a sentence that the chosen option completes: “Father is your… Adoptive parent”. {parent} is the parent’s name, or how they are related to the participant (such as “Father”) when unnamed; “their” is the family member whose details are open. Options are the kinds of parent: “Biological parent”, “Adoptive parent”, “Step or social parent”, “Egg or sperm donor”, “Surrogate”.',
  },
  parentCarriedLabel: {
    id: 'interview.familyPedigree.parentCarriedLabel',
    defaultMessage:
      '{parentIsYou, select, true {Did you carry the pregnancy?} other {Did {parent} carry the pregnancy?}}',
    description:
      'Yes/no question in the details panel: whether this parent, of any kind but a surrogate (biological, adoptive, step or social, or a donor), was pregnant with the family member. {parent} is the parent’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  moreAboutThisPerson: {
    id: 'interview.familyPedigree.moreAboutThisPerson',
    defaultMessage:
      '{isYou, select, true {More about you} other {More about this person}}',
    description:
      'Heading above the study’s own additional questions about a family member, in the side panel for adding or editing them. On the participant’s own panel it addresses them.',
  },
  nameLabel: {
    id: 'interview.familyPedigree.nameLabel',
    defaultMessage: 'Name (optional)',
    description:
      'Label of the field for a family member’s name, which the participant may not know.',
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
  dontKnow: {
    id: 'interview.familyPedigree.dontKnow',
    defaultMessage: 'Don’t know',
    description:
      'Answer option for a question about a family member, when the participant does not know.',
  },
  parentKindLabel: {
    id: 'interview.familyPedigree.parentKindLabel',
    defaultMessage: 'What kind of parent are they?',
    description:
      'Question in the side panel for adding a parent: how the new person is a parent of the selected family member.',
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
  childKindDonor: {
    id: 'interview.familyPedigree.childKind.donor',
    defaultMessage: 'A child conceived with an egg or sperm they donated',
    description:
      'Option: a child conceived with an egg or sperm the person donated, who is raised by someone else.',
  },
  childKindSurrogate: {
    id: 'interview.familyPedigree.childKind.surrogate',
    defaultMessage: 'A child they carried as a surrogate',
    description:
      'Option: a child the person carried as a surrogate for someone else.',
  },
  carriedPregnancyLabel: {
    id: 'interview.familyPedigree.carriedPregnancyLabel',
    defaultMessage: 'Did this parent carry the pregnancy?',
    description:
      'Yes/no question in the side panel for adding a parent of any kind but a surrogate (biological, adoptive, step or social, or a donor): whether they were pregnant with the child.',
  },
  carriedSiblingsPregnancyLabel: {
    id: 'interview.familyPedigree.carriedSiblingsPregnancyLabel',
    defaultMessage:
      '{count, plural, =1 {{isYou, select, true {Was this parent pregnant with you?} other {Was this parent pregnant with “{name}”?}}} other {Was this parent pregnant with each of the # people chosen above who have nobody recorded as having carried them?}}',
    description:
      'Yes/no question in the side panel for adding a parent of any kind but a surrogate. It is asked when the person the parent is added for already has someone recorded as having carried their pregnancy, about the people chosen in “Are they also the parent of…” who have nobody recorded yet. count is how many such people there are; name is the one person’s name, or how they are related to the participant when unnamed; isYou is true when that person is the participant. It may be left unanswered.',
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
  showWholeFamily: {
    id: 'interview.familyPedigree.showWholeFamily',
    defaultMessage: 'Show the whole family',
    description:
      'Toolbar button that zooms and moves the family tree so everyone in it fits on screen.',
  },
  framingControlLabel: {
    id: 'interview.familyPedigree.framingControlLabel',
    defaultMessage: 'Wording',
    description:
      'Short label of the toolbar button, shown beside its icon, that opens the choice of words used to describe family members (such as “mother” or “egg parent”). Keep it brief.',
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
  siblingBiologicalParentLabel: {
    id: 'interview.familyPedigree.siblingBiologicalParentLabel',
    defaultMessage: 'Which of them is the sibling’s biological parent?',
    description:
      'Question in the side panel for adding a biological sibling, asked when the sibling shares two parents of whom only one could be their biological parent (for example two mothers, both recorded as female at birth). Options are those parents, by name or by how they are related to the participant.',
  },
  sharedDonorsLabel: {
    id: 'interview.familyPedigree.sharedDonorsLabel',
    defaultMessage:
      '{isYou, select, true {Do they share any of your donors?} other {Do they share any of “{name}”’s donors?}}',
    description:
      'Question in the side panel for adding a sibling to someone recorded with only egg or sperm donors as parents. Options are those donors, by name or by how they are related to the participant; any number, or none, may be chosen. name is the person the sibling is added to.',
  },
  carrierLabel: {
    id: 'interview.familyPedigree.carrierLabel',
    defaultMessage: 'Who carried the pregnancy?',
    description:
      'Question in the side panel for adding a child or a sibling. Options are the new person’s parents of any kind (biological, adoptive, step or social, or a donor), by name or by how they are related to the participant, or someone else / not known.',
  },
  carrierUnknown: {
    id: 'interview.familyPedigree.carrierUnknown',
    defaultMessage: 'Someone else, or I don’t know',
    description:
      'Option: none of the parents offered carried the pregnancy, or the participant does not know.',
  },
  siblingTwinLabel: {
    id: 'interview.familyPedigree.siblingTwinLabel',
    defaultMessage:
      '{isYou, select, true {Are they your twin?} other {Are they “{name}”’s twin?}}',
    description:
      'Question in the side panel for adding a sibling: whether the new sibling and the person they are added to were born of the same pregnancy. name is the person the sibling is added to. Options are "No", and whether they are identical, fraternal, or the participant does not know which.',
  },
  siblingTwinHint: {
    id: 'interview.familyPedigree.siblingTwinHint',
    defaultMessage: 'Answer yes for triplets and other multiple births too.',
    description:
      'Hint under the question asking whether a new sibling is a twin of the person they are added to.',
  },
  siblingTwinNo: {
    id: 'interview.familyPedigree.siblingTwinNo',
    defaultMessage: 'No',
    description:
      'Option: the new sibling is not a twin of the person they are added to.',
  },
  siblingTwinIdentical: {
    id: 'interview.familyPedigree.siblingTwinIdentical',
    defaultMessage: 'Yes, identical twins',
    description:
      'Option: the new sibling is an identical twin of the person they are added to.',
  },
  siblingTwinFraternal: {
    id: 'interview.familyPedigree.siblingTwinFraternal',
    defaultMessage: 'Yes, fraternal (non-identical) twins',
    description:
      'Option: the new sibling is a fraternal (non-identical) twin of the person they are added to.',
  },
  siblingTwinUnknown: {
    id: 'interview.familyPedigree.siblingTwinUnknown',
    defaultMessage: 'Yes, but I don’t know if they are identical',
    description:
      'Option: the new sibling is a twin of the person they are added to, and the participant does not know whether they are identical or fraternal twins.',
  },
  twinsLabel: {
    id: 'interview.familyPedigree.twinsLabel',
    defaultMessage:
      '{isYou, select, true {Which of your siblings, if any, are your twins?} other {Which of “{name}”’s siblings, if any, are their twins?}}',
    description:
      'Question in the panel showing a family member’s details. Options are the person’s siblings, by name or by how they are related to the participant; any number, or none, may be chosen. Triplets and other multiple births are twins here too.',
  },
  twinsHint: {
    id: 'interview.familyPedigree.twinsHint',
    defaultMessage: 'Include triplets and other multiple births.',
    description:
      'Hint under the question in a family member’s panel asking which of their siblings are their twins.',
  },
  twinZygosityLabel: {
    id: 'interview.familyPedigree.twinZygosityLabel',
    defaultMessage:
      '{who, select, personIsYou {Are you and “{twin}” identical twins?} twinIsYou {Are “{name}” and you identical twins?} other {Are “{name}” and “{twin}” identical twins?}}',
    description:
      'Question in the panel showing a family member’s details, asked for each sibling chosen as their twin. name is the person the panel describes, twin is the sibling. Options are "Identical", "Fraternal (non-identical)" and "I don’t know".',
  },
  zygosityIdentical: {
    id: 'interview.familyPedigree.zygosityIdentical',
    defaultMessage: 'Yes, identical',
    description: 'Option: the two twins are identical twins.',
  },
  zygosityFraternal: {
    id: 'interview.familyPedigree.zygosityFraternal',
    defaultMessage: 'No, fraternal (non-identical)',
    description: 'Option: the two twins are fraternal (non-identical) twins.',
  },
  zygosityUnknown: {
    id: 'interview.familyPedigree.zygosityUnknown',
    defaultMessage: 'I don’t know',
    description:
      'Option: the participant does not know whether the two twins are identical or fraternal.',
  },
  add: {
    id: 'interview.familyPedigree.add',
    defaultMessage: 'Add to family',
    description:
      'Button at the bottom of the side panel that adds the new family member.',
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
      'Title of the confirmation shown before removing a family member. {name} is their name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Family member” when they are not connected to the participant.',
  },
  removeConfirmDescription: {
    id: 'interview.familyPedigree.removeConfirmDescription',
    defaultMessage:
      'They will be removed from your family tree, along with their connections to other people.',
    description:
      'Explanation in the confirmation shown before removing a family member.',
  },
  removeConfirmDescriptionWithOthers: {
    id: 'interview.familyPedigree.removeConfirmDescriptionWithOthers',
    defaultMessage:
      'They will be removed from your family tree, along with their connections to other people. {count, plural, one {{names} is connected to you only through them, so will be removed too.} other {{names} are connected to you only through them, so will be removed too.}}',
    description:
      'Explanation in the confirmation shown before removing a family member who is the only link between the participant and other people in the family tree. Those people would no longer be connected to the participant, so they are removed as well. names is a list of their names, or, when they have none, how they are related to the participant, each quoted and already joined in the participant’s language (for example “Grandmother” and “Grandfather”); count is how many people it names.',
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
      '{isYou, select, true {Add your biological parents} other {Add biological parents for “{name}”}}',
    description:
      'Item in the list of family members still needed: the person has no biological parents recorded yet. name is the person’s name or how they are related to the participant. Biological parents include an egg or sperm donor.',
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
  removedWithOthersAnnouncement: {
    id: 'interview.familyPedigree.removedWithOthersAnnouncement',
    defaultMessage:
      '{count, plural, one {{name} and one other person removed from your family.} other {{name} and # other people removed from your family.}}',
    description:
      'Screen reader announcement after a family member is removed along with the people who were connected to the participant only through them. {name} is the name of the person the participant chose to remove or, when it is not known, how they are related to the participant; count is how many other people were removed with them.',
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
    defaultMessage: 'Add and edit',
    description:
      'Short label of a toolbar button, shown beside its icon, so keep it brief. While it is on, selecting a person opens their details and shows buttons to add their relatives.',
  },
  connectTool: {
    id: 'interview.familyPedigree.connectTool',
    defaultMessage: 'Connect',
    description:
      'Short label of a toolbar button, shown beside its icon, so keep it brief. While it is on, selecting one person and then another connects them, for relatives added separately.',
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
  parentKindCarrier: {
    id: 'interview.familyPedigree.parentKind.carrier',
    defaultMessage: '{parentKind} (carried the pregnancy)',
    description:
      'Option in the menu for connecting a parent and child: a parent of this kind who was also pregnant with the child, such as a biological parent who gave birth, an adoptive or step parent who gave birth, or a donor who carried the pregnancy. parentKind is the protocol’s wording for the kind of parent (for example Biological parent, Adoptive parent); keep the qualifier separate from it, since the wording is the researcher’s.',
  },
  unavailableCarrierChoice: {
    id: 'interview.familyPedigree.unavailableCarrierChoice',
    defaultMessage:
      '{who, select, carrierIsYou {You are recorded as having carried “{child}”, and only one person carries a pregnancy.} childIsYou {“{carrier}” is recorded as having carried you, and only one person carries a pregnancy.} other {“{carrier}” is recorded as having carried “{child}”, and only one person carries a pregnancy.}}',
    description:
      'Reason shown under the unavailable choices in the menu that connects a parent and child that would record the parent as having carried the pregnancy: someone else is already recorded as having carried the child. {carrier} and {child} are names, or how the people are related to the participant when unnamed.',
  },
  disconnectTool: {
    id: 'interview.familyPedigree.disconnectTool',
    defaultMessage: 'Disconnect',
    description:
      'Short label of a toolbar button, shown beside its icon, so keep it brief. While it is on, selecting one person and then someone they are connected to removes the connection between them, leaving both people in the family tree.',
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
  listedName: {
    id: 'interview.familyPedigree.listedName',
    defaultMessage: '“{name}”',
    description:
      'One person in a list of people named in a sentence, such as the people who would be left outside the family tree. name is their name or, when it is not known, how they are related to the participant. The list is joined in the participant’s language, so this is one item: quote the name as names are quoted in the rest of this part of the interview.',
  },
  disconnectWouldCutOff: {
    id: 'interview.familyPedigree.disconnectWouldCutOff',
    defaultMessage:
      '{count, plural, one {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.} other {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.}}',
    description:
      'Shown under the toolbar, and read out, when the participant selects two people to disconnect whose connection is the only link between the participant and other people in the family tree, so it cannot be removed. names is a list of those people’s names, or, when they have none, how they are related to the participant, each quoted and already joined in the participant’s language (for example “Aunt” and “Cousin”); count is how many people it names.',
  },
  changeWouldCutOff: {
    id: 'interview.familyPedigree.changeWouldCutOff',
    defaultMessage:
      '{count, plural, one {This would leave {names} outside your family tree, because it removes their only connection to you. Connect them to someone else in your family first.} other {This would leave {names} outside your family tree, because it removes their only connection to you. Connect them to someone else in your family first.}}',
    description:
      'Shown when the participant saves a change, or makes a connection, that would remove the only link between the participant and other people in the family tree: unticking a twin who is connected to the participant only as their twin, or recording a parent in the place of an unnamed stand-in parent through whom other people were connected. The change is not made. names is a list of those people’s names, or, when they have none, how they are related to the participant, each quoted and already joined in the participant’s language (for example “Aunt” and “Cousin”); count is how many people it names.',
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
  unavailableSameSexGeneticParent: {
    id: 'interview.familyPedigree.unavailableSameSexGeneticParent',
    defaultMessage:
      '{who, select, coParentIsYou {Some answers are unavailable because you are recorded as “{sex}” at birth and are a genetic parent of “{child}”, who cannot have two genetic parents of the same sex at birth. To choose one, first change your sex at birth or how you are connected to “{child}”.} childIsYou {Some answers are unavailable because “{coParent}”, your genetic parent, is recorded as “{sex}” at birth, and you cannot have two genetic parents of the same sex at birth. To choose one, first change the sex at birth of “{coParent}” or how they are connected to you.} other {Some answers are unavailable because “{coParent}”, a genetic parent of “{child}”, is recorded as “{sex}” at birth, and “{child}” cannot have two genetic parents of the same sex at birth. To choose one, first change the sex at birth of “{coParent}” or how they are connected to “{child}”.}}',
    description:
      'Hint under a question whose answers are partly unavailable: someone already recorded as a genetic parent (biological parent or egg or sperm donor) of a child has the sex at birth that would make another genetic parent impossible. {coParent} is that parent, {child} the child, {sex} the answer to the sex at birth question, e.g. “Male”.',
  },
  unavailableGeneticParentsFull: {
    id: 'interview.familyPedigree.unavailableGeneticParentsFull',
    defaultMessage:
      '{who, select, childIsYou {Some answers are unavailable because you already have two genetic parents recorded, “{first}” and “{second}”. To choose one, first change how one of them is connected to you.} includesYou {Some answers are unavailable because “{child}” already has two genetic parents recorded, you and “{second}”. To choose one, first change how one of you is connected to “{child}”.} other {Some answers are unavailable because “{child}” already has two genetic parents recorded, “{first}” and “{second}”. To choose one, first change how one of them is connected to “{child}”.}}',
    description:
      'Hint under a question whose answers are partly unavailable: the child already has two genetic parents (biological parents or egg or sperm donors), so nobody else can be one. {first} and {second} are those parents.',
  },
  unavailableCarrierRecorded: {
    id: 'interview.familyPedigree.unavailableCarrierRecorded',
    defaultMessage:
      '{who, select, carrierIsYou {Some answers are unavailable because you are recorded as having carried “{child}”, and only one person carries a pregnancy. To choose one, first change how you are connected to “{child}”.} childIsYou {Some answers are unavailable because “{carrier}” is recorded as having carried you, and only one person carries a pregnancy. To choose one, first change how “{carrier}” is connected to you.} other {Some answers are unavailable because “{carrier}” is recorded as having carried “{child}”, and only one person carries a pregnancy. To choose one, first change how “{carrier}” is connected to “{child}”.}}',
    description:
      'Hint under a question whose answers are partly unavailable: someone is already recorded as having carried the child’s pregnancy (a surrogate, or a parent of another kind who did), so nobody else can have.',
  },
  unavailableIdenticalTwinNew: {
    id: 'interview.familyPedigree.unavailableIdenticalTwinNew',
    defaultMessage:
      '{isYou, select, true {Some answers are unavailable because identical twins have the same biological parents and donors, and this sibling would not have all of yours. To choose one, choose all of your biological parents and donors above.} other {Some answers are unavailable because identical twins have the same biological parents and donors, and this sibling would not have all of “{name}”’s. To choose one, choose all of their biological parents and donors above.}}',
    description:
      'Hint under the question asking whether a new sibling is a twin, when they cannot be an identical twin: the parents chosen for them above do not include all of the biological parents and egg or sperm donors of the person they are added to (name).',
  },
  unavailableIdenticalTwin: {
    id: 'interview.familyPedigree.unavailableIdenticalTwin',
    defaultMessage:
      '{who, select, personIsYou {Some answers are unavailable because identical twins have the same biological parents and donors, and you and “{twin}” do not. To choose one, first record the same biological parents and donors for both of you.} twinIsYou {Some answers are unavailable because identical twins have the same biological parents and donors, and “{name}” and you do not. To choose one, first record the same biological parents and donors for both of you.} other {Some answers are unavailable because identical twins have the same biological parents and donors, and “{name}” and “{twin}” do not. To choose one, first record the same biological parents and donors for both of them.}}',
    description:
      'Hint under the question asking whether two twins are identical, when they cannot be: the biological parents and egg or sperm donors recorded for them differ. name is the person the panel describes, twin is the sibling.',
  },
  unavailableCannotCarry: {
    id: 'interview.familyPedigree.unavailableCannotCarry',
    defaultMessage:
      '{who, select, you {Some answers are unavailable because you are recorded as “{sex}” at birth, so you cannot have carried a pregnancy. To choose one, first change your sex at birth.} this {Some answers are unavailable because this person is recorded as “{sex}” at birth, so they cannot have carried a pregnancy. To choose one, first change their sex at birth.} other {Some answers are unavailable because “{name}” is recorded as “{sex}” at birth, so they cannot have carried a pregnancy. To choose one, first change their sex at birth.}}',
    description:
      'Hint under a question whose answers are partly unavailable: the person is recorded as male at birth, so cannot be recorded as having carried a pregnancy. “this” is the person the panel describes; {name} is anyone else.',
  },
  unavailableCarried: {
    id: 'interview.familyPedigree.unavailableCarried',
    defaultMessage:
      '{who, select, personIsYou {Some answers are unavailable because you are recorded as having carried “{child}”, which nobody recorded as “{sex}” at birth can have. To choose one, first change how you are connected to “{child}”.} childIsYou {Some answers are unavailable because this person is recorded as having carried you, which nobody recorded as “{sex}” at birth can have. To choose one, first change how they are connected to you.} other {Some answers are unavailable because this person is recorded as having carried “{child}”, which nobody recorded as “{sex}” at birth can have. To choose one, first change how they are connected to “{child}”.}}',
    description:
      'Hint under the sex at birth question when an answer is unavailable because the person is recorded as having carried a child’s pregnancy. {sex} is the unavailable answer, e.g. “Male”.',
  },
  unavailableBothSameSex: {
    id: 'interview.familyPedigree.unavailableBothSameSex',
    defaultMessage:
      '{firstIsYou, select, true {Some answers are unavailable because you and “{second}” are both recorded as “{sex}” at birth, so you cannot both be the child’s genetic parents. To choose one, first change one of your sexes at birth.} other {Some answers are unavailable because “{first}” and “{second}” are both recorded as “{sex}” at birth, so they cannot both be the child’s genetic parents. To choose one, first change the sex at birth of one of them.}}',
    description:
      'Hint under the question of which of two parents is a new child’s biological parent, when “both” is unavailable because the two are recorded with the same sex at birth.',
  },
  unavailableAlreadyConnected: {
    id: 'interview.familyPedigree.unavailableAlreadyConnected',
    defaultMessage:
      '{firstIsYou, select, true {You and “{second}” are already connected. Two people can be connected only once; to connect them another way, first disconnect them.} other {“{first}” and “{second}” are already connected. Two people can be connected only once; to connect them another way, first disconnect them.}}',
    description:
      'Reason shown under an unavailable choice in the menu that connects two people: they already have a connection.',
  },
  unavailableAncestor: {
    id: 'interview.familyPedigree.unavailableAncestor',
    defaultMessage:
      '{who, select, parentIsYou {You cannot be a parent of “{child}”, who is already one of your ancestors.} childIsYou {“{parent}” cannot be your parent, because you are already one of their ancestors.} other {“{parent}” cannot be a parent of “{child}”, who is already one of their ancestors.}}',
    description:
      'Reason shown under an unavailable choice in the menu that connects two people: the would-be child is already the would-be parent’s parent, grandparent or an earlier ancestor.',
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
  passphraseNeededNotice: {
    id: 'interview.familyPedigree.passphraseNeededNotice',
    defaultMessage:
      'Enter your passphrase to see the names in your family and to add or change people.',
    description:
      'Notice shown under the family tree when the study protects names with a passphrase that has not been entered yet. Until it is, people are shown by how they are related to the participant, and the family cannot be changed.',
  },
  detailsPassphraseNeededNotice: {
    id: 'interview.familyPedigree.detailsPassphraseNeededNotice',
    defaultMessage:
      'Enter your passphrase to add or change people in your family.',
    description:
      'Notice shown under the family tree when the study protects some of the answers about each family member (but not their names) with a passphrase that has not been entered yet. Until it is, the family cannot be changed.',
  },
  reproductiveRoleDescription: {
    id: 'interview.familyPedigree.reproductiveRoleDescription',
    defaultMessage:
      '{role, select, donor {egg or sperm donor} traditionalSurrogate {egg donor who carried the pregnancy} other {surrogate}}',
    description:
      'Read out with a family member’s symbol in the family tree, for each part they played in someone else’s conception or birth (the tree draws no mark for these). "donor" is someone who donated an egg or sperm; "traditionalSurrogate" is an egg donor who also carried the pregnancy; "other" is a surrogate who carried the pregnancy without a genetic tie to the child. When someone has more than one role, the phrases are joined into a list, so write each as it would appear inside a sentence (lower case in English).',
  },
});
