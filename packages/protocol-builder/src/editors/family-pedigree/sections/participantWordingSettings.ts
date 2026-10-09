import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import {
  type MessageArguments,
  PEDIGREE_WORDING_ARGUMENTS,
} from '@codaco/protocol-validation';

import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';

/**
 * A setting the stage holds only while its configuration is on. The schema
 * requires it then, so the editor shows it then and no other time.
 */
export type WordingGate = 'choosesFraming' | 'asksGenderIdentity';

type WordingSetting = Readonly<{
  /** The setting's key under the stage's `wording`. */
  key: string;
  label: MessageDescriptor;
  /** Set for a setting whose text takes values, such as a name. */
  arguments?: MessageArguments;
  gate?: WordingGate;
  hint?: MessageDescriptor;
}>;

export type WordingGroup = Readonly<{
  /** Names the group among the open ones. */
  id: string;
  title: MessageDescriptor;
  settings: readonly WordingSetting[];
}>;

/**
 * The words in the order a participant meets them: first the canvas they
 * draw on, then the connections they make, then the side panel for each
 * family member they add.
 */
export const PARTICIPANT_WORDING_GROUPS: readonly WordingGroup[] = [
  {
    id: 'drawing',
    title: messages.wordingDrawingTitle,
    settings: [
      { key: 'pointerTool', label: messages.wordingPointerTool },
      { key: 'connectTool', label: messages.wordingConnectTool },
      { key: 'disconnectTool', label: messages.wordingDisconnectTool },
      { key: 'connectHint', label: messages.wordingConnectHint },
      { key: 'disconnectHint', label: messages.wordingDisconnectHint },
      {
        key: 'framingChoiceTitle',
        label: messages.wordingFramingChoiceTitle,
        gate: 'choosesFraming',
        hint: messages.wordingChoosesFramingHint,
      },
      {
        key: 'framingChoiceDescription',
        label: messages.wordingFramingChoiceDescription,
        gate: 'choosesFraming',
        hint: messages.wordingChoosesFramingHint,
      },
      {
        key: 'framingControlLabel',
        label: messages.wordingFramingControlLabel,
        gate: 'choosesFraming',
        hint: messages.wordingChoosesFramingHint,
      },
      {
        key: 'placeholderParentsNote',
        label: messages.wordingPlaceholderParentsNote,
        arguments: PEDIGREE_WORDING_ARGUMENTS.placeholderParentsNote,
      },
      {
        key: 'generatedLabelOf',
        label: messages.wordingGeneratedLabelOf,
        arguments: PEDIGREE_WORDING_ARGUMENTS.generatedLabelOf,
      },
      {
        key: 'relativeTerm',
        label: messages.wordingRelativeTerm,
        arguments: PEDIGREE_WORDING_ARGUMENTS.relativeTerm,
      },
      { key: 'you', label: messages.wordingYou },
      { key: 'save', label: messages.wordingSave },
      { key: 'dontKnow', label: messages.wordingDontKnow },
      {
        key: 'missingDetailsList',
        label: messages.wordingMissingDetailsList,
        arguments: PEDIGREE_WORDING_ARGUMENTS.missingDetailsList,
      },
    ],
  },
  {
    id: 'connecting',
    title: messages.wordingConnectingTitle,
    settings: [
      {
        key: 'connectQuestion',
        label: messages.wordingConnectQuestion,
        arguments: PEDIGREE_WORDING_ARGUMENTS.connectQuestion,
      },
      {
        key: 'connectParent',
        label: messages.wordingConnectParent,
        arguments: PEDIGREE_WORDING_ARGUMENTS.connectParent,
      },
      {
        key: 'connectPartners',
        label: messages.wordingConnectPartners,
        arguments: PEDIGREE_WORDING_ARGUMENTS.connectPartners,
      },
      {
        key: 'disconnectConfirmTitle',
        label: messages.wordingDisconnectConfirmTitle,
        arguments: PEDIGREE_WORDING_ARGUMENTS.disconnectConfirmTitle,
      },
      {
        key: 'disconnectConfirmDescription',
        label: messages.wordingDisconnectConfirmDescription,
      },
      {
        key: 'disconnectWouldCutOff',
        label: messages.wordingDisconnectWouldCutOff,
        arguments: PEDIGREE_WORDING_ARGUMENTS.disconnectWouldCutOff,
      },
      {
        key: 'changeWouldCutOff',
        label: messages.wordingChangeWouldCutOff,
        arguments: PEDIGREE_WORDING_ARGUMENTS.changeWouldCutOff,
      },
      {
        key: 'unavailableAncestor',
        label: messages.wordingUnavailableAncestor,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableAncestor,
      },
      {
        key: 'unavailableCarrierChoice',
        label: messages.wordingUnavailableCarrierChoice,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableCarrierChoice,
      },
      {
        key: 'removeConfirmTitle',
        label: messages.wordingRemoveConfirmTitle,
        arguments: PEDIGREE_WORDING_ARGUMENTS.removeConfirmTitle,
      },
      {
        key: 'removeConfirmDescription',
        label: messages.wordingRemoveConfirmDescription,
        arguments: PEDIGREE_WORDING_ARGUMENTS.removeConfirmDescription,
      },
      {
        key: 'stillTogetherLabel',
        label: messages.wordingStillTogetherLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.stillTogetherLabel,
      },
    ],
  },
  {
    id: 'adding',
    title: messages.wordingAddingTitle,
    settings: [
      {
        key: 'panelTitle',
        label: messages.wordingPanelTitle,
        arguments: PEDIGREE_WORDING_ARGUMENTS.panelTitle,
      },
      { key: 'parentKindLabel', label: messages.wordingParentKindLabel },
      {
        key: 'parentKindCarrier',
        label: messages.wordingParentKindCarrier,
        arguments: PEDIGREE_WORDING_ARGUMENTS.parentKindCarrier,
      },
      {
        key: 'biologicalParentLabel',
        label: messages.wordingBiologicalParentLabel,
      },
      {
        key: 'biologicalParentHint',
        label: messages.wordingBiologicalParentHint,
      },
      {
        key: 'biologicalParentBoth',
        label: messages.wordingBiologicalParentBoth,
        arguments: PEDIGREE_WORDING_ARGUMENTS.biologicalParentBoth,
      },
      { key: 'carrierLabel', label: messages.wordingCarrierLabel },
      { key: 'carrierUnknown', label: messages.wordingCarrierUnknown },
      { key: 'otherParentLabel', label: messages.wordingOtherParentLabel },
      { key: 'otherParentNone', label: messages.wordingOtherParentNone },
      { key: 'otherParentUnknown', label: messages.wordingOtherParentUnknown },
      { key: 'parentPartnerLabel', label: messages.wordingParentPartnerLabel },
      {
        key: 'parentLinkKindLabel',
        label: messages.wordingParentLinkKindLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.parentLinkKindLabel,
      },
      {
        key: 'parentCarriedLabel',
        label: messages.wordingParentCarriedLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.parentCarriedLabel,
      },
      {
        key: 'sharedParentCountLabel',
        label: messages.wordingSharedParentCountLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedParentCountLabel,
      },
      {
        key: 'sharedParentCountBoth',
        label: messages.wordingSharedParentCountBoth,
      },
      {
        key: 'sharedParentEggOnly',
        label: messages.wordingSharedParentEggOnly,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedParentEggOnly,
      },
      {
        key: 'sharedDonorsLabel',
        label: messages.wordingSharedDonorsLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedDonorsLabel,
      },
      { key: 'siblingKindLabel', label: messages.wordingSiblingKindLabel },
      {
        key: 'siblingBiologicalParentLabel',
        label: messages.wordingSiblingBiologicalParentLabel,
      },
      {
        key: 'siblingTwinLabel',
        label: messages.wordingSiblingTwinLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.siblingTwinLabel,
      },
      { key: 'siblingTwinHint', label: messages.wordingSiblingTwinHint },
      { key: 'siblingTwinNo', label: messages.wordingSiblingTwinNo },
      {
        key: 'siblingTwinIdentical',
        label: messages.wordingSiblingTwinIdentical,
      },
      {
        key: 'siblingTwinFraternal',
        label: messages.wordingSiblingTwinFraternal,
      },
      { key: 'siblingTwinUnknown', label: messages.wordingSiblingTwinUnknown },
      {
        key: 'unavailableIdenticalTwinNew',
        label: messages.wordingUnavailableIdenticalTwinNew,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableIdenticalTwinNew,
      },
      {
        key: 'carriedSiblingsPregnancyLabel',
        label: messages.wordingCarriedSiblingsPregnancyLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.carriedSiblingsPregnancyLabel,
      },
      { key: 'childKindLabel', label: messages.wordingChildKindLabel },
      {
        key: 'childKindBiological',
        label: messages.wordingChildKindBiological,
      },
      { key: 'childKindAdoptive', label: messages.wordingChildKindAdoptive },
      { key: 'childKindSocial', label: messages.wordingChildKindSocial },
      { key: 'childKindDonor', label: messages.wordingChildKindDonor },
      { key: 'childKindSurrogate', label: messages.wordingChildKindSurrogate },
      { key: 'alsoParentOfLabel', label: messages.wordingAlsoParentOfLabel },
      {
        key: 'sexAssignedAtBirthLabel',
        label: messages.wordingSexAssignedAtBirthLabel,
      },
      {
        key: 'genderIdentityLabel',
        label: messages.wordingGenderIdentityLabel,
        gate: 'asksGenderIdentity',
        hint: messages.wordingGenderIdentityHint,
      },
      {
        key: 'twinsLabel',
        label: messages.wordingTwinsLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.twinsLabel,
      },
      { key: 'twinsHint', label: messages.wordingTwinsHint },
      {
        key: 'twinZygosityLabel',
        label: messages.wordingTwinZygosityLabel,
        arguments: PEDIGREE_WORDING_ARGUMENTS.twinZygosityLabel,
      },
      { key: 'zygosityIdentical', label: messages.wordingZygosityIdentical },
      { key: 'zygosityFraternal', label: messages.wordingZygosityFraternal },
      { key: 'zygosityUnknown', label: messages.wordingZygosityUnknown },
      {
        key: 'unavailableIdenticalTwin',
        label: messages.wordingUnavailableIdenticalTwin,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableIdenticalTwin,
      },
      {
        key: 'unavailableSameSexGeneticParent',
        label: messages.wordingUnavailableSameSexGeneticParent,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableSameSexGeneticParent,
      },
      {
        key: 'unavailableGeneticParentsFull',
        label: messages.wordingUnavailableGeneticParentsFull,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableGeneticParentsFull,
      },
      {
        key: 'unavailableBothSameSex',
        label: messages.wordingUnavailableBothSameSex,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableBothSameSex,
      },
      {
        key: 'unavailableCarrierRecorded',
        label: messages.wordingUnavailableCarrierRecorded,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableCarrierRecorded,
      },
      {
        key: 'unavailableCannotCarry',
        label: messages.wordingUnavailableCannotCarry,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableCannotCarry,
      },
      {
        key: 'unavailableCarried',
        label: messages.wordingUnavailableCarried,
        arguments: PEDIGREE_WORDING_ARGUMENTS.unavailableCarried,
      },
    ],
  },
];
