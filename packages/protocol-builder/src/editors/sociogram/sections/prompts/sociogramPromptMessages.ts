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
    defaultMessage: 'Node layout',
    description:
      'Heading of the group inside the sociogram prompt dialog deciding where the participant’s placements are kept.',
  },
  promptPositionsDescription: {
    id: 'protocolBuilder.networkCanvas.promptPositionsDescription',
    defaultMessage:
      'Store node positions and configure the initial order of unplaced nodes.',
    description: 'Description of the prompt node-positions group.',
  },
  promptLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.promptLayoutLabel',
    defaultMessage: 'Layout attribute',
    description:
      'Label of the picker naming the codebook attribute one sociogram prompt stores each node’s position in. A layout attribute holds a pair of coordinates.',
  },
  promptLayoutHint: {
    id: 'protocolBuilder.networkCanvas.promptLayoutHint',
    defaultMessage:
      'Create or select an attribute that stores node coordinates.',
    description: 'Guidance under the prompt position-attribute picker.',
  },
  promptLayoutEmpty: {
    id: 'protocolBuilder.networkCanvas.promptLayoutEmpty',
    defaultMessage:
      'This type has no position attributes yet. Create one to store what the participant places.',
    description:
      'Shown in place of the prompt position-attribute picker when the node type this stage is about has no layout attribute in the codebook. "This type" is that node type.',
  },
  promptLayoutRequired: {
    id: 'protocolBuilder.networkCanvas.promptLayoutRequired',
    defaultMessage: 'Choose the attribute this prompt stores positions in.',
    description:
      'Refusal shown under the prompt position-attribute picker when the researcher saves a prompt without choosing one.',
  },
  promptCreateLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.promptCreateLayoutLabel',
    defaultMessage: 'Create a new position attribute',
    description:
      'Button beside the prompt position-attribute picker that adds a layout attribute to the codebook without leaving the stage. Also the title of the dialog it opens.',
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
  tapTitle: {
    id: 'protocolBuilder.networkCanvas.tapTitle',
    defaultMessage: 'Node interaction',
    description:
      'Heading of the group inside the sociogram prompt dialog deciding what the participant tapping a node does.',
  },
  tapDescription: {
    id: 'protocolBuilder.networkCanvas.tapDescription',
    defaultMessage:
      'Choose whether tapping a node toggles an attribute or creates an edge.',
    description: 'Description of the tapping-a-node group.',
  },
  tapBehaviourLabel: {
    id: 'protocolBuilder.networkCanvas.tapBehaviourLabel',
    defaultMessage: 'Interaction type',
    description:
      'Label of the control choosing between the three things tapping a node can do.',
  },
  tapNothingLabel: {
    id: 'protocolBuilder.networkCanvas.tapNothingLabel',
    defaultMessage: 'Nothing',
    description:
      'Name of the choice where tapping a node does nothing. Offered as one of three cards; the sentence under it is tapNothingDescription.',
  },
  tapNothingDescription: {
    id: 'protocolBuilder.networkCanvas.tapNothingDescription',
    defaultMessage:
      'Tapping a node does nothing on this prompt. The participant only moves nodes around.',
    description: 'Says what the participant can do when tapping does nothing.',
  },
  tapCreateEdgeLabel: {
    id: 'protocolBuilder.networkCanvas.tapCreateEdgeLabel',
    defaultMessage: 'Edge creation',
    description:
      'Name of the choice where tapping two nodes draws a relationship between them. Offered as one of three cards; the sentence under it is tapCreateEdgeDescription.',
  },
  tapCreateEdgeDescription: {
    id: 'protocolBuilder.networkCanvas.tapCreateEdgeDescription',
    defaultMessage:
      'Clicking or tapping a node allows the participant to create an edge.',
    description:
      'Says what the participant does to draw a connection. A connection is an edge.',
  },
  tapHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.tapHighlightLabel',
    defaultMessage: 'Attribute toggling',
    description:
      'Name of the choice where tapping a node turns a true-or-false attribute on and off. Offered as one of three cards; the sentence under it is tapHighlightDescription.',
  },
  tapHighlightDescription: {
    id: 'protocolBuilder.networkCanvas.tapHighlightDescription',
    defaultMessage:
      'Clicking or tapping a node toggles a boolean attribute between true and false.',
    description: 'Says what marking a node does to the attribute behind it.',
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
      'This type has no true-or-false attributes available, so there is nothing to mark.',
    description:
      'Shown in place of the attribute-marked picker when the node type this stage is about has no boolean attribute the prompt may take. "This type" is that node type.',
  },
  promptHighlightRequired: {
    id: 'protocolBuilder.networkCanvas.promptHighlightRequired',
    defaultMessage: 'Choose the attribute tapping a node turns on and off.',
    description:
      'Refusal shown under the attribute-marked picker when the researcher saves a prompt that marks nodes without saying which attribute it marks.',
  },
  promptCreateHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.promptCreateHighlightLabel',
    defaultMessage: 'Create a new true-or-false attribute',
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
});
