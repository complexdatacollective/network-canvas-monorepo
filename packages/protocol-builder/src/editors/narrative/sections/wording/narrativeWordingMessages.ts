import { defineMessages } from '@codaco/app-i18n/messages';

export const narrativeWordingMessages = defineMessages({
  wordingTitle: {
    id: 'protocolBuilder.narrative.wordingTitle',
    defaultMessage: 'Words on the canvas',
    description:
      'Heading of the section holding the words a participant reads on a narrative canvas: the headings of its panels and the labels of its tools. Also names the section in the editor outline and to assistive technology.',
  },
  wordingDescription: {
    id: 'protocolBuilder.narrative.wordingDescription',
    defaultMessage:
      'The headings of the highlight, link and group panels, and the labels of the drawing tools. These start with wording Network Canvas supplies, which you can change.',
    description: 'Description of the words section of a narrative canvas.',
  },
  attributesHeadingLabel: {
    id: 'protocolBuilder.narrative.attributesHeadingLabel',
    defaultMessage: 'Attributes heading',
    description:
      'Label of the setting holding the heading of the panel that lists what a preset highlights.',
  },
  attributesHeadingHint: {
    id: 'protocolBuilder.narrative.attributesHeadingHint',
    defaultMessage: 'Shown only when a preset highlights members.',
    description:
      'Hint under the attributes heading setting, saying when the setting is used.',
  },
  linksHeadingLabel: {
    id: 'protocolBuilder.narrative.linksHeadingLabel',
    defaultMessage: 'Links heading',
    description:
      'Label of the setting holding the heading of the panel that lists the connections a preset shows.',
  },
  linksHeadingHint: {
    id: 'protocolBuilder.narrative.linksHeadingHint',
    defaultMessage: 'Shown only when a preset shows connections.',
    description:
      'Hint under the links heading setting, saying when the setting is used.',
  },
  groupsHeadingLabel: {
    id: 'protocolBuilder.narrative.groupsHeadingLabel',
    defaultMessage: 'Groups heading',
    description:
      'Label of the setting holding the heading of the panel that lists the groups a preset shows.',
  },
  groupsHeadingHint: {
    id: 'protocolBuilder.narrative.groupsHeadingHint',
    defaultMessage: 'Shown only when a preset groups members.',
    description:
      'Hint under the groups heading setting, saying when the setting is used.',
  },
  enableDrawingTooltipLabel: {
    id: 'protocolBuilder.narrative.enableDrawingTooltipLabel',
    defaultMessage: 'Enable drawing tooltip',
    description:
      'Label of the setting holding the tooltip of the tool that turns drawing on.',
  },
  disableDrawingTooltipLabel: {
    id: 'protocolBuilder.narrative.disableDrawingTooltipLabel',
    defaultMessage: 'Disable drawing tooltip',
    description:
      'Label of the setting holding the tooltip of the tool that turns drawing off.',
  },
  freezeAnnotationsTooltipLabel: {
    id: 'protocolBuilder.narrative.freezeAnnotationsTooltipLabel',
    defaultMessage: 'Freeze annotations tooltip',
    description:
      'Label of the setting holding the tooltip of the tool that freezes the drawn annotations in place.',
  },
  unfreezeAnnotationsTooltipLabel: {
    id: 'protocolBuilder.narrative.unfreezeAnnotationsTooltipLabel',
    defaultMessage: 'Unfreeze annotations tooltip',
    description:
      'Label of the setting holding the tooltip of the tool that lets the drawn annotations move again.',
  },
  resetAnnotationsTooltipLabel: {
    id: 'protocolBuilder.narrative.resetAnnotationsTooltipLabel',
    defaultMessage: 'Reset annotations tooltip',
    description:
      'Label of the setting holding the tooltip of the tool that removes every drawn annotation.',
  },
  drawingTooltipHint: {
    id: 'protocolBuilder.narrative.drawingTooltipHint',
    defaultMessage: 'Shown only when drawing is turned on.',
    description:
      'Hint under the drawing tooltip settings, saying when they are used.',
  },
});
