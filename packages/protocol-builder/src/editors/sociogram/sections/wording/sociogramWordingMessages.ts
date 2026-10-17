import { defineMessages } from '@codaco/app-i18n/messages';

export const sociogramWordingMessages = defineMessages({
  wordingTitle: {
    id: 'protocolBuilder.sociogram.wordingTitle',
    defaultMessage: 'Words on the canvas',
    description:
      'Heading of the section holding the words a participant reads on a sociogram canvas. Also names the section in the editor outline and to assistive technology.',
  },
  wordingDescription: {
    id: 'protocolBuilder.sociogram.wordingDescription',
    defaultMessage:
      'The labels of the layout tools. These start with wording Network Canvas supplies, which you can change.',
    description: 'Description of the words section of a sociogram canvas.',
  },
  pauseLayoutTooltipLabel: {
    id: 'protocolBuilder.sociogram.pauseLayoutTooltipLabel',
    defaultMessage: 'Pause layout tooltip',
    description:
      'Label of the setting holding the tooltip of the tool that pauses the automatic layout.',
  },
  resumeLayoutTooltipLabel: {
    id: 'protocolBuilder.sociogram.resumeLayoutTooltipLabel',
    defaultMessage: 'Resume layout tooltip',
    description:
      'Label of the setting holding the tooltip of the tool that resumes the automatic layout.',
  },
  layoutTooltipHint: {
    id: 'protocolBuilder.sociogram.layoutTooltipHint',
    defaultMessage: 'Shown only when automatic layout is turned on.',
    description:
      'Hint under the layout tooltip settings, saying when they are used.',
  },
});
