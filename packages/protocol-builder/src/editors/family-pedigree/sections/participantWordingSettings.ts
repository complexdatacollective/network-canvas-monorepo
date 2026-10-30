import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  type MessageArguments,
  PEDIGREE_PERSON_ARGUMENTS,
  PEDIGREE_WORDING_ARGUMENTS,
} from '@codaco/protocol-validation';

import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import { pedigreeWordingHints as hints } from './pedigreeWordingHints.ts';

/**
 * A setting the stage holds only while its configuration is on. The schema
 * requires it then, so the editor shows it then and no other time.
 */
export type WordingGate =
  | 'choosesFraming'
  | 'asksGenderIdentity'
  | 'checksCompleteness';

type WordingSetting = Readonly<{
  /** The setting's dotted path under its group's `root`. */
  key: string;
  label: MessageDescriptor;
  /** Set for a setting whose text takes values, such as a name. */
  arguments?: MessageArguments;
  gate?: WordingGate;
  hint?: MessageDescriptor;
  /** Set for a setting worded as a sentence or more: its field wraps. */
  wraps?: boolean;
}>;

export type WordingGroup = Readonly<{
  /** Names the group. */
  id: string;
  /** Where the group's settings sit in the stage. */
  root: 'wording' | 'completeness';
  /** Set for a group the stage holds only while its configuration is on. */
  gate?: WordingGate;
  settings: readonly WordingSetting[];
}>;

/** The stage path of one of a group's settings. */
export const settingPath = (group: WordingGroup, setting: WordingSetting) =>
  `${group.root}.${setting.key}`;

/**
 * The words in the order a participant meets them: first the canvas they
 * draw on, then the connections they make, then the side panel for each
 * family member they add, and last the checklist of what is still needed,
 * which only a stage with a completeness requirement shows.
 */
export const PARTICIPANT_WORDING_GROUPS: readonly WordingGroup[] = [
  {
    id: 'drawing',
    root: 'wording',
    settings: [
      {
        key: 'pointerTool',
        label: messages.wordingPointerTool,
        hint: hints.pointerTool,
      },
      {
        key: 'connectTool',
        label: messages.wordingConnectTool,
        hint: hints.connectTool,
      },
      {
        key: 'disconnectTool',
        label: messages.wordingDisconnectTool,
        hint: hints.disconnectTool,
      },
      {
        key: 'connectHint',
        label: messages.wordingConnectHint,
        hint: hints.connectHint,
        wraps: true,
      },
      {
        key: 'disconnectHint',
        label: messages.wordingDisconnectHint,
        hint: hints.disconnectHint,
        wraps: true,
      },
      {
        key: 'framingChoiceTitle',
        label: messages.wordingFramingChoiceTitle,
        hint: hints.framingChoiceTitle,
        gate: 'choosesFraming',
      },
      {
        key: 'framingChoiceDescription',
        label: messages.wordingFramingChoiceDescription,
        hint: hints.framingChoiceDescription,
        wraps: true,
        gate: 'choosesFraming',
      },
      {
        key: 'framingControlLabel',
        label: messages.wordingFramingControlLabel,
        hint: hints.framingControlLabel,
        gate: 'choosesFraming',
      },
      {
        key: 'placeholderParentsNote',
        label: messages.wordingPlaceholderParentsNote,
        hint: hints.placeholderParentsNote,
        arguments: PEDIGREE_WORDING_ARGUMENTS.placeholderParentsNote,
      },
      {
        key: 'generatedLabelOf',
        label: messages.wordingGeneratedLabelOf,
        hint: hints.generatedLabelOf,
        arguments: PEDIGREE_WORDING_ARGUMENTS.generatedLabelOf,
      },
      {
        key: 'relativeTerm',
        label: messages.wordingRelativeTerm,
        hint: hints.relativeTerm,
        arguments: PEDIGREE_WORDING_ARGUMENTS.relativeTerm,
      },
      { key: 'you', label: messages.wordingYou, hint: hints.you },
    ],
  },
  {
    id: 'connecting',
    root: 'wording',
    settings: [
      {
        key: 'connectQuestion',
        label: messages.wordingConnectQuestion,
        hint: hints.connectQuestion,
        arguments: PEDIGREE_WORDING_ARGUMENTS.connectQuestion,
      },
      {
        key: 'connectParent',
        label: messages.wordingConnectParent,
        hint: hints.connectParent,
        arguments: PEDIGREE_WORDING_ARGUMENTS.connectParent,
      },
      {
        key: 'connectPartners',
        label: messages.wordingConnectPartners,
        hint: hints.connectPartners,
        arguments: PEDIGREE_WORDING_ARGUMENTS.connectPartners,
      },
      {
        key: 'disconnectConfirmTitle',
        label: messages.wordingDisconnectConfirmTitle,
        hint: hints.disconnectConfirmTitle,
        arguments: PEDIGREE_WORDING_ARGUMENTS.disconnectConfirmTitle,
      },
      {
        key: 'disconnectConfirmDescription',
        label: messages.wordingDisconnectConfirmDescription,
        hint: hints.disconnectConfirmDescription,
        wraps: true,
      },
      {
        key: 'disconnectWouldCutOff',
        label: messages.wordingDisconnectWouldCutOff,
        hint: hints.disconnectWouldCutOff,
        arguments: PEDIGREE_WORDING_ARGUMENTS.disconnectWouldCutOff,
      },
      {
        key: 'disconnectStandIn',
        label: messages.wordingDisconnectStandIn,
        hint: hints.disconnectStandIn,
        arguments: PEDIGREE_WORDING_ARGUMENTS.disconnectStandIn,
      },
      {
        key: 'changeWouldCutOff',
        label: messages.wordingChangeWouldCutOff,
        hint: hints.changeWouldCutOff,
        arguments: PEDIGREE_WORDING_ARGUMENTS.changeWouldCutOff,
      },
      {
        key: 'unavailableAncestor',
        label: messages.wordingUnavailableAncestor,
        hint: hints.unavailableAncestor,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableAncestor,
      },
      {
        key: 'removeConfirmTitle',
        label: messages.wordingRemoveConfirmTitle,
        hint: hints.removeConfirmTitle,
        arguments: PEDIGREE_WORDING_ARGUMENTS.removeConfirmTitle,
      },
      {
        key: 'removeConfirmDescription',
        label: messages.wordingRemoveConfirmDescription,
        hint: hints.removeConfirmDescription,
        arguments: PEDIGREE_WORDING_ARGUMENTS.removeConfirmDescription,
      },
      {
        key: 'stillTogetherLabel',
        label: messages.wordingStillTogetherLabel,
        hint: hints.stillTogetherLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.stillTogetherLabel,
      },
    ],
  },
  {
    id: 'adding',
    root: 'wording',
    settings: [
      {
        key: 'panelTitle',
        label: messages.wordingPanelTitle,
        hint: hints.panelTitle,
        arguments: PEDIGREE_WORDING_ARGUMENTS.panelTitle,
      },
      {
        key: 'parentKindLabel',
        label: messages.wordingParentKindLabel,
        hint: hints.parentKindLabel,
      },
      {
        key: 'parentKindCarrier',
        label: messages.wordingParentKindCarrier,
        hint: hints.parentKindCarrier,
        arguments: PEDIGREE_WORDING_ARGUMENTS.parentKindCarrier,
      },
      {
        key: 'biologicalParentLabel',
        label: messages.wordingBiologicalParentLabel,
        hint: hints.biologicalParentLabel,
      },
      {
        key: 'biologicalParentHint',
        label: messages.wordingBiologicalParentHint,
        hint: hints.biologicalParentHint,
        wraps: true,
      },
      {
        key: 'biologicalParentBoth',
        label: messages.wordingBiologicalParentBoth,
        hint: hints.biologicalParentBoth,
        arguments: PEDIGREE_WORDING_ARGUMENTS.biologicalParentBoth,
      },
      {
        key: 'carrierLabel',
        label: messages.wordingCarrierLabel,
        hint: hints.carrierLabel,
      },
      {
        key: 'carrierUnknown',
        label: messages.wordingCarrierUnknown,
        hint: hints.carrierUnknown,
      },
      {
        key: 'otherParentLabel',
        label: messages.wordingOtherParentLabel,
        hint: hints.otherParentLabel,
      },
      {
        key: 'otherParentNone',
        label: messages.wordingOtherParentNone,
        hint: hints.otherParentNone,
      },
      {
        key: 'otherParentUnknown',
        label: messages.wordingOtherParentUnknown,
        hint: hints.otherParentUnknown,
      },
      {
        key: 'otherParentBiologicalLabel',
        label: messages.wordingOtherParentBiologicalLabel,
        hint: hints.otherParentBiologicalLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.otherParentBiologicalLabel,
      },
      {
        key: 'parentPartnerLabel',
        label: messages.wordingParentPartnerLabel,
        hint: hints.parentPartnerLabel,
      },
      {
        key: 'parentLinkKindLabel',
        label: messages.wordingParentLinkKindLabel,
        hint: hints.parentLinkKindLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.parentLinkKindLabel,
      },
      {
        key: 'parentCarriedLabel',
        label: messages.wordingParentCarriedLabel,
        hint: hints.parentCarriedLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.parentCarriedLabel,
      },
      {
        key: 'sharedParentCountLabel',
        label: messages.wordingSharedParentCountLabel,
        hint: hints.sharedParentCountLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedParentCountLabel,
      },
      {
        key: 'sharedParentCountBoth',
        label: messages.wordingSharedParentCountBoth,
        hint: hints.sharedParentCountBoth,
      },
      {
        key: 'sharedParentEggOnly',
        label: messages.wordingSharedParentEggOnly,
        hint: hints.sharedParentEggOnly,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedParentEggOnly,
      },
      {
        key: 'sharedDonorsLabel',
        label: messages.wordingSharedDonorsLabel,
        hint: hints.sharedDonorsLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedDonorsLabel,
      },
      {
        key: 'sharedSurrogateLabel',
        label: messages.wordingSharedSurrogateLabel,
        hint: hints.sharedSurrogateLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedSurrogateLabel,
      },
      {
        key: 'sharedParentsNotSibling',
        label: messages.wordingSharedParentsNotSibling,
        hint: hints.sharedParentsNotSibling,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedParentsNotSibling,
      },
      {
        key: 'siblingKindLabel',
        label: messages.wordingSiblingKindLabel,
        hint: hints.siblingKindLabel,
      },
      {
        key: 'siblingBiologicalParentLabel',
        label: messages.wordingSiblingBiologicalParentLabel,
        hint: hints.siblingBiologicalParentLabel,
      },
      {
        key: 'siblingOtherBiologicalParentLabel',
        label: messages.wordingSiblingOtherBiologicalParentLabel,
        hint: hints.siblingOtherBiologicalParentLabel,
      },
      {
        key: 'siblingTwinLabel',
        label: messages.wordingSiblingTwinLabel,
        hint: hints.siblingTwinLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.siblingTwinLabel,
      },
      {
        key: 'siblingTwinHint',
        label: messages.wordingSiblingTwinHint,
        hint: hints.siblingTwinHint,
        wraps: true,
      },
      {
        key: 'siblingTwinNo',
        label: messages.wordingSiblingTwinNo,
        hint: hints.siblingTwinNo,
      },
      {
        key: 'siblingTwinIdentical',
        label: messages.wordingSiblingTwinIdentical,
        hint: hints.siblingTwinIdentical,
      },
      {
        key: 'siblingTwinFraternal',
        label: messages.wordingSiblingTwinFraternal,
        hint: hints.siblingTwinFraternal,
      },
      {
        key: 'siblingTwinUnknown',
        label: messages.wordingSiblingTwinUnknown,
        hint: hints.siblingTwinUnknown,
      },
      {
        key: 'carriedSiblingsPregnancyLabel',
        label: messages.wordingCarriedSiblingsPregnancyLabel,
        hint: hints.carriedSiblingsPregnancyLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.carriedSiblingsPregnancyLabel,
      },
      {
        key: 'childKindLabel',
        label: messages.wordingChildKindLabel,
        hint: hints.childKindLabel,
      },
      {
        key: 'childKindBiological',
        label: messages.wordingChildKindBiological,
        hint: hints.childKindBiological,
      },
      {
        key: 'childKindAdoptive',
        label: messages.wordingChildKindAdoptive,
        hint: hints.childKindAdoptive,
      },
      {
        key: 'childKindSocial',
        label: messages.wordingChildKindSocial,
        hint: hints.childKindSocial,
        arguments: PEDIGREE_WORDING_ARGUMENTS.childKindSocial,
      },
      {
        key: 'childKindDonor',
        label: messages.wordingChildKindDonor,
        hint: hints.childKindDonor,
        arguments: PEDIGREE_WORDING_ARGUMENTS.childKindDonor,
      },
      {
        key: 'childKindSurrogate',
        label: messages.wordingChildKindSurrogate,
        hint: hints.childKindSurrogate,
        arguments: PEDIGREE_WORDING_ARGUMENTS.childKindSurrogate,
      },
      {
        key: 'alsoParentOfLabel',
        label: messages.wordingAlsoParentOfLabel,
        hint: hints.alsoParentOfLabel,
      },
      {
        key: 'standInPlaceTaken',
        label: messages.wordingStandInPlaceTaken,
        hint: hints.standInPlaceTaken,
        arguments: PEDIGREE_WORDING_ARGUMENTS.standInPlaceTaken,
      },
      {
        key: 'sexAssignedAtBirthLabel',
        label: messages.wordingSexAssignedAtBirthLabel,
        hint: hints.sexAssignedAtBirthLabel,
      },
      {
        key: 'genderIdentityLabel',
        label: messages.wordingGenderIdentityLabel,
        hint: hints.genderIdentityLabel,
        gate: 'asksGenderIdentity',
      },
      {
        key: 'twinsLabel',
        label: messages.wordingTwinsLabel,
        hint: hints.twinsLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.twinsLabel,
      },
      {
        key: 'twinsHint',
        label: messages.wordingTwinsHint,
        hint: hints.twinsHint,
        wraps: true,
      },
      {
        key: 'twinZygosityLabel',
        label: messages.wordingTwinZygosityLabel,
        hint: hints.twinZygosityLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.twinZygosityLabel,
      },
      {
        key: 'zygosityIdentical',
        label: messages.wordingZygosityIdentical,
        hint: hints.zygosityIdentical,
      },
      {
        key: 'zygosityFraternal',
        label: messages.wordingZygosityFraternal,
        hint: hints.zygosityFraternal,
      },
      {
        key: 'identicalTwinSharesParents',
        label: messages.wordingIdenticalTwinSharesParents,
        hint: hints.identicalTwinSharesParents,
        arguments: PEDIGREE_WORDING_ARGUMENTS.identicalTwinSharesParents,
      },
      {
        key: 'unavailableSameSexGeneticParent',
        label: messages.wordingUnavailableSameSexGeneticParent,
        hint: hints.unavailableSameSexGeneticParent,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableSameSexGeneticParent,
      },
      {
        key: 'geneticParentReplaced',
        label: messages.wordingGeneticParentReplaced,
        hint: hints.geneticParentReplaced,
        arguments: PEDIGREE_WORDING_ARGUMENTS.geneticParentReplaced,
      },
      {
        key: 'unavailableGeneticParentsFull',
        label: messages.wordingUnavailableGeneticParentsFull,
        hint: hints.unavailableGeneticParentsFull,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableGeneticParentsFull,
      },
      {
        key: 'unavailableBothSameSex',
        label: messages.wordingUnavailableBothSameSex,
        hint: hints.unavailableBothSameSex,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableBothSameSex,
      },
      {
        key: 'unavailableCarrierRecorded',
        label: messages.wordingUnavailableCarrierRecorded,
        hint: hints.unavailableCarrierRecorded,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableCarrierRecorded,
      },
      {
        key: 'carrierReplaced',
        label: messages.wordingCarrierReplaced,
        hint: hints.carrierReplaced,
        arguments: PEDIGREE_WORDING_ARGUMENTS.carrierReplaced,
      },
      {
        key: 'unavailableCannotCarry',
        label: messages.wordingUnavailableCannotCarry,
        hint: hints.unavailableCannotCarry,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableCannotCarry,
      },
      {
        key: 'unavailableCarried',
        label: messages.wordingUnavailableCarried,
        hint: hints.unavailableCarried,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableCarried,
      },
      {
        key: 'sexChangeEndsCarrying',
        label: messages.wordingSexChangeEndsCarrying,
        hint: hints.sexChangeEndsCarrying,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sexChangeEndsCarrying,
      },
      {
        key: 'sexChangeClearsCoParentSex',
        label: messages.wordingSexChangeClearsCoParentSex,
        hint: hints.sexChangeClearsCoParentSex,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sexChangeClearsCoParentSex,
      },
    ],
  },
  {
    id: 'checklist',
    root: 'completeness',
    gate: 'checksCompleteness',
    settings: [
      {
        key: 'itemText.parents.listItem',
        label: messages.trackerParentsLabel,
        hint: hints.parentsListItem,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'itemText.siblings.listItem',
        label: messages.trackerSiblingsLabel,
        hint: hints.siblingsListItem,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'itemText.siblings.noneButton',
        label: messages.trackerNoSiblingsLabel,
        hint: hints.siblingsNoneButton,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'itemText.siblings.question',
        label: messages.trackerSiblingsQuestionLabel,
        hint: hints.siblingsQuestion,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'itemText.children.listItem',
        label: messages.trackerChildrenLabel,
        hint: hints.childrenListItem,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'itemText.children.noneButton',
        label: messages.trackerNoChildrenLabel,
        hint: hints.childrenNoneButton,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'itemText.children.question',
        label: messages.trackerChildrenQuestionLabel,
        hint: hints.childrenQuestion,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'itemText.details.listItem',
        label: messages.trackerDetailsLabel,
        hint: hints.detailsListItem,
        arguments: PEDIGREE_PERSON_ARGUMENTS,
      },
      {
        key: 'recommendedNote',
        label: messages.trackerRecommendedNoteLabel,
        hint: hints.recommendedNote,
        wraps: true,
      },
    ],
  },
];
