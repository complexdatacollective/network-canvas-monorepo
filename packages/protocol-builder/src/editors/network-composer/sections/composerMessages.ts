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
  quickAddLabel: {
    id: 'protocolBuilder.networkCanvas.quickAddLabel',
    defaultMessage: 'Create or select an attribute for the quick-add form',
    description:
      'Label of the control choosing which codebook attribute the participant fills in as they add a member to the network — usually a name.',
  },
  quickAddHint: {
    id: 'protocolBuilder.networkCanvas.quickAddHint',
    defaultMessage:
      'The participant types one thing to add a node — usually a name. It is stored in this attribute, and checked against that attribute’s own rules.',
    description:
      'Guidance under the quick-add attribute control of a network composer. The rules are the validation the codebook records for the attribute.',
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
  layoutLabel: {
    id: 'protocolBuilder.networkCanvas.composerLayoutLabel',
    defaultMessage: 'Create or select an attribute to store node coordinates',
    description:
      'Label of the control choosing which codebook attribute stores where each node sits on a composer canvas.',
  },
  layoutHint: {
    id: 'protocolBuilder.networkCanvas.composerLayoutHint',
    defaultMessage:
      'The attribute that stores each node’s position. Stages sharing an attribute carry the participant’s placements between them.',
    description:
      'Guidance under the position-attribute control of a network composer. A stage is one step of an interview.',
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
  hullLabel: {
    id: 'protocolBuilder.networkCanvas.hullLabel',
    defaultMessage: 'Create or select a categorical attribute for grouping',
    description:
      'Label of the control choosing which codebook attribute the participant groups nodes by on a composer canvas.',
  },
  hullHint: {
    id: 'protocolBuilder.networkCanvas.hullHint',
    defaultMessage:
      'Nodes sharing a value of this attribute are drawn inside a shaded outline. The participant sets those values on the canvas, so they are written without being checked against the attribute’s rules.',
    description:
      'Guidance under the grouping-attribute control of a network composer. The shaded outline is drawn around every node that shares a value; the participant assigns those values by lassoing or tapping nodes, which does not run the codebook’s validation.',
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
  connectionsLabel: {
    id: 'protocolBuilder.networkCanvas.composerEdgeFieldLabel',
    defaultMessage: 'Connection types',
    description:
      'Label of the list holding the kinds of connection a network composer lets the participant draw.',
  },
  connectionsHint: {
    id: 'protocolBuilder.networkCanvas.composerEdgeFieldHint',
    defaultMessage:
      'The participant can draw a connection of any kind listed here. Leave the list empty to build a network of nodes alone.',
    description:
      'Guidance under the list of connection types a network composer lets the participant draw.',
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
    defaultMessage: 'Create new attribute field for “{typeName}” connections',
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
