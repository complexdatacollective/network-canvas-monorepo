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

type WordingGroup = Readonly<{
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
    title: messages.wordingAddingTitle,
    settings: [
      {
        key: 'panelTitle',
        label: messages.wordingPanelTitle,
        arguments: PEDIGREE_WORDING_ARGUMENTS.panelTitle,
      },
      { key: 'parentKindLabel', label: messages.wordingParentKindLabel },
      {
        key: 'parentKindBiologicalCarrier',
        label: messages.wordingParentKindBiologicalCarrier,
        arguments: PEDIGREE_WORDING_ARGUMENTS.parentKindBiologicalCarrier,
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
        key: 'sharedParentUnshown',
        label: messages.wordingSharedParentUnshown,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sharedParentUnshown,
      },
      { key: 'siblingKindLabel', label: messages.wordingSiblingKindLabel },
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
        key: 'sexRuledOutHint',
        label: messages.wordingSexRuledOutHint,
        arguments: PEDIGREE_WORDING_ARGUMENTS.sexRuledOutHint,
      },
    ],
  },
];
