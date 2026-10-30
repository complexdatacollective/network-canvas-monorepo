import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The hint under each setting of the Family Pedigree's built-in wording:
 * where the participant sees the text and what it is for.
 */
export const pedigreeWordingHints = defineMessages({
  pointerTool: {
    id: 'protocolBuilder.pedigree.wordingHint.pointerTool',
    defaultMessage:
      'Name of the toolbar tool for selecting a family member to edit them or add relatives. Shown in its tooltip.',
    description:
      'Hint under the setting holding the pointer tool button, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  connectTool: {
    id: 'protocolBuilder.pedigree.wordingHint.connectTool',
    defaultMessage:
      'Name of the toolbar tool for connecting two family members. Shown in its tooltip.',
    description:
      'Hint under the setting holding the connect tool button, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  disconnectTool: {
    id: 'protocolBuilder.pedigree.wordingHint.disconnectTool',
    defaultMessage:
      'Name of the toolbar tool for removing a connection. Shown in its tooltip.',
    description:
      'Hint under the setting holding the disconnect tool button, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  connectHint: {
    id: 'protocolBuilder.pedigree.wordingHint.connectHint',
    defaultMessage:
      'Instruction shown on the family tree while the connect tool is in use.',
    description:
      'Hint under the setting holding the connect hint, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  disconnectHint: {
    id: 'protocolBuilder.pedigree.wordingHint.disconnectHint',
    defaultMessage:
      'Instruction shown on the family tree while the disconnect tool is in use.',
    description:
      'Hint under the setting holding the disconnect hint, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  framingChoiceTitle: {
    id: 'protocolBuilder.pedigree.wordingHint.framingChoiceTitle',
    defaultMessage:
      'Question asking the participant which words to use for family members. Only used when participants choose the words.',
    description:
      'Hint under the setting holding the wording question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  framingChoiceDescription: {
    id: 'protocolBuilder.pedigree.wordingHint.framingChoiceDescription',
    defaultMessage:
      'Explanation under the question about which words to use. Only used when participants choose the words.',
    description:
      'Hint under the setting holding the explanation under the wording question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  framingControlLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.framingControlLabel',
    defaultMessage:
      'Label of the control for changing the words used for family members. Only used when participants choose the words.',
    description:
      'Hint under the setting holding the wording control label, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  placeholderParentsNote: {
    id: 'protocolBuilder.pedigree.wordingHint.placeholderParentsNote',
    defaultMessage:
      'Note shown when adding a sibling, explaining the unnamed parents that are added and which one the sibling shares.',
    description:
      'Hint under the setting holding the note about added parents, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  generatedLabelOf: {
    id: 'protocolBuilder.pedigree.wordingHint.generatedLabelOf',
    defaultMessage:
      'Label shown for a family member who has no name, saying how they are related to the participant or to another family member.',
    description:
      'Hint under the setting holding the label for a relative, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  relativeTerm: {
    id: 'protocolBuilder.pedigree.wordingHint.relativeTerm',
    defaultMessage:
      'Words for each kind of relative, such as Mother or Egg parent. Used in the labels of family members who have no name.',
    description:
      'Hint under the setting holding the relative terms, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  you: {
    id: 'protocolBuilder.pedigree.wordingHint.you',
    defaultMessage:
      'Shown instead of a name wherever the participant appears in the family tree.',
    description:
      'Hint under the setting holding the participant’s own name, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  connectQuestion: {
    id: 'protocolBuilder.pedigree.wordingHint.connectQuestion',
    defaultMessage:
      'Question asking how the two family members being connected are related.',
    description:
      'Hint under the setting holding the connect question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  connectParent: {
    id: 'protocolBuilder.pedigree.wordingHint.connectParent',
    defaultMessage:
      'Sentence describing a parent connection between the two family members being connected.',
    description:
      'Hint under the setting holding the parent connection sentence, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  connectPartners: {
    id: 'protocolBuilder.pedigree.wordingHint.connectPartners',
    defaultMessage:
      'Sentence describing a current or past partnership between the two family members being connected.',
    description:
      'Hint under the setting holding the partner connection sentence, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  disconnectConfirmTitle: {
    id: 'protocolBuilder.pedigree.wordingHint.disconnectConfirmTitle',
    defaultMessage:
      'Question asked before a connection between two family members is removed.',
    description:
      'Hint under the setting holding the remove connection question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  disconnectConfirmDescription: {
    id: 'protocolBuilder.pedigree.wordingHint.disconnectConfirmDescription',
    defaultMessage:
      'Explanation under the question about removing a connection.',
    description:
      'Hint under the setting holding the explanation under the remove connection question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  disconnectWouldCutOff: {
    id: 'protocolBuilder.pedigree.wordingHint.disconnectWouldCutOff',
    defaultMessage:
      'Warning shown when removing a connection would leave family members outside the family tree. The connection is not removed.',
    description:
      'Hint under the setting holding the warning about a connection that would leave someone out, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  disconnectStandIn: {
    id: 'protocolBuilder.pedigree.wordingHint.disconnectStandIn',
    defaultMessage:
      'Shown when a connection cannot be removed because an unnamed parent stands in for a parent who has not been added yet.',
    description:
      'Hint under the setting holding the stand-in parent connection notice, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  changeWouldCutOff: {
    id: 'protocolBuilder.pedigree.wordingHint.changeWouldCutOff',
    defaultMessage:
      'Warning shown when a change would leave family members outside the family tree. The change is not made.',
    description:
      'Hint under the setting holding the warning about a change that would leave someone out, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  unavailableAncestor: {
    id: 'protocolBuilder.pedigree.wordingHint.unavailableAncestor',
    defaultMessage:
      'Reason shown under a choice that would make a family member a parent of their own ancestor.',
    description:
      'Hint under the setting holding the unavailable-choice reason about an ancestor, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  removeConfirmTitle: {
    id: 'protocolBuilder.pedigree.wordingHint.removeConfirmTitle',
    defaultMessage: 'Question asked before a family member is removed.',
    description:
      'Hint under the setting holding the remove question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  removeConfirmDescription: {
    id: 'protocolBuilder.pedigree.wordingHint.removeConfirmDescription',
    defaultMessage:
      'Explanation under the question about removing a family member, saying what else is removed with them.',
    description:
      'Hint under the setting holding the explanation under the remove question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  stillTogetherLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.stillTogetherLabel',
    defaultMessage:
      'Question in the side panel asking whether two partners are still together.',
    description:
      'Hint under the setting holding the still together question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  panelTitle: {
    id: 'protocolBuilder.pedigree.wordingHint.panelTitle',
    defaultMessage:
      'Title of the side panel for adding or editing a family member.',
    description:
      'Hint under the setting holding the panel title, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  parentKindLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.parentKindLabel',
    defaultMessage:
      'Question in the side panel asking what kind of parent a new parent is.',
    description:
      'Hint under the setting holding the kind of parent question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  parentKindCarrier: {
    id: 'protocolBuilder.pedigree.wordingHint.parentKindCarrier',
    defaultMessage:
      'Answer for a parent who carried the pregnancy. The kind of parent is filled in.',
    description:
      'Hint under the setting holding the answer for a parent who carried the pregnancy, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  biologicalParentLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.biologicalParentLabel',
    defaultMessage:
      'Question asking which parent is the child’s biological parent.',
    description:
      'Hint under the setting holding the biological parent question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  biologicalParentHint: {
    id: 'protocolBuilder.pedigree.wordingHint.biologicalParentHint',
    defaultMessage:
      'Hint under the question about the child’s biological parent.',
    description:
      'Hint under the setting holding the biological parent hint, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  biologicalParentBoth: {
    id: 'protocolBuilder.pedigree.wordingHint.biologicalParentBoth',
    defaultMessage:
      'Answer that both parents are the child’s biological parents. Their names are filled in.',
    description:
      'Hint under the setting holding the both biological parents answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  carrierLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.carrierLabel',
    defaultMessage: 'Question asking who carried the pregnancy.',
    description:
      'Hint under the setting holding the carrier question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  carrierUnknown: {
    id: 'protocolBuilder.pedigree.wordingHint.carrierUnknown',
    defaultMessage:
      'Answer to the question about who carried the pregnancy, for someone else or for not knowing.',
    description:
      'Hint under the setting holding the other or unknown carrier answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  otherParentLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.otherParentLabel',
    defaultMessage: 'Question asking who the child’s other parent is.',
    description:
      'Hint under the setting holding the other parent question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  otherParentNone: {
    id: 'protocolBuilder.pedigree.wordingHint.otherParentNone',
    defaultMessage: 'Answer that the child has no other parent.',
    description:
      'Hint under the setting holding the no other parent answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  otherParentUnknown: {
    id: 'protocolBuilder.pedigree.wordingHint.otherParentUnknown',
    defaultMessage:
      'Answer for an other parent who is not on the family tree yet.',
    description:
      'Hint under the setting holding the other parent not shown answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  otherParentBiologicalLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.otherParentBiologicalLabel',
    defaultMessage:
      'Yes or no question asking whether the other parent of a new step-child or adopted child is their biological parent.',
    description:
      'Hint under the setting holding the question asking whether the other parent is biological, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  parentPartnerLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.parentPartnerLabel',
    defaultMessage:
      'Question asking whether a new parent is the partner of another parent.',
    description:
      'Hint under the setting holding the parent partner question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  parentLinkKindLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.parentLinkKindLabel',
    defaultMessage:
      'Question asking what kind of parent one family member is to another.',
    description:
      'Hint under the setting holding the kind of relationship question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  parentCarriedLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.parentCarriedLabel',
    defaultMessage: 'Question asking whether a parent carried the pregnancy.',
    description:
      'Hint under the setting holding the carried the pregnancy question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sharedParentCountLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.sharedParentCountLabel',
    defaultMessage: 'Question asking which parents a new sibling shares.',
    description:
      'Hint under the setting holding the shared parents question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sharedParentCountBoth: {
    id: 'protocolBuilder.pedigree.wordingHint.sharedParentCountBoth',
    defaultMessage: 'Answer that a new sibling shares both parents.',
    description:
      'Hint under the setting holding the both shared parents answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sharedParentEggOnly: {
    id: 'protocolBuilder.pedigree.wordingHint.sharedParentEggOnly',
    defaultMessage:
      'Answer that a new sibling shares only one parent. The kind of parent is filled in.',
    description:
      'Hint under the setting holding the one shared parent answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sharedDonorsLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.sharedDonorsLabel',
    defaultMessage:
      'Question asking which donors a new sibling shares, and the surrogate if one is recorded. Used when the family member’s only parents are donors.',
    description:
      'Hint under the setting holding the shared donors question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sharedSurrogateLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.sharedSurrogateLabel',
    defaultMessage:
      'Question asking whether the surrogate who carried a family member also carried a new sibling. Used when no parents are recorded yet.',
    description:
      'Hint under the setting holding the shared surrogate question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sharedParentsNotSibling: {
    id: 'protocolBuilder.pedigree.wordingHint.sharedParentsNotSibling',
    defaultMessage:
      'Error shown when the parents chosen for a new sibling do not make them a sibling, such as only a step parent.',
    description:
      'Hint under the setting holding the error about shared parents that do not make a sibling, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingKindLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingKindLabel',
    defaultMessage:
      'Question asking how a new sibling is related to the parents they share.',
    description:
      'Hint under the setting holding the question about siblings’ shared parents, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingBiologicalParentLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingBiologicalParentLabel',
    defaultMessage:
      'Question asking which shared parent is a new sibling’s biological parent, when only one of them can be.',
    description:
      'Hint under the setting holding the sibling’s biological parent question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingOtherBiologicalParentLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingOtherBiologicalParentLabel',
    defaultMessage:
      'Question asking which shared parent is a new sibling’s other biological parent, when more than one could be.',
    description:
      'Hint under the setting holding the sibling’s other biological parent question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingTwinLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingTwinLabel',
    defaultMessage: 'Question asking whether a new sibling is a twin.',
    description:
      'Hint under the setting holding the twin question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingTwinHint: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingTwinHint',
    defaultMessage:
      'Hint under the question asking whether a new sibling is a twin.',
    description:
      'Hint under the setting holding the twin question hint, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingTwinNo: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingTwinNo',
    defaultMessage: 'Answer that a new sibling is not a twin.',
    description:
      'Hint under the setting holding the not a twin answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingTwinIdentical: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingTwinIdentical',
    defaultMessage: 'Answer that a new sibling is an identical twin.',
    description:
      'Hint under the setting holding the identical twin answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingTwinFraternal: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingTwinFraternal',
    defaultMessage: 'Answer that a new sibling is a fraternal twin.',
    description:
      'Hint under the setting holding the fraternal twin answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingTwinUnknown: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingTwinUnknown',
    defaultMessage:
      'Answer that a new sibling is a twin, without knowing whether they are identical.',
    description:
      'Hint under the setting holding the twin, not known if identical, answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  carriedSiblingsPregnancyLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.carriedSiblingsPregnancyLabel',
    defaultMessage:
      'Question asking whether a parent carried the pregnancy of each new sibling.',
    description:
      'Hint under the setting holding the siblings’ pregnancy question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childKindLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.childKindLabel',
    defaultMessage: 'Question asking what kind of child a new child is.',
    description:
      'Hint under the setting holding the kind of child question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childKindBiological: {
    id: 'protocolBuilder.pedigree.wordingHint.childKindBiological',
    defaultMessage: 'Answer for a biological child.',
    description:
      'Hint under the setting holding the biological child answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childKindAdoptive: {
    id: 'protocolBuilder.pedigree.wordingHint.childKindAdoptive',
    defaultMessage: 'Answer for an adopted child.',
    description:
      'Hint under the setting holding the adopted child answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childKindSocial: {
    id: 'protocolBuilder.pedigree.wordingHint.childKindSocial',
    defaultMessage:
      'Answer for a step-child or other child the family member raises.',
    description:
      'Hint under the setting holding the step or other raised child answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childKindDonor: {
    id: 'protocolBuilder.pedigree.wordingHint.childKindDonor',
    defaultMessage:
      'Answer for a child conceived with an egg or sperm the family member donated.',
    description:
      'Hint under the setting holding the child from a donation answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childKindSurrogate: {
    id: 'protocolBuilder.pedigree.wordingHint.childKindSurrogate',
    defaultMessage:
      'Answer for a child the family member carried as a surrogate.',
    description:
      'Hint under the setting holding the child carried as a surrogate answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  alsoParentOfLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.alsoParentOfLabel',
    defaultMessage:
      'Question asking whether a new parent is also the parent of the family member’s siblings.',
    description:
      'Hint under the setting holding the also parent of question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  standInPlaceTaken: {
    id: 'protocolBuilder.pedigree.wordingHint.standInPlaceTaken',
    defaultMessage:
      'Hint under the also parent of question when a new parent takes the place of an unnamed parent. It names the siblings who become their children too.',
    description:
      'Hint under the setting holding the hint about taking an unnamed parent’s place, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sexAssignedAtBirthLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.sexAssignedAtBirthLabel',
    defaultMessage:
      'Label of the sex assigned at birth question in the side panel.',
    description:
      'Hint under the setting holding the sex assigned at birth question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  genderIdentityLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.genderIdentityLabel',
    defaultMessage:
      'Label of the gender identity question in the side panel. Only used when the stage asks about gender identity.',
    description:
      'Hint under the setting holding the gender identity question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  twinsLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.twinsLabel',
    defaultMessage:
      'Question in the side panel asking which siblings are twins of the family member.',
    description:
      'Hint under the setting holding the twins question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  twinsHint: {
    id: 'protocolBuilder.pedigree.wordingHint.twinsHint',
    defaultMessage: 'Hint under the question about which siblings are twins.',
    description:
      'Hint under the setting holding the twins hint, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  twinZygosityLabel: {
    id: 'protocolBuilder.pedigree.wordingHint.twinZygosityLabel',
    defaultMessage: 'Question asking whether two twins are identical.',
    description:
      'Hint under the setting holding the identical twins question, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  zygosityIdentical: {
    id: 'protocolBuilder.pedigree.wordingHint.zygosityIdentical',
    defaultMessage: 'Answer that two twins are identical.',
    description:
      'Hint under the setting holding the identical answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  zygosityFraternal: {
    id: 'protocolBuilder.pedigree.wordingHint.zygosityFraternal',
    defaultMessage: 'Answer that two twins are fraternal.',
    description:
      'Hint under the setting holding the fraternal answer, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  identicalTwinSharesParents: {
    id: 'protocolBuilder.pedigree.wordingHint.identicalTwinSharesParents',
    defaultMessage:
      'Note explaining that recording twins as identical records the same biological parents and donors for both.',
    description:
      'Hint under the setting holding the note on identical twins, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  unavailableSameSexGeneticParent: {
    id: 'protocolBuilder.pedigree.wordingHint.unavailableSameSexGeneticParent',
    defaultMessage:
      'Shown under the answers when some are unavailable because the child’s other genetic parent has the same sex at birth.',
    description:
      'Hint under the setting holding the hint about the other genetic parent’s sex at birth, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  geneticParentReplaced: {
    id: 'protocolBuilder.pedigree.wordingHint.geneticParentReplaced',
    defaultMessage:
      'Note explaining that choosing a genetic kind of parent replaces the biological parent already recorded with the same sex at birth.',
    description:
      'Hint under the setting holding the note on a new genetic parent, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  unavailableGeneticParentsFull: {
    id: 'protocolBuilder.pedigree.wordingHint.unavailableGeneticParentsFull',
    defaultMessage:
      'Shown under the answers when some are unavailable because the child already has two genetic parents recorded.',
    description:
      'Hint under the setting holding the hint about two genetic parents, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  unavailableBothSameSex: {
    id: 'protocolBuilder.pedigree.wordingHint.unavailableBothSameSex',
    defaultMessage:
      'Shown under the answers when both parents cannot be a new child’s genetic parents, because they have the same sex at birth.',
    description:
      'Hint under the setting holding the hint about both parents having the same sex at birth, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  unavailableCarrierRecorded: {
    id: 'protocolBuilder.pedigree.wordingHint.unavailableCarrierRecorded',
    defaultMessage:
      'Shown under the answers when some are unavailable because someone else is recorded as having carried the pregnancy.',
    description:
      'Hint under the setting holding the hint about someone else having carried, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  carrierReplaced: {
    id: 'protocolBuilder.pedigree.wordingHint.carrierReplaced',
    defaultMessage:
      'Note explaining that choosing this answer replaces the family member recorded as having carried the pregnancy.',
    description:
      'Hint under the setting holding the note on a new answer about carrying, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  unavailableCannotCarry: {
    id: 'protocolBuilder.pedigree.wordingHint.unavailableCannotCarry',
    defaultMessage:
      'Shown under the answers when some are unavailable because the family member’s sex at birth means they cannot have carried a pregnancy.',
    description:
      'Hint under the setting holding the hint about not being able to have carried, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  unavailableCarried: {
    id: 'protocolBuilder.pedigree.wordingHint.unavailableCarried',
    defaultMessage:
      'Shown under the answers when a sex at birth is unavailable because the family member is recorded as having carried a pregnancy.',
    description:
      'Hint under the setting holding the hint about having carried a child, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sexChangeEndsCarrying: {
    id: 'protocolBuilder.pedigree.wordingHint.sexChangeEndsCarrying',
    defaultMessage:
      'Note explaining that saving this sex at birth means the family member is no longer recorded as having carried their children.',
    description:
      'Hint under the setting holding the note on a new sex at birth answer ending carrying, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  sexChangeClearsCoParentSex: {
    id: 'protocolBuilder.pedigree.wordingHint.sexChangeClearsCoParentSex',
    defaultMessage:
      'Note explaining that saving this sex at birth clears the same answer for the other genetic parent of their children.',
    description:
      'Hint under the setting holding the note on a new sex at birth answer clearing the other parent’s, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  parentsListItem: {
    id: 'protocolBuilder.pedigree.wordingHint.parentsListItem',
    defaultMessage:
      'Item in the completeness checklist asking for a family member’s biological parents.',
    description:
      'Hint under the setting holding the missing parents item, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingsListItem: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingsListItem',
    defaultMessage:
      'Item in the completeness checklist asking for a family member’s biological siblings, or an answer that they have none.',
    description:
      'Hint under the setting holding the brothers and sisters item, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingsNoneButton: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingsNoneButton',
    defaultMessage:
      'Button under the siblings checklist item, for answering that the family member has no biological siblings.',
    description:
      'Hint under the setting holding the no brothers or sisters button, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  siblingsQuestion: {
    id: 'protocolBuilder.pedigree.wordingHint.siblingsQuestion',
    defaultMessage:
      'Question in the side panel about a family member’s biological siblings, asked while the checklist still needs them.',
    description:
      'Hint under the setting holding the brothers and sisters question in the side panel, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childrenListItem: {
    id: 'protocolBuilder.pedigree.wordingHint.childrenListItem',
    defaultMessage:
      'Item in the completeness checklist asking for a family member’s biological children, or an answer that they have none.',
    description:
      'Hint under the setting holding the children item, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childrenNoneButton: {
    id: 'protocolBuilder.pedigree.wordingHint.childrenNoneButton',
    defaultMessage:
      'Button under the children checklist item, for answering that the family member has no biological children.',
    description:
      'Hint under the setting holding the no children button, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  childrenQuestion: {
    id: 'protocolBuilder.pedigree.wordingHint.childrenQuestion',
    defaultMessage:
      'Question in the side panel about a family member’s biological children, asked while the checklist still needs them.',
    description:
      'Hint under the setting holding the children question in the side panel, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  detailsListItem: {
    id: 'protocolBuilder.pedigree.wordingHint.detailsListItem',
    defaultMessage:
      'Item in the completeness checklist saying details are still missing for a family member, such as their sex assigned at birth.',
    description:
      'Hint under the setting holding the missing details item, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
  recommendedNote: {
    id: 'protocolBuilder.pedigree.wordingHint.recommendedNote',
    defaultMessage:
      'Note under the checklist saying the participant can continue without finishing it. Only used when completeness is recommended, not required.',
    description:
      'Hint under the setting holding the note about continuing anyway, in the Customize built-in wording section of the Family Pedigree stage editor. It tells the researcher where the participant sees this text and what it is for. A family member is someone the participant adds to their family tree; the side panel is where the participant adds or edits one.',
  },
});
