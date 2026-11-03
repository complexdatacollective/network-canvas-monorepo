import { defineMessages } from '@codaco/app-i18n/messages';

export const narrativeWordingMessages = defineMessages({
  attributesHeadingLabel: {
    id: 'protocolBuilder.narrative.attributesHeadingLabel',
    defaultMessage: 'Attributes heading',
    description:
      'Label of the setting holding the heading of the panel that lists what a preset highlights.',
  },
  attributesHeadingHint: {
    id: 'protocolBuilder.narrative.attributesHeadingHint',
    defaultMessage:
      'Heading of the panel that lists what the current preset highlights. Only used when a preset highlights nodes.',
    description:
      'Hint under the setting holding the attributes heading, in the Customize built-in wording section of the Narrative stage editor. It tells the researcher where the participant sees this text and what it is for. A preset is a saved view of the canvas the researcher sets up.',
  },
  linksHeadingLabel: {
    id: 'protocolBuilder.narrative.linksHeadingLabel',
    defaultMessage: 'Links heading',
    description:
      'Label of the setting holding the heading of the panel that lists the connections a preset shows.',
  },
  linksHeadingHint: {
    id: 'protocolBuilder.narrative.linksHeadingHint',
    defaultMessage:
      'Heading of the panel that lists the edges the current preset shows. Only used when a preset shows edges.',
    description:
      'Hint under the setting holding the links heading, in the Customize built-in wording section of the Narrative stage editor. It tells the researcher where the participant sees this text and what it is for. A preset is a saved view of the canvas the researcher sets up.',
  },
  groupsHeadingLabel: {
    id: 'protocolBuilder.narrative.groupsHeadingLabel',
    defaultMessage: 'Groups heading',
    description:
      'Label of the setting holding the heading of the panel that lists the groups a preset shows.',
  },
  groupsHeadingHint: {
    id: 'protocolBuilder.narrative.groupsHeadingHint',
    defaultMessage:
      'Heading of the panel that lists the groups the current preset shows. Only used when a preset groups nodes.',
    description:
      'Hint under the setting holding the groups heading, in the Customize built-in wording section of the Narrative stage editor. It tells the researcher where the participant sees this text and what it is for. A preset is a saved view of the canvas the researcher sets up.',
  },
});
