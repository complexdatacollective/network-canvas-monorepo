import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What a network composer says about the canvas it hands the participant.
 *
 * One file for the interface rather than one beside each section, because the
 * two sections describe halves of a single decision — what the participant may
 * put on the canvas, and what they may draw between the things they put there
 * — and a translator needs both accounts in front of them at once.
 */
export const composerMessages = defineMessages({
  nodesTitle: {
    id: 'protocolBuilder.networkCanvas.composerNodeTitle',
    defaultMessage: 'Node configuration',
    description:
      'Heading of the section deciding how a participant adds members to the network on a composer canvas, where those members are remembered, and how they are grouped. Also names the section in the editor outline and to assistive technology.',
  },
  nodesDescription: {
    id: 'protocolBuilder.networkCanvas.composerNodeDescription',
    defaultMessage:
      'Configure attribute mappings, layout behavior, group hulls, and editable node attributes.',
    description:
      'Description of the node section of a network composer. A node is one member of the network the participant is building.',
  },
  nodesWaitingDescription: {
    id: 'protocolBuilder.networkCanvas.composerNodeWaitingDescription',
    defaultMessage:
      'Choose what this stage works with before configuring how its nodes behave.',
    description:
      'Description of the node section while the stage has no node type yet, so nothing here can be configured. A stage is one step of an interview.',
  },
  quickAddSectionTitle: {
    id: 'protocolBuilder.networkCanvas.quickAddSectionTitle',
    defaultMessage: 'Quick add attribute',
    description:
      'Heading of the sub-section of a network composer holding the attribute the participant fills in as they add a member to the network. Also names the group to assistive technology.',
  },
  quickAddSectionDescription: {
    id: 'protocolBuilder.networkCanvas.quickAddSectionDescription',
    defaultMessage:
      'The attribute populated by the inline quick-add field when a node is added from the toolbar — typically a name or label.',
    description:
      'Description of the quick-add sub-section of a network composer. The quick-add field is the box the participant types into on the canvas toolbar to add a member to the network.',
  },
  quickAddLabel: {
    id: 'protocolBuilder.networkCanvas.quickAddLabel',
    defaultMessage: 'Create or select an attribute for the quick-add form',
    description:
      'Label of the control choosing which codebook attribute the participant fills in as they add a member to the network — usually a name.',
  },
  quickAddEmpty: {
    id: 'protocolBuilder.networkCanvas.quickAddEmpty',
    defaultMessage:
      'This type has no free-text attributes available, so there is nothing for the quick-add box to fill in.',
    description:
      'Shown in place of the quick-add attribute list when the node type this stage builds has no text attribute this stage may take.',
  },
  quickAddCreateLabel: {
    id: 'protocolBuilder.networkCanvas.createQuickAddLabel',
    defaultMessage: 'Create a new attribute to fill in',
    description:
      'Button that creates a text attribute in the codebook and uses it as the one filled in when a node is added.',
  },
  nodePositionsSectionTitle: {
    id: 'protocolBuilder.networkCanvas.nodePositionsSectionTitle',
    defaultMessage: 'Node positions',
    description:
      'Heading of the sub-section of a network composer holding the attribute that stores where each member of the network sits on the canvas. Also names the group to assistive technology.',
  },
  nodePositionsSectionDescription: {
    id: 'protocolBuilder.networkCanvas.nodePositionsSectionDescription',
    defaultMessage:
      "Stores each node's position on the canvas. Reusing the same attribute across stages preserves positions as the participant moves between tasks.",
    description:
      'Description of the node-positions sub-section of a network composer. A stage is one step of an interview, so reusing one attribute carries the participant’s placements from one step to the next.',
  },
  layoutLabel: {
    id: 'protocolBuilder.networkCanvas.composerLayoutLabel',
    defaultMessage: 'Create or select an attribute to store node coordinates',
    description:
      'Label of the control choosing which codebook attribute stores where each node sits on a composer canvas.',
  },
  layoutEmpty: {
    id: 'protocolBuilder.networkCanvas.composerLayoutEmpty',
    defaultMessage:
      'This type has no position attributes yet. Create one to store where the participant puts each node.',
    description:
      'Shown in place of the position-attribute list when the node type this stage builds has no attribute that can hold a position.',
  },
  layoutCreateLabel: {
    id: 'protocolBuilder.networkCanvas.composerCreateLayoutLabel',
    defaultMessage: 'Create a new position attribute',
    description:
      'Button that creates an attribute holding a position in the codebook and uses it for this stage.',
  },
  automaticLayoutSectionTitle: {
    id: 'protocolBuilder.networkCanvas.automaticLayoutSectionTitle',
    defaultMessage: 'Automatic layout',
    description:
      'Heading of the sub-section of a network composer deciding whether the canvas arranges members of the network by itself when the stage opens. Also names the group to assistive technology.',
  },
  automaticLayoutSectionDescription: {
    id: 'protocolBuilder.networkCanvas.automaticLayoutSectionDescription',
    defaultMessage:
      'When on, nodes are arranged by a force-directed layout. Participants can toggle this during the interview; this sets the starting state.',
    description:
      'Description of the automatic-layout sub-section of a network composer. A force-directed layout is a simulation that spreads members of the network out on the canvas.',
  },
  automaticLayoutToggleLabel: {
    id: 'protocolBuilder.networkCanvas.automaticLayoutToggleLabel',
    defaultMessage: 'Start with automatic layout switched on',
    description:
      'Label of the switch deciding whether a network composer opens with its automatic layout running. The participant can switch it the other way during the interview.',
  },
  groupHullsSectionTitle: {
    id: 'protocolBuilder.networkCanvas.groupHullsSectionTitle',
    defaultMessage: 'Group hulls',
    description:
      'Heading of the sub-section of a network composer holding the attribute the participant groups members of the network by. Also names the group to assistive technology.',
  },
  groupHullsSectionDescription: {
    id: 'protocolBuilder.networkCanvas.groupHullsSectionDescription',
    defaultMessage:
      'Draw shaded outlines around groups of nodes that share a value of a categorical attribute. Choose (or create) the attribute whose values participants can group nodes into — by tapping nodes with the Groups tool, or by lasso-selecting several at once.',
    description:
      'Description of the group-hulls sub-section of a network composer. The Groups tool and the lasso are the two ways the participant puts members of the network into a group on the canvas.',
  },
  hullLabel: {
    id: 'protocolBuilder.networkCanvas.hullLabel',
    defaultMessage: 'Create or select a categorical attribute for grouping',
    description:
      'Label of the control choosing which codebook attribute the participant groups nodes by on a composer canvas.',
  },
  hullEmpty: {
    id: 'protocolBuilder.networkCanvas.hullEmpty',
    defaultMessage:
      'This type has no attributes with a fixed set of values, so there is nothing to group nodes by.',
    description:
      'Shown in place of the grouping-attribute list when the node type this stage builds has no categorical attribute this stage may take.',
  },
  hullCreateLabel: {
    id: 'protocolBuilder.networkCanvas.createHullLabel',
    defaultMessage: 'Create a new grouping attribute',
    description:
      'Button that creates an attribute with a fixed set of values in the codebook and groups nodes by it.',
  },
  nodeFormTitle: {
    id: 'protocolBuilder.networkCanvas.nodeFormTitle',
    defaultMessage: 'Editable attributes',
    description:
      'Heading of the section holding the questions a network composer asks about each node the participant has added. Also names the section in the editor outline and to assistive technology.',
  },
  nodeFormDescription: {
    id: 'protocolBuilder.networkCanvas.nodeFormDescription',
    defaultMessage:
      'The attributes shown in the side panel when a node is selected, so they can be edited during the interview. Each attribute is paired with the input control used to collect it.',
    description:
      'Description of the node-attributes section of a network composer.',
  },
  nodeFormHint: {
    id: 'protocolBuilder.networkCanvas.nodeFormFieldsHint',
    defaultMessage:
      'The participant answers these in the panel that opens when they select a node. Drag to reorder them.',
    description:
      'Guidance under the list of questions asked about each node of a network composer.',
  },
  nodeFormAddLabel: {
    id: 'protocolBuilder.networkCanvas.nodeFormAddLabel',
    defaultMessage: 'Create new node attribute',
    description:
      'Button that adds a question to the form a network composer shows for a selected node.',
  },
  nodeFormEmptyState: {
    id: 'protocolBuilder.networkCanvas.nodeFormEmptyState',
    defaultMessage:
      'No node attributes yet. Create one to ask the participant something about each node.',
    description:
      'Shown in place of the list of questions about each node while it holds none.',
  },
  nodeFormClearTitle: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearTitle',
    defaultMessage: 'This will delete the node form',
    description:
      'Title of the confirmation shown before switching off the form a network composer shows for a selected node.',
  },
  nodeFormClearDescription: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearDescription',
    defaultMessage:
      'Every field you have added to it will be removed, and the panel that opens when a participant selects a node will have nothing in it.',
    description:
      'Description of the confirmation shown before switching off the form a network composer shows for a selected node.',
  },
  nodeFormClearConfirm: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearConfirm',
    defaultMessage: 'Delete the form',
    description:
      'Button that confirms switching off the form a network composer shows for a selected node.',
  },
  connectionsTitle: {
    id: 'protocolBuilder.networkCanvas.composerEdgeTitle',
    defaultMessage: 'Edge configuration',
    description:
      'Heading of the section deciding which kinds of connection a participant may draw between nodes on a composer canvas. Also names the section in the editor outline and to assistive technology.',
  },
  connectionsDescription: {
    id: 'protocolBuilder.networkCanvas.composerEdgeDescription',
    defaultMessage:
      'Define the connection types participants can draw and the attributes collected for each type.',
    description:
      'Description of the connections section of a network composer. A connection is a relationship between two members of the network.',
  },
  connectionTypesSectionTitle: {
    id: 'protocolBuilder.networkCanvas.connectionTypesSectionTitle',
    defaultMessage: 'Connection types',
    description:
      'Heading of the sub-section of a network composer holding the kinds of connection the participant may draw. Also names the group to assistive technology.',
  },
  connectionTypesSectionDescription: {
    id: 'protocolBuilder.networkCanvas.connectionTypesSectionDescription',
    defaultMessage:
      'Select the edge types participants can create on the canvas. Each selected type gets its own set of editable attributes below.',
    description:
      'Description of the connection-types sub-section of a network composer. The editable attributes for each chosen kind are asked for in the sections below this one.',
  },
  connectionsLabel: {
    id: 'protocolBuilder.networkCanvas.composerEdgeFieldLabel',
    defaultMessage: 'Edge types',
    description:
      'Label of the list holding the kinds of connection a network composer lets the participant draw.',
  },
  connectionsAddLabel: {
    id: 'protocolBuilder.networkCanvas.composerEdgeAddLabel',
    defaultMessage: 'Add a connection type',
    description:
      'Button that adds a kind of connection to those a network composer lets the participant draw.',
  },
  createConnectionTypeLabel: {
    id: 'protocolBuilder.networkCanvas.composerCreateEdgeTypeLabel',
    defaultMessage: 'Create a new connection type',
    description:
      'Button opening the codebook editor to define a kind of connection the protocol does not have yet, from inside a network composer. The new kind becomes drawable on this canvas as soon as it is created.',
  },
  connectionsEmptyState: {
    id: 'protocolBuilder.networkCanvas.composerEdgeEmpty',
    defaultMessage:
      'The participant cannot draw connections on this canvas yet. Add a connection type to let them.',
    description:
      'Shown in place of the list of connection types while a network composer allows none.',
  },
  connectionNoun: {
    id: 'protocolBuilder.networkCanvas.composerEdgeNoun',
    defaultMessage: 'connection type',
    description:
      'What one row of a network composer’s connection list is called, used in the accessible names of its edit, delete and reorder controls and in the confirmation that deletes it.',
  },
  connectionAddTitle: {
    id: 'protocolBuilder.networkCanvas.composerEdgeAddTitle',
    defaultMessage: 'Add a connection type',
    description:
      'Title of the dialog a researcher fills in to let a network composer draw a NEW kind of connection.',
  },
  connectionEditTitle: {
    id: 'protocolBuilder.networkCanvas.composerEdgeEditTitle',
    defaultMessage: 'Edit connection type',
    description:
      'Title of the dialog a researcher fills in when changing a kind of connection a network composer already draws.',
  },
  connectionTypeLabel: {
    id: 'protocolBuilder.networkCanvas.composerEdgeTypeLabel',
    defaultMessage: 'Connection type',
    description:
      'Label of the control choosing which kind of connection one row of a network composer’s connection list stands for.',
  },
  connectionTypeHint: {
    id: 'protocolBuilder.networkCanvas.composerEdgeTypeHint',
    defaultMessage:
      'The kind of connection the participant draws. Its name and color come from the codebook.',
    description:
      'Guidance under the connection-type control of a network composer. The codebook is where a protocol defines the kinds of connection its network holds.',
  },
  connectionTypeRequired: {
    id: 'protocolBuilder.networkCanvas.composerEdgeTypeRequired',
    defaultMessage: 'Choose the kind of connection this draws.',
    description:
      'Refusal shown when a row of a network composer’s connection list is saved without naming a connection type.',
  },
  duplicateConnectionRefusal: {
    id: 'protocolBuilder.networkCanvas.composerEdgeDuplicateRefusal',
    defaultMessage:
      'This canvas already draws this kind of connection. Edit the existing one instead.',
    description:
      'Refusal shown when two rows of a network composer’s connection list would name the same kind of connection.',
  },
  connectionUnnamedPreview: {
    id: 'protocolBuilder.networkCanvas.composerEdgeUnnamedPreview',
    defaultMessage: 'No connection type chosen',
    description:
      'How a row of a network composer’s connection list reads before a kind of connection has been chosen for it.',
  },
  connectionFormsTitle: {
    id: 'protocolBuilder.networkCanvas.edgeFormsTitle',
    defaultMessage: 'Editable attributes',
    description:
      'Heading of the section holding the questions a network composer asks about each connection the participant draws. Also names the section in the editor outline and to assistive technology.',
  },
  connectionFormsDescription: {
    id: 'protocolBuilder.networkCanvas.edgeFormsDescription',
    defaultMessage:
      'Configure the attributes collected for this connection type.',
    description:
      'Description of the connection-attributes section of a network composer.',
  },
  connectionFormLabel: {
    id: 'protocolBuilder.networkCanvas.edgeFormHeading',
    defaultMessage: 'Edge Attributes — {typeName}',
    description:
      'Label of the list of questions asked about one kind of connection. typeName is the researcher-facing name of that connection type.',
  },
  connectionFormHint: {
    id: 'protocolBuilder.networkCanvas.edgeFormFieldsHint',
    defaultMessage:
      'The attributes shown in the side panel when an edge is selected, so they can be edited during the interview. Each attribute is paired with the input control used to collect it.',
    description:
      'Guidance under the list of questions asked about one kind of connection.',
  },
  connectionFormAddLabel: {
    id: 'protocolBuilder.networkCanvas.edgeFormAddLabel',
    defaultMessage: 'Create new attribute for {typeName}',
    description:
      'Button that adds a question to the form shown for one kind of connection. typeName is the researcher-facing name of that connection type.',
  },
  connectionFormEmptyState: {
    id: 'protocolBuilder.networkCanvas.edgeFormEmptyState',
    defaultMessage:
      'No attributes yet for this connection type. Create one to ask the participant something about each connection they draw.',
    description:
      'Shown in place of the list of questions about one kind of connection while it holds none.',
  },
});
