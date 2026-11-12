import { defineMessages } from '@codaco/app-i18n/messages';

// Kept apart from `StageWordingSection`, so `localizedTextNames.ts` can name
// the section without importing the editors that render it.
export const stageWordingMessages = defineMessages({
  title: {
    id: 'protocolBuilder.stageWording.title',
    defaultMessage: 'Customize built-in wording',
    description:
      'Title of the stage editor section, found on every stage type that has any, where the researcher can change the words Network Canvas supplies for the interface a participant uses on that stage, such as button labels, hints and messages. It can be switched on and off.',
  },
  description: {
    id: 'protocolBuilder.stageWording.description',
    defaultMessage:
      'Optionally edit the wording for interface elements used by this stage type. Default wording is provided for built-in languages.',
    description:
      'Explains the stage editor section titled “Customize built-in wording”. Interface elements are the buttons, hints and messages the participant sees on the stage. Built-in languages are the languages Network Canvas itself supplies this wording in; for other languages the researcher writes it.',
  },
  specificHeading: {
    id: 'protocolBuilder.stageWording.specificHeading',
    defaultMessage: 'Specific to this stage',
    description:
      'Heading of the part of a stage’s “Customize built-in wording” section holding the words only this stage shows, opened and closed by clicking it. Shown beside the part headed “Shared by every stage of this kind”.',
  },
  sharedHeading: {
    id: 'protocolBuilder.stageWording.sharedHeading',
    defaultMessage: 'Shared by every stage of this kind',
    description:
      'Heading of the part of a stage’s “Customize built-in wording” section holding the words every stage of the same type shows alike, such as the zoom buttons of every Family Pedigree stage, opened and closed by clicking it. The protocol holds them once, for all those stages.',
  },
  switchOffTitle: {
    id: 'protocolBuilder.stageWording.switchOffTitle',
    defaultMessage: 'Use Network Canvas’s wording?',
    description:
      'Title of the dialog asking a researcher to confirm switching off a stage’s Wording section after they changed some of its wording.',
  },
  switchOffDescription: {
    id: 'protocolBuilder.stageWording.switchOffDescription',
    defaultMessage:
      'The wording you changed in this section goes back to Network Canvas’s wording, in every language.',
    description:
      'Body of the dialog asking a researcher to confirm switching off a stage’s Wording section. Says what they lose: each text they changed returns to the wording Network Canvas supplies, in every one of the protocol’s languages.',
  },
  switchOffSharedDescription: {
    id: 'protocolBuilder.stageWording.switchOffSharedDescription',
    defaultMessage:
      'The wording you changed in this section goes back to Network Canvas’s wording, in every language. That includes the wording shared by every stage of this kind, which changes on all of those stages straight away.',
    description:
      'Body of the dialog asking a researcher to confirm switching off a stage’s “Customize built-in wording” section when they changed some of the words every stage of the same type shares. Says what they lose: each text they changed returns to the wording Network Canvas supplies, in every one of the protocol’s languages; the shared words change on every such stage, and at once rather than when the stage is saved.',
  },
  switchOffConfirm: {
    id: 'protocolBuilder.stageWording.switchOffConfirm',
    defaultMessage: 'Use Network Canvas’s wording',
    description:
      'Confirm button of the dialog that switches off a stage’s Wording section and puts back the wording Network Canvas supplies.',
  },
});
