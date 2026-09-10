import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What the canvas interfaces say about how a stage arranges its nodes and what
 * the participant may do to them.
 *
 * One file rather than descriptors beside each section's markup, which is the
 * rule elsewhere in this package, because of the seam: an interface whose
 * manual mode looks nothing like the shared one hands `nodeLayout` its own
 * sentence as a `MessageDescriptor`, and a sentence declared where it is
 * rendered would leave a translator reading half of one decision in two files.
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
});
