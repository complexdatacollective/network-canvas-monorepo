import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What a canvas interface says about how it arranges its nodes.
 *
 * One file rather than descriptors beside the markup, which is the rule
 * elsewhere in this package, because the section and the control it renders
 * are two files and the cards' words are one decision: a translator reading
 * "Manual mode" needs the sentence under it in front of them.
 */
export const canvasBehavioursMessages = defineMessages({
  nodeLayoutTitle: {
    id: 'protocolBuilder.networkCanvas.nodeLayoutTitle',
    defaultMessage: 'Node layout',
    description:
      'Heading of the section deciding how a canvas arranges its nodes when the stage opens. Also names the section in the editor outline and to assistive technology.',
  },
  nodeLayoutDescription: {
    id: 'protocolBuilder.networkCanvas.nodeLayoutDescription',
    defaultMessage: 'Choose how nodes are arranged when this stage opens.',
    description:
      'Description of the node-layout section. A stage is one step of an interview.',
  },
  layoutModeLabel: {
    id: 'protocolBuilder.networkCanvas.layoutModeLabel',
    defaultMessage: 'Layout mode',
    description:
      'Label of the control choosing between manual and automatic node layout.',
  },
  layoutModeHint: {
    id: 'protocolBuilder.networkCanvas.layoutModeHint',
    defaultMessage:
      'How the stage arranges nodes before the participant moves any of them.',
    description: 'Guidance under the layout-mode control.',
  },
  layoutModeManualLabel: {
    id: 'protocolBuilder.networkCanvas.layoutModeManualLabel',
    defaultMessage: 'Manual mode',
    description:
      'Name of the choice where the stage does not arrange nodes at all and the participant places every one of them by hand. Offered as one of two cards; the sentence under it is layoutModeManualDescription.',
  },
  layoutModeManualDescription: {
    id: 'protocolBuilder.networkCanvas.layoutModeManualDescription',
    defaultMessage:
      'Places all nodes in a "bucket" at the bottom of the screen, from which the participant drags each one to where they want it.',
    description:
      'Says what the participant sees in manual layout mode. The "bucket" is the holding area at the foot of the canvas that unplaced nodes wait in; the quotation marks are in the English because it is a nickname for that area rather than a formal name.',
  },
  layoutModeManualNarrativeDescription: {
    id: 'protocolBuilder.networkCanvas.layoutModeManualNarrativeDescription',
    defaultMessage:
      'Shows every node at the position already stored in the attribute the preset positions by. A node that attribute holds no position for is left off the canvas.',
    description:
      'Says what the participant sees in manual layout mode on a narrative stage, which is shown a network that has already been built rather than collecting positions of its own. Replaces layoutModeManualDescription there, and is declared beside it so a translator reads the two wordings of one control together.',
  },
  layoutModeManualComposerDescription: {
    id: 'protocolBuilder.networkCanvas.layoutModeManualComposerDescription',
    defaultMessage:
      'Places each node where there is room for it as the participant adds it, leaving them to drag it wherever they want.',
    description:
      'Says what the participant sees in manual layout mode on a network composer stage, where they add the nodes themselves rather than being given a set of them to place. Replaces layoutModeManualDescription there, and is declared beside it so a translator reads the wordings of one control together.',
  },
  layoutModeAutomaticLabel: {
    id: 'protocolBuilder.networkCanvas.layoutModeAutomaticLabel',
    defaultMessage: 'Automatic mode',
    description:
      'Name of the choice where the stage arranges the nodes itself before the participant touches them. Offered as one of two cards; the sentence under it is layoutModeAutomaticDescription.',
  },
  layoutModeAutomaticDescription: {
    id: 'protocolBuilder.networkCanvas.layoutModeAutomaticDescription',
    defaultMessage:
      'Positions nodes when the stage first opens by simulating physical forces such as attraction and repulsion. The participant can pause and resume the simulation, and reposition nodes by hand while it is paused.',
    description:
      'Says what the participant sees in automatic layout mode. A stage is one step of an interview; the simulation runs on the canvas while the participant watches.',
  },
  layoutModeAutomaticComposerDescription: {
    id: 'protocolBuilder.networkCanvas.layoutModeAutomaticComposerDescription',
    defaultMessage:
      'Starts the stage with the simulation running. The participant can switch it off and on as they work, and the stage reopens the way they left it.',
    description:
      'Says what the participant sees in automatic layout mode on a network composer stage, where the setting decides only how the stage starts because the participant has a switch of their own. Replaces layoutModeAutomaticDescription there, and is declared beside it so a translator reads the wordings of one control together.',
  },
});
