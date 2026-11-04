import { defineMessages } from '@codaco/app-i18n/messages';
import walkthroughManifest from '@codaco/interface-images/walkthroughManifest';

import type { StageWalkthroughFrame } from './walkthroughTypes.ts';

const stills = walkthroughManifest.NetworkComposer;

const messages = defineMessages({
  canvasAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.canvasAlt',
    defaultMessage:
      'The interview canvas with six people, some connected by lines, and the tool bar along its edge.',
    description:
      'Alternative text for a screenshot of the Network Composer as an interviewer sees it.',
  },
  quickAddAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.quickAddAlt',
    defaultMessage:
      'The Add Node tool open on the canvas, with a name being typed into its name box.',
    description:
      'Alternative text for a screenshot of the Network Composer with its add-node name box open.',
  },
  automaticLayoutAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.automaticLayoutAlt',
    defaultMessage:
      'The same people arranged by automatic layout, with connected people drawn close together.',
    description:
      'Alternative text for a screenshot of the Network Composer with automatic layout on.',
  },
  groupsAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.groupsAlt',
    defaultMessage:
      'The same people with a shaded area around each group, one for family and one for work.',
    description:
      'Alternative text for a screenshot of the Network Composer with people shaded by group.',
  },
  nodeFormAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.nodeFormAlt',
    defaultMessage:
      'A person selected on the canvas, with a side panel asking their age and how close the participant feels to them.',
    description:
      'Alternative text for a screenshot of the Network Composer with the questions about a selected person open.',
  },
  noConnectionsAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.noConnectionsAlt',
    defaultMessage:
      'The same people with no connections between them, and no Draw Edge tool in the tool bar.',
    description:
      'Alternative text for a screenshot of the Network Composer with no connection types.',
  },
  drawConnectionAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.drawConnectionAlt',
    defaultMessage:
      'The Draw Edge menu open, listing two kinds of connection to draw: Friendship and Works with.',
    description:
      'Alternative text for a screenshot of the Network Composer with its connection-type menu open.',
  },
  backgroundImageAlt: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.backgroundImageAlt',
    defaultMessage:
      'The same people over an image of four named areas: family, friends, work or study, and community.',
    description:
      'Alternative text for a screenshot of the Network Composer with an image as its background.',
  },
  off: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.off',
    defaultMessage: 'Off',
    description:
      'Label of the switch position that shows the interview with a setting turned off.',
  },
  on: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.on',
    defaultMessage: 'On',
    description:
      'Label of the switch position that shows the interview with a setting turned on.',
  },
  withoutGroups: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.withoutGroups',
    defaultMessage: 'No groups',
    description:
      'Label of the switch position that shows the interview canvas without groups.',
  },
  withGroups: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.withGroups',
    defaultMessage: 'Groups',
    description:
      'Label of the switch position that shows the interview canvas with people shaded by group.',
  },
  withoutConnections: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.withoutConnections',
    defaultMessage: 'No connections',
    description:
      'Label of the switch position that shows the interview canvas with no connection types.',
  },
  withConnections: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.withConnections',
    defaultMessage: 'Connections',
    description:
      'Label of the switch position that shows the interview canvas with connections drawn.',
  },
  circles: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.circles',
    defaultMessage: 'Circles',
    description:
      'Label of the switch position that shows the canvas with a concentric-circles background.',
  },
  image: {
    id: 'protocolBuilder.walkthrough.networkComposer.visual.image',
    defaultMessage: 'Image',
    description:
      'Label of the switch position that shows the canvas with an image background.',
  },
});

const canvas = (label?: StageWalkthroughFrame['label']) => ({
  still: stills.canvas,
  alt: messages.canvasAlt,
  ...(label === undefined ? {} : { label }),
});

/** What each Network Composer setting looks like in the interview. */
export const networkComposerVisuals = {
  canvas: [canvas()],
  quickAdd: [{ still: stills.quickAdd, alt: messages.quickAddAlt }],
  automaticLayout: [
    canvas(messages.off),
    {
      still: stills.automaticLayout,
      alt: messages.automaticLayoutAlt,
      label: messages.on,
    },
  ],
  groups: [
    canvas(messages.withoutGroups),
    {
      still: stills.groups,
      alt: messages.groupsAlt,
      label: messages.withGroups,
    },
  ],
  nodeForm: [{ still: stills.nodeForm, alt: messages.nodeFormAlt }],
  connections: [
    {
      still: stills.noConnections,
      alt: messages.noConnectionsAlt,
      label: messages.withoutConnections,
    },
    canvas(messages.withConnections),
  ],
  drawConnection: [
    { still: stills.drawConnection, alt: messages.drawConnectionAlt },
  ],
  background: [
    canvas(messages.circles),
    {
      still: stills.backgroundImage,
      alt: messages.backgroundImageAlt,
      label: messages.image,
    },
  ],
} satisfies Record<string, readonly StageWalkthroughFrame[]>;
