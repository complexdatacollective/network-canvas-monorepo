import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What the two bin interfaces say about how the participant places people in
 * their bins.
 *
 * One file for the section and the control it renders, as with the canvas
 * behaviours: a translator reading a card's name needs the sentence under it.
 */
export const binBehavioursMessages = defineMessages({
  title: {
    id: 'protocolBuilder.binBehaviours.title',
    defaultMessage: 'Placing nodes',
    description:
      'Heading of the section deciding how the participant puts each node into a bin on a sorting stage. A node is one member of the network the participant is building; a bin is one of the groups or points on a scale they sort nodes into. Also names the section in the editor outline and to assistive technology.',
  },
  description: {
    id: 'protocolBuilder.binBehaviours.description',
    defaultMessage: 'Choose how the participant puts each node into a bin.',
    description: 'Description of the section named above.',
  },
  interactionModeLabel: {
    id: 'protocolBuilder.binBehaviours.interactionModeLabel',
    defaultMessage: 'Interaction mode',
    description:
      'Label of the control choosing between dragging nodes into bins and tapping a bin to place the selected node.',
  },
  dragLabel: {
    id: 'protocolBuilder.binBehaviours.dragLabel',
    defaultMessage: 'Drag and drop',
    description:
      'Name of the choice where the participant drags each node from a tray at the bottom of the screen onto a bin. Offered as one of two cards; the sentence under it is dragDescription.',
  },
  dragDescription: {
    id: 'protocolBuilder.binBehaviours.dragDescription',
    defaultMessage:
      'The participant drags each node from the drawer at the bottom of the screen onto the bin it belongs in.',
    description:
      'Says what the participant does in drag-and-drop mode. The drawer is the tray at the foot of the screen that unplaced nodes wait in.',
  },
  selectLabel: {
    id: 'protocolBuilder.binBehaviours.selectLabel',
    defaultMessage: 'Tap to place',
    description:
      'Name of the choice where one node is selected and the participant taps the bin it belongs in. Offered as one of two cards; the sentence under it is selectDescription.',
  },
  selectDescription: {
    id: 'protocolBuilder.binBehaviours.selectDescription',
    defaultMessage:
      'One node in the drawer is selected, and the participant taps the bin it belongs in. The next node is then selected. Tapping a different node, even one already in a bin, selects it instead.',
    description:
      'Says what the participant does in tap-to-place mode. The drawer is the tray at the foot of the screen that unplaced nodes wait in; the selected node is highlighted there. A bin is one of the groups or points on a scale nodes are sorted into.',
  },
  requireCompletePlacementLabel: {
    id: 'protocolBuilder.binBehaviours.requireCompletePlacementLabel',
    defaultMessage: 'Require every node to be placed',
    description:
      'Label of the switch that stops the participant moving on from a bin stage while any member of their network is still waiting to be placed into a bin.',
  },
  requireCompletePlacementHint: {
    id: 'protocolBuilder.binBehaviours.requireCompletePlacementHint',
    defaultMessage:
      'The participant cannot continue from a prompt until every node is in a bin.',
    description:
      'Guidance under the switch requiring every member of the network to be placed. A prompt is one question on the stage; the rule applies to each question in turn.',
  },
  unplacedNoticeLabel: {
    id: 'protocolBuilder.binBehaviours.unplacedNoticeLabel',
    defaultMessage: 'Nodes not yet placed',
    description:
      'Label of the field holding the message a participant sees when they try to continue while a member of their network is still waiting to be placed into a bin.',
  },
  unplacedNoticeHint: {
    id: 'protocolBuilder.binBehaviours.unplacedNoticeHint',
    defaultMessage:
      'Shown when the participant tries to continue while a node is still waiting to be placed.',
    description:
      'Guidance under the field holding the message shown when the participant tries to continue with members of their network not yet placed into a bin.',
  },
});
