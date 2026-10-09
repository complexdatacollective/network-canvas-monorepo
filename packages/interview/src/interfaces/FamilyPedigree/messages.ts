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
      "{term, select, mother {Mother} father {Father} parent {Parent} eggParent {Egg parent} spermParent {Sperm parent} biologicalMother {Bio\u00ADlogical mother} biologicalFather {Bio\u00ADlogical father} adoptiveMother {Adoptive mother} adoptiveFather {Adoptive father} adoptiveParent {Adoptive parent} stepmother {Step\u00ADmother} stepfather {Step\u00ADfather} stepparent {Step-parent} eggDonor {Egg donor} spermDonor {Sperm donor} donor {Donor} surrogate {Surro\u00ADgate} daughter {Daughter} son {Son} child {Child} stepdaughter {Step\u00ADdaughter} stepson {Stepson} stepchild {Stepchild} donorConceivedChild {Donor-conceived child} surrogacyChild {Surro\u00ADgacy child} sister {Sister} brother {Brother} sibling {Sibling} halfSister {Half-sister} halfBrother {Half-brother} halfSibling {Half-sibling} stepsister {Step\u00ADsister} stepbrother {Step\u00ADbrother} stepsibling {Step-sibling} partner {Partner} formerPartner {Former partner} grandmother {Grand\u00ADmother} grandfather {Grand\u00ADfather} grandparent {Grand\u00ADparent} maternalGrandmother {Maternal grand\u00ADmother} maternalGrandfather {Maternal grand\u00ADfather} maternalGrandparent {Maternal grand\u00ADparent} paternalGrandmother {Paternal grand\u00ADmother} paternalGrandfather {Paternal grand\u00ADfather} paternalGrandparent {Paternal grand\u00ADparent} greatGrandmother {Great-grand\u00ADmother} greatGrandfather {Great-grand\u00ADfather} greatGrandparent {Great-grand\u00ADparent} granddaughter {Grand\u00ADdaughter} grandson {Grandson} grandchild {Grand\u00ADchild} greatGranddaughter {Great-grand\u00ADdaughter} greatGrandson {Great-grandson} greatGrandchild {Great-grand\u00ADchild} aunt {Aunt} uncle {Uncle} maternalAunt {Maternal aunt} maternalUncle {Maternal uncle} paternalAunt {Paternal aunt} paternalUncle {Paternal uncle} parentsSibling {Parent's sibling} greatAunt {Great-aunt} greatUncle {Great-uncle} grandparentsSibling {Grand\u00ADparent's sibling} niece {Niece} nephew {Nephew} siblingsChild {Sibling's child} cousin {Cousin} motherInLaw {Mother-in-law} fatherInLaw {Father-in-law} parentInLaw {Parent-in-law} sisterInLaw {Sister-in-law} brotherInLaw {Brother-in-law} siblingInLaw {Sibling-in-law} daughterInLaw {Daugh\u00ADter-in-law} sonInLaw {Son-in-law} childInLaw {Child-in-law} other {Relative}}",
    description:
      'Label for a family member whose name is not known: their kinship to the participant (for example, the participant’s maternal grandmother). Depending on the study, either gendered words (mother, aunt) or words that do not assume gender (egg parent, parent’s sibling) are used. Also saved as the name of a family member the participant did not name, when they leave this part of the interview, so they can be recognised later. Labels sit inside a small symbol, so each long word carries a soft hyphen (U+00AD, invisible unless the word breaks there) at a syllable break, as between “Grand” and “mother” in Grandmother, or “Step” and “daughter” in Stepdaughter: the word breaks there, with a hyphen, only when it does not fit on one line, and otherwise reads whole. Place your own soft hyphens at sensible syllable breaks in any word longer than about nine letters in your language, rather than copying these positions; a word without one may break between any two letters. Soft hyphens are removed from the label saved as a name.',
  },
  personAccessibleName: {
    id: 'interview.familyPedigree.personAccessibleName',
    defaultMessage:
      '{isYou, select, true {You} other {{name}}}{missing, select, true {, some details missing} other {}}',
    description:
      'Accessible name of a family member’s symbol in the family tree. {name} is the person’s name or, when it is not known, how they are related to the participant. The second part is read out when required details about the person have not been given yet.',
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
  stillTogetherLabel: {
    id: 'interview.familyPedigree.stillTogetherLabel',
    defaultMessage:
      '{named, select, true {{personIsYou, select, true {Are you still together with {partner}?} other {{partnerIsYou, select, true {Are you still together?} other {Are they still together with {partner}?}}}}} other {Are they still together?}}',
    description:
      'Yes/no question: whether a partnership is current, rather than separated or ended. named is true for a partner already in the family, and false for a partner being added, who has no name yet. {partner} is the partner’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Relative” when they are not connected to the participant.',
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
      '{named, select, true {{parentIsYou, select, true {Did you carry the pregnancy?} other {Did {parent} carry the pregnancy?}}} other {Did this parent carry the pregnancy?}}',
    description:
      'Yes/no question about whether a biological parent was pregnant with the family member. named is true for a parent already in the family, and false for a parent being added, who has no name yet. parent is the parent’s name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Relative” when they are not connected to the participant.',
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
  carriedSiblingsPregnancyLabel: {
    id: 'interview.familyPedigree.carriedSiblingsPregnancyLabel',
    defaultMessage:
      '{count, plural, =1 {{isYou, select, true {Was this parent pregnant with you?} other {Was this parent pregnant with “{name}”?}}} other {Was this parent pregnant with each of the # people chosen above who have nobody recorded as having carried them?}}',
    description:
      'Yes/no question in the side panel for adding a biological parent. It is asked when the person the parent is added for already has someone recorded as having carried their pregnancy, about the people chosen in “Are they also the parent of…” who have nobody recorded yet. count is how many such people there are; name is the one person’s name, or how they are related to the participant when unnamed; isYou is true when that person is the participant. It may be left unanswered.',
  },
  parentPartnerLabel: {
    id: 'interview.familyPedigree.parentPartnerLabel',
    defaultMessage: 'Are they the partner of another parent?',
    description:
      'Question in the side panel for adding a parent: whether the new parent is (or was) the partner of a parent already in the family tree. Options are those parents’ names, or “No”.',
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
      'Accessible name of the toolbar icon button that zooms and moves the family tree so everyone in it fits on screen. Shown as an icon, without a tooltip.',
  },
  framingControlLabel: {
    id: 'interview.familyPedigree.framingControlLabel',
    defaultMessage: 'Wording',
    description:
      'Accessible name and tooltip of the toolbar icon button, shown as a speech bubble, that opens the choice of words used to describe family members (such as “mother” or “egg parent”). Keep it brief.',
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
  siblingKindLabel: {
    id: 'interview.familyPedigree.siblingKindLabel',
    defaultMessage: 'To the parents they share, are they…',
    description:
      'Question in the side panel for adding a sibling: how the new sibling is related to the parents chosen above. Followed by the options "A biological child", "An adopted child", "A step-child or other child they raise".',
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
      'Question in the side panel for adding a biological child or a biological sibling. Options are the new person’s parents, by name or by how they are related to the participant, or someone else / not known.',
  },
  carrierUnknown: {
    id: 'interview.familyPedigree.carrierUnknown',
    defaultMessage: 'Someone else, or I don’t know',
    description:
      'Option: none of the parents offered carried the pregnancy, or the participant does not know.',
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
      '{hasOthers, select, true {They will be removed from your family tree, along with their connections to other people. {count, plural, one {{names} is connected to you only through them, so will be removed too.} other {{names} are connected to you only through them, so will be removed too.}}} other {They will be removed from your family tree, along with their connections to other people.}}',
    description:
      'Explanation in the confirmation shown before removing a family member. hasOthers is true when people who are connected to the participant only through them would be removed too. names is a list of those people’s names, or, when they have none, how they are related to the participant, already joined in the participant’s language; count is how many people it names.',
  },
  trackerProgressLabel: {
    id: 'interview.familyPedigree.trackerProgressLabel',
    defaultMessage:
      '{complete, select, true {Your family tree has everything needed} other {Family tree {percent, number, percent} complete}}. Show what’s still needed.',
    description:
      'Accessible name of the round progress indicator in the corner of the family tree, which opens the list of family members still needed. percent is a fraction between 0 and 1.',
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
      'Accessible name and tooltip of a toolbar icon button, shown as the pointer icon. While it is on, selecting a person opens their details, and buttons to add their relatives are shown around them.',
  },
  connectTool: {
    id: 'interview.familyPedigree.connectTool',
    defaultMessage: 'Connect',
    description:
      'Accessible name and tooltip of a toolbar icon button, shown as the Waypoints icon. While it is on, selecting one person and then another connects them, for relatives added separately.',
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
      'Read out to screen reader users, not shown, once the first of two people to connect has been selected. name is that person’s name or how they are related to the participant.',
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
      '{current, select, true {{firstIsYou, select, true {You and “{second}” are partners} other {“{first}” and “{second}” are partners}}} other {{firstIsYou, select, true {You and “{second}” were partners} other {“{first}” and “{second}” were partners}}}}',
    description:
      'Option in the menu for connecting two people: they are a couple (current is true), or they were a couple but are no longer together.',
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
  parentKindBiologicalCarrier: {
    id: 'interview.familyPedigree.parentKind.biologicalCarrier',
    defaultMessage: '{parentKind} (carried the pregnancy)',
    description:
      'Option in the menu for connecting a parent and child: a genetic parent who was also pregnant with the child. parentKind is the protocol’s wording for a biological parent (for example Biological parent); keep the qualifier separate from it, since the wording is the researcher’s.',
  },
  disconnectTool: {
    id: 'interview.familyPedigree.disconnectTool',
    defaultMessage: 'Disconnect',
    description:
      'Accessible name and tooltip of a toolbar icon button, shown as the Unlink icon. While it is on, selecting one person and then someone they are connected to removes the connection between them, leaving both people in the family tree.',
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
      'Read out to screen reader users, not shown, once the first of two people to disconnect has been selected. name is that person’s name or how they are related to the participant.',
  },
  disconnectWouldCutOff: {
    id: 'interview.familyPedigree.disconnectWouldCutOff',
    defaultMessage:
      '{count, plural, one {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.} other {Removing this connection would leave {names} outside your family tree. Connect them to someone else in your family first.}}',
    description:
      'Shown under the toolbar, and read out, when the participant selects two people to disconnect whose connection is the only link between the participant and other people in the family tree, so it cannot be removed. names is a list of those people’s names, or, when they have none, how they are related to the participant, already joined in the participant’s language (for example Aunt and Cousin); count is how many people it names.',
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
      '{parent, select, egg {{framing, select, gamete {Only the egg parent} other {Only the biological mother}}} other {{framing, select, gamete {Only the sperm parent} other {Only the biological father}}}}',
    description:
      'Option: the new sibling shares only one parent, so is a half-sibling. parent is egg for the parent who provided the egg, or sperm for the parent who provided the sperm. Gendered or gamete wording depends on the study.',
  },
  sharedParentUnshown: {
    id: 'interview.familyPedigree.sharedParentUnshown',
    defaultMessage:
      '{isYou, select, true {Your other parent, not shown yet} other {The other parent of “{name}”, not shown yet}}',
    description:
      'Option when choosing which parents a new sibling shares, for someone with one parent recorded: their second parent, who is added unnamed for both of them. Also an option when asked who carried the new sibling’s pregnancy.',
  },
  panelTitle: {
    id: 'interview.familyPedigree.panelTitle',
    defaultMessage:
      '{relation, select, edit {{isYou, select, true {About you} other {About {name}}}} parent {{isYou, select, true {Add your parent} other {Add a parent of {name}}}} sibling {{isYou, select, true {Add your sibling} other {Add a sibling of {name}}}} partner {{isYou, select, true {Add your partner} other {Add a partner of {name}}}} other {{isYou, select, true {Add your child} other {Add a child of {name}}}}}',
    description:
      'Title of the side panel, for a family member being described or added to. relation is edit when the panel describes them; otherwise the relation being added: parent, sibling or partner, or other for a child. isYou is whether that family member is the participant. name is their name or, when they have none, how they are related to the participant, such as “Maternal grandmother”, or “Relative” when they are not connected to the participant.',
  },
  generatedLabelOf: {
    id: 'interview.familyPedigree.generatedLabelOf',
    defaultMessage:
      '{relation, select, partner {{isYou, select, true {{term} (your partner)} other {{term} (partner of {name})}}} parent {{isYou, select, true {{term} (your parent)} other {{term} (parent of {name})}}} sibling {{isYou, select, true {{term} (your sibling)} other {{term} (sibling of {name})}}} owner {{owner}’s {term}} other {{isYou, select, true {{term} (your child)} other {{term} (child of {name})}}}}',
    description:
      'Label for a family member the participant did not name, when their kinship word alone is shared with someone else. Shown inside their symbol in the family tree, and saved as their name so later parts of the interview show the same label. term is the already translated kinship word, such as “Half-sister”. relation says how they are related to the relative who tells them apart: partner, parent (the relative is their child), child (the relative is their parent), or sibling; name is that relative’s name, or their kinship word, such as “Julie” or “Mother”, and isYou is whether the relative is the participant. The owner form is used when that relative has no name or kinship word of their own: owner is that relative’s label (for example “Cousin”), and term is how this person is related to them. Translate the possessive grammar as a whole; owner stays verbatim. Child is the form for any other relation.',
  },
});
