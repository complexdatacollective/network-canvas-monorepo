import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Everything one sociogram prompt says.
 *
 * One file rather than descriptors beside the markup, which is the rule
 * elsewhere in this package, because of the seam: four of these are handed to
 * the shared `PromptsSection` — a sociogram's prompts set TASKS performed on a
 * canvas, which does not read as the generic "question the participant
 * answers" with one word changed — and a sentence declared where it is
 * rendered would leave a translator reading half of one decision in two files.
 */
export const sociogramPromptMessages = defineMessages({
  sociogramPromptsDescription: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsDescription',
    defaultMessage: 'Create and reorder the prompts shown in this stage.',
    description:
      'Description of the prompts section on a sociogram stage. A stage is one step of an interview; a prompt is one task the participant is set inside it.',
  },
  sociogramPromptsWaitingDescription: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsWaitingDescription',
    defaultMessage:
      'Choose what this stage works with before writing its prompts.',
    description:
      'Shown in place of the sociogram prompts description while the researcher has not yet chosen which node or edge type the stage is about, so there is nothing for a prompt to be written against.',
  },
  sociogramPromptsFieldHint: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsFieldHint',
    defaultMessage: 'Add at least one prompt and drag prompts to reorder them.',
    description:
      'Guidance under the sociogram prompt list, addressed to the researcher building the stage.',
  },
  promptTextTitle: {
    id: 'protocolBuilder.networkCanvas.promptTextTitle',
    defaultMessage: 'Participant prompt',
    description:
      'Heading of the group inside the sociogram prompt dialog holding the words the participant reads. A prompt is one task the participant is set.',
  },
  promptTextSectionDescription: {
    id: 'protocolBuilder.networkCanvas.promptTextSectionDescription',
    defaultMessage:
      'Write the instruction or question participants see for this task.',
    description: 'Description of the participant-prompt group.',
  },
  promptTextLabel: {
    id: 'protocolBuilder.networkCanvas.promptTextLabel',
    defaultMessage: 'Prompt text',
    description:
      'Label of the box holding the words the participant reads for this task.',
  },
  promptTextPlaceholder: {
    id: 'protocolBuilder.networkCanvas.promptTextPlaceholder',
    defaultMessage: 'Enter your prompt...',
    description:
      'Placeholder shown in the empty prompt-text box. The trailing dots are an ellipsis written as three full stops.',
  },
  promptTextRequired: {
    id: 'protocolBuilder.networkCanvas.promptTextRequired',
    defaultMessage: 'Write the question this prompt asks.',
    description:
      'Refusal shown under the prompt-text box when the researcher saves a prompt with nothing written in it.',
  },
  promptPositionsTitle: {
    id: 'protocolBuilder.networkCanvas.promptPositionsTitle',
    defaultMessage: 'Unplaced nodes',
    description:
      'Heading of the group inside the sociogram prompt dialog deciding the order of the nodes the participant has not placed yet.',
  },
  promptPositionsDescription: {
    id: 'protocolBuilder.networkCanvas.promptPositionsDescription',
    defaultMessage: 'Configure the initial order of unplaced nodes.',
    description:
      'Description of the group inside the sociogram prompt dialog deciding the order of the nodes the participant has not placed yet.',
  },
  promptSortTitle: {
    id: 'protocolBuilder.networkCanvas.promptSortTitle',
    defaultMessage: 'Sort unplaced nodes',
    description:
      'Heading of the optional group inside the sociogram prompt dialog holding the rules that order the nodes the participant has not placed yet.',
  },
  promptSortDescription: {
    id: 'protocolBuilder.networkCanvas.promptSortDescription',
    defaultMessage:
      'Control the order of the stack participants use to position nodes.',
    description: 'Description of the sort-unplaced-nodes group.',
  },
  promptSortLabel: {
    id: 'protocolBuilder.networkCanvas.promptSortLabel',
    defaultMessage: 'Sort rules',
    description:
      'Label of the ordered list of rules deciding which unplaced node the participant is handed next. Each rule is one attribute and a direction.',
  },
  promptSortAddLabel: {
    id: 'protocolBuilder.networkCanvas.promptSortAddLabel',
    defaultMessage: 'Add new sort rule',
    description:
      'Button that adds one more sort rule. Whole rather than a generic "Add", because a stage editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  promptSortEmptyState: {
    id: 'protocolBuilder.networkCanvas.promptSortEmptyState',
    defaultMessage:
      'No rules yet, so nodes are handed over in the order they were added.',
    description:
      'Shown in place of the sort-rules list while the prompt sorts by nothing in particular, saying what happens instead.',
  },
  taskTitle: {
    id: 'protocolBuilder.networkCanvas.taskTitle',
    defaultMessage: 'Task',
    description:
      "Heading of the group inside the sociogram prompt dialog that chooses what the participant does while this prompt is shown. It appears in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskDescription: {
    id: 'protocolBuilder.networkCanvas.taskDescription',
    defaultMessage:
      'Choose what participants do on the canvas while this prompt is shown. Nodes can be moved only in a positioning task.',
    description:
      "Description of the task group in the sociogram prompt dialog. The canvas is the area on which the participant places nodes. A positioning task is the first of the three choices offered. It appears in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskLabel: {
    id: 'protocolBuilder.networkCanvas.taskLabel',
    defaultMessage: 'Task type',
    description:
      "Label of the control that chooses one of the three tasks a sociogram prompt can set: positioning nodes, highlighting nodes, or connecting nodes. It appears in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskRequired: {
    id: 'protocolBuilder.networkCanvas.taskRequired',
    defaultMessage: 'Choose the task that this prompt sets.',
    description:
      "Refusal shown under the task control when the researcher saves a sociogram prompt without choosing a task. It appears in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.taskLayoutLabel',
    defaultMessage: 'Position nodes',
    description:
      "Name of the sociogram task in which the participant places nodes on the canvas and moves them. The sentence under it is taskLayoutDescription. It is an option of the task control in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskLayoutDescription: {
    id: 'protocolBuilder.networkCanvas.taskLayoutDescription',
    defaultMessage:
      'Participants drag nodes onto the canvas and move them. Positions are stored in the layout of this stage.',
    description:
      "Says what the participant does in the positioning task. A layout is a named set of node positions in the codebook; the stage chooses one. It is the sentence under the Position nodes option of the task control in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.taskHighlightLabel',
    defaultMessage: 'Highlight nodes',
    description:
      "Name of the sociogram task in which tapping a node turns a true-or-false attribute on and off. The sentence under it is taskHighlightDescription. It is an option of the task control in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskHighlightDescription: {
    id: 'protocolBuilder.networkCanvas.taskHighlightDescription',
    defaultMessage:
      'Participants tap a node to set a Boolean attribute to true or false.',
    description:
      "Says what the participant does in the highlighting task. Boolean is the name of the kind of attribute that records a true or false answer, as the codebook editor names it. It is the sentence under the Highlight nodes option of the task control in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskConnectLabel: {
    id: 'protocolBuilder.networkCanvas.taskConnectLabel',
    defaultMessage: 'Connect nodes',
    description:
      "Name of the sociogram task in which the participant taps two nodes to create an edge between them. The sentence under it is taskConnectDescription. It is an option of the task control in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  taskConnectDescription: {
    id: 'protocolBuilder.networkCanvas.taskConnectDescription',
    defaultMessage:
      'Participants tap two nodes to create or remove an edge between them.',
    description:
      "Says what the participant does in the connecting task. An edge is a connection between two nodes. It is the sentence under the Connect nodes option of the task control in the prompt dialog of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  firstUseTitle: {
    id: 'protocolBuilder.networkCanvas.firstUseTitle',
    defaultMessage: 'Nodes are not placed before this task',
    description:
      "Title of the warning in the prompts section of a sociogram stage. It is shown when this stage is the first in the interview to use its layout, and its first prompt is not a positioning task. It appears in Architect's stage editor, and the researcher reads it.",
  },
  firstUseDescription: {
    id: 'protocolBuilder.networkCanvas.firstUseDescription',
    defaultMessage:
      'No earlier stage places nodes in this layout, and the first prompt of this stage is not a positioning task. Nodes that are not placed cannot be highlighted or connected. Make the first prompt a positioning task, or choose Automatic mode under Node layout.',
    description:
      "Text of the warning in the prompts section of a sociogram stage. A layout is a named set of node positions. A positioning task is the prompt task in which participants place nodes. Automatic mode is a choice in the Node layout section of the same stage, which places nodes without the participant. It appears in the prompts section of a Sociogram stage in Architect's stage editor, and the researcher reads it.",
  },
  promptCreateEdgeLabel: {
    id: 'protocolBuilder.networkCanvas.promptCreateEdgeLabel',
    defaultMessage: 'Created edge type',
    description:
      'Label of the picker naming which kind of relationship tapping two nodes draws.',
  },
  promptCreateEdgeRequired: {
    id: 'protocolBuilder.networkCanvas.promptCreateEdgeRequired',
    defaultMessage: 'Choose the kind of connection this prompt creates.',
    description:
      'Refusal shown under the connection-type-created picker when the researcher saves a prompt that draws connections without saying which kind.',
  },
  promptHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.promptHighlightLabel',
    defaultMessage: 'Boolean attribute',
    description:
      'Label of the picker naming which true-or-false codebook attribute tapping a node turns on and off.',
  },
  promptHighlightHint: {
    id: 'protocolBuilder.networkCanvas.promptHighlightHint',
    defaultMessage:
      'Select the attribute toggled when a participant taps a node.',
    description: 'Guidance under the attribute-marked picker.',
  },
  promptHighlightEmpty: {
    id: 'protocolBuilder.networkCanvas.promptHighlightEmpty',
    defaultMessage:
      'This type has no Boolean attributes yet. Create one to record which nodes the participant marks.',
    description:
      'Shown under the attribute-marked picker when the node type that this stage is about has no attributes at all in the codebook. "This type" is that node type. Boolean is the name of the kind of attribute that records a true or false answer, as the codebook editor names it.',
  },
  promptHighlightRequired: {
    id: 'protocolBuilder.networkCanvas.promptHighlightRequired',
    defaultMessage: 'Choose the attribute tapping a node turns on and off.',
    description:
      'Refusal shown under the attribute-marked picker when the researcher saves a prompt that marks nodes without saying which attribute it marks.',
  },
  promptCreateHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.promptCreateHighlightLabel',
    defaultMessage: 'Create a new Boolean attribute',
    description:
      'Button beside the attribute-marked picker that adds a boolean attribute to the codebook without leaving the stage. Also the title of the dialog it opens.',
  },
  promptEdgesTitle: {
    id: 'protocolBuilder.networkCanvas.promptEdgesTitle',
    defaultMessage: 'Displayed edges',
    description:
      'Heading of the group inside the sociogram prompt dialog deciding which kinds of relationship are drawn while this prompt is on screen.',
  },
  promptEdgesDescription: {
    id: 'protocolBuilder.networkCanvas.promptEdgesDescription',
    defaultMessage: 'Choose the edge types shown on this prompt.',
    description: 'Description of the connections-shown group.',
  },
  promptCreatedEdgeAlwaysShown: {
    id: 'protocolBuilder.networkCanvas.promptCreatedEdgeAlwaysShown',
    defaultMessage:
      'The kind of connection this prompt creates is always shown, so it cannot be unticked.',
    description:
      'Notice above the connection-types tick list explaining why one entry is ticked and cannot be changed: drawing a connection the participant cannot see is not something a researcher can have meant.',
  },
  promptDisplayEdgesLabel: {
    id: 'protocolBuilder.networkCanvas.promptDisplayEdgesLabel',
    defaultMessage: 'Edge types',
    description:
      'Label of the tick list choosing which edge types are drawn while one sociogram prompt is on screen.',
  },
  promptEmptyPreview: {
    id: 'protocolBuilder.networkCanvas.promptEmptyPreview',
    defaultMessage: 'Empty prompt',
    description:
      'Stands in for a prompt’s text in the collapsed row of the sociogram prompt list while the researcher has not written any yet.',
  },
  promptHighlightLabelForType: {
    id: 'protocolBuilder.networkCanvas.promptHighlightLabelForType',
    defaultMessage: 'Boolean attribute for {nodeType}',
    description:
      'Label of one of the pickers in the sociogram prompt dialog, read by the researcher designing a stage that shows several kinds of network member, naming which true-or-false attribute tapping a node of one kind turns on and off. {nodeType} is the name the researcher gave that kind, such as "Person" or "Place".',
  },
  promptHighlightHintSeveral: {
    id: 'protocolBuilder.networkCanvas.promptHighlightHintSeveral',
    defaultMessage:
      'Select the attribute that is turned on and off when a participant taps a node of this type. Leave it empty if nodes of this type should not be highlighted during this prompt.',
    description:
      'Guidance under each attribute picker in the sociogram prompt dialog, read by the researcher designing a stage that shows several kinds of network member. Nodes of a kind with no attribute chosen cannot be tapped during this prompt.',
  },
  promptHighlightRequiredSeveral: {
    id: 'protocolBuilder.networkCanvas.promptHighlightRequiredSeveral',
    defaultMessage:
      'For at least one node type, choose the attribute that is turned on and off when a participant taps a node.',
    description:
      'Refusal shown under the first attribute picker of a sociogram prompt on a stage that shows several kinds of network member, when the researcher saves a prompt that marks nodes without choosing an attribute for any kind.',
  },
  promptSortTitleForType: {
    id: 'protocolBuilder.networkCanvas.promptSortTitleForType',
    defaultMessage: 'Sort unplaced nodes of type {nodeType}',
    description:
      'Heading of one optional group inside the sociogram prompt dialog, read by the researcher designing a stage that shows several kinds of network member, holding the rules that order the unplaced nodes of one kind. {nodeType} is the name the researcher gave that kind, such as "Person" or "Place".',
  },
  promptNodeTypeOrderLabel: {
    id: 'protocolBuilder.networkCanvas.promptNodeTypeOrderLabel',
    defaultMessage: 'Order of node types',
    description:
      'Label of the reorderable list in the sociogram prompt dialog, read by the researcher designing a stage that shows several kinds of network member. The participant is handed the unplaced nodes of the first kind in the list first, then those of the next kind.',
  },
  promptNodeTypeOrderHint: {
    id: 'protocolBuilder.networkCanvas.promptNodeTypeOrderHint',
    defaultMessage:
      'Unplaced nodes are listed by type in this order, and each type is sorted by its own rules.',
    description:
      'Guidance under the reorderable list of kinds of network member in the sociogram prompt dialog, read by the researcher designing a stage that shows several kinds of network member.',
  },
});
