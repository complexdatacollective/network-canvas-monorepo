import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Everything the canvas interfaces say, in one place.
 *
 * A file per area rather than descriptors beside each section's markup, which
 * is the rule for a converted module elsewhere in this package. The reason is
 * the seam: a good deal of what this family says is rendered somewhere ELSE —
 * in `BuilderSection`'s confirmation before a capability is switched off, in
 * `DialogArrayField`'s row affordances and refusals, in the sentences
 * `PromptsSection` puts in place of its own generic ones — so a translator
 * reading this file sees the whole of what a sociogram, a narrative and a
 * network composer say, including the parts said through other people's
 * components, rather than having to find them one component at a time.
 *
 * Everything crossing that seam is a descriptor rather than a string. A string
 * handed across it is invisible to `extractMessages`, absent from the catalogs
 * and covered by no guard, so the words a family cared enough to write for
 * itself would be the only words left untranslated.
 *
 * Three interfaces share this area because they share their sections: the
 * background, the layout mode and the canvas permissions are the same controls
 * on a sociogram and on a narrative stage, and the composer's node and edge
 * configuration is built out of the same pickers. Where one of them needs a
 * different sentence for the same control, it is declared here too and handed
 * over as a named prop — see `sociogramCanvasInteractionDescription`.
 */
export const networkCanvasMessages = defineMessages({
  sociogramPromptsDescription: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsDescription',
    defaultMessage:
      'Write the tasks the participant works through on the canvas, and drag them into the order they do them.',
    description:
      'Description of the prompts section on a sociogram stage, which sets tasks performed on a canvas rather than asking questions to be answered in words. Replaces the generic prompts description.',
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
    defaultMessage:
      'The participant works through these one at a time, in this order. Each one decides what the canvas shows and what tapping a node does.',
    description:
      'Guidance under the sociogram prompt list. The canvas is the drawing surface the participant arranges nodes on.',
  },
  sociogramPromptsEmptyState: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsEmptyState',
    defaultMessage:
      'No prompts yet. Create one to say what the participant does on the canvas.',
    description:
      'Shown in place of the sociogram prompt list while the stage sets no tasks yet.',
  },

  // The two named layout modes, offered as cards by `LayoutModeField`.
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

  // The section that offers those two modes.
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

  // What the participant sees behind the nodes.
  backgroundTitle: {
    id: 'protocolBuilder.networkCanvas.backgroundTitle',
    defaultMessage: 'Background',
    description:
      'Heading of the section deciding what is drawn behind the nodes on a canvas. Also names the section in the editor outline and to assistive technology.',
  },
  backgroundDescription: {
    id: 'protocolBuilder.networkCanvas.backgroundDescription',
    defaultMessage:
      'Choose what the participant sees behind the nodes on this canvas.',
    description:
      'Description of the background section on an interface whose canvas can only draw concentric circles, so there is no choice of background kind to make.',
  },
  backgroundImageDescription: {
    id: 'protocolBuilder.networkCanvas.backgroundImageDescription',
    defaultMessage:
      'Choose what the participant sees behind the nodes on this canvas: concentric circles, or a picture of your own.',
    description:
      'Description of the background section on an interface whose canvas can also draw an image, where the researcher chooses between the two kinds of background.',
  },
  backgroundModeLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundModeLabel',
    defaultMessage: 'Background type',
    description:
      'Label of the control choosing between the two kinds of background a canvas can have.',
  },
  backgroundCirclesOptionLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesOptionLabel',
    defaultMessage: 'Concentric circles',
    description:
      'Name of the background made of rings drawn one inside another. Offered as one of two cards; the sentence under it is backgroundCirclesOptionDescription.',
  },
  backgroundCirclesOptionDescription: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesOptionDescription',
    defaultMessage:
      'The conventional sociogram background: rings the participant places nodes within.',
    description:
      'Says what a concentric-circles background is for. A sociogram is the canvas interface where a participant arranges the people in their network.',
  },
  backgroundImageOptionLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundImageOptionLabel',
    defaultMessage: 'Image',
    description:
      'Name of the background made of a picture the researcher supplies. Offered as one of two cards; the sentence under it is backgroundImageOptionDescription.',
  },
  backgroundImageOptionDescription: {
    id: 'protocolBuilder.networkCanvas.backgroundImageOptionDescription',
    defaultMessage:
      'A picture of your own — a map, a floor plan, a diagram — filling the canvas.',
    description:
      'Says what an image background is for, with three examples of what researchers use. Addressed to the researcher.',
  },
  backgroundCirclesLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesLabel',
    defaultMessage: 'Number of concentric circles',
    description:
      'Label of the box holding how many rings are drawn behind the nodes.',
  },
  backgroundCirclesHint: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesHint',
    defaultMessage:
      'The rings drawn behind the nodes. Participants often use them to place people closer to or further from themselves.',
    description: 'Guidance under the number-of-circles box.',
  },
  backgroundCirclesWholeNumber: {
    id: 'protocolBuilder.networkCanvas.backgroundCirclesWholeNumber',
    defaultMessage:
      'Enter the number of circles as a whole number of zero or more.',
    description:
      'Refusal shown under the number-of-circles box when it holds something that is not a whole number of zero or more. Zero is allowed: it is a canvas with no rings drawn on it.',
  },
  backgroundSkewLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundSkewLabel',
    defaultMessage: 'Make the inner circles larger',
    description:
      'Label of the switch giving the rings nearest the centre more room than the outer ones.',
  },
  backgroundSkewHint: {
    id: 'protocolBuilder.networkCanvas.backgroundSkewHint',
    defaultMessage:
      'Gives the inner rings more room than the outer ones, so nodes placed near the center overlap less.',
    description: 'Guidance under the larger-inner-circles switch.',
  },
  backgroundImageLabel: {
    id: 'protocolBuilder.networkCanvas.backgroundImageLabel',
    defaultMessage: 'Background image',
    description:
      'Label of the control choosing which protocol resource is drawn behind the nodes.',
  },
  backgroundImageHint: {
    id: 'protocolBuilder.networkCanvas.backgroundImageHint',
    defaultMessage:
      'Scaled to fill the canvas. A responsive SVG keeps its labels readable in both portrait and landscape.',
    description:
      'Guidance under the background-image picker. SVG is a file format name and is not translated.',
  },

  // What the participant may do to the canvas.
  canvasInteractionTitle: {
    id: 'protocolBuilder.networkCanvas.canvasInteractionTitle',
    defaultMessage: 'Canvas interaction',
    description:
      'Heading of the section granting or withholding what the participant may do to the canvas. Also names the section in the editor outline and to assistive technology.',
  },
  canvasInteractionDescription: {
    id: 'protocolBuilder.networkCanvas.canvasInteractionDescription',
    defaultMessage:
      'Choose what the participant may do to the picture while they tell their story.',
    description:
      'Description of the canvas-interaction section on a narrative stage, where the participant is shown the network they have already built and asked to talk about it. The sociogram’s wording is sociogramCanvasInteractionDescription.',
  },
  freeDrawLabel: {
    id: 'protocolBuilder.networkCanvas.freeDrawLabel',
    defaultMessage: 'Allow drawing on the canvas',
    description:
      'Label of the switch letting the participant draw freehand over the canvas.',
  },
  freeDrawHint: {
    id: 'protocolBuilder.networkCanvas.freeDrawHint',
    defaultMessage:
      'The participant can draw freehand annotations over the canvas, and erase them again.',
    description: 'Guidance under the allow-drawing switch.',
  },
  repositioningLabel: {
    id: 'protocolBuilder.networkCanvas.repositioningLabel',
    defaultMessage: 'Allow moving nodes',
    description:
      'Label of the switch letting the participant drag nodes to new places on the canvas.',
  },
  repositioningHint: {
    id: 'protocolBuilder.networkCanvas.repositioningHint',
    defaultMessage:
      'The participant can drag nodes to new positions. Their positions are stored in the attribute the preset uses for layout, so moving a node here changes it everywhere that attribute is used.',
    description:
      'Guidance under the allow-moving-nodes switch on a narrative stage, where each preset names the attribute the positions are stored in. The sociogram’s wording is sociogramRepositioningHint.',
  },
  sociogramCanvasInteractionDescription: {
    id: 'protocolBuilder.networkCanvas.sociogramCanvasInteractionDescription',
    defaultMessage:
      'Choose what the participant may do to the canvas while they work through the prompts.',
    description:
      'Description of the canvas-interaction section on a sociogram stage, where the participant is working through a series of tasks rather than talking over a finished picture. Replaces canvasInteractionDescription.',
  },
  sociogramRepositioningHint: {
    id: 'protocolBuilder.networkCanvas.sociogramRepositioningHint',
    defaultMessage:
      'The participant can drag nodes to new positions. Each position is stored in the attribute the prompt they are answering names, so moving a node here changes it everywhere that attribute is used.',
    description:
      'Guidance under the allow-moving-nodes switch on a sociogram stage, where the prompt rather than a preset names the attribute the positions are stored in. Replaces repositioningHint.',
  },

  // One sociogram prompt, as its dialog asks for it.
  promptTextTitle: {
    id: 'protocolBuilder.networkCanvas.promptTextTitle',
    defaultMessage: 'Participant prompt',
    description:
      'Heading of the group inside the sociogram prompt dialog holding the words the participant reads. A prompt is one task the participant is set.',
  },
  promptTextSectionDescription: {
    id: 'protocolBuilder.networkCanvas.promptTextSectionDescription',
    defaultMessage:
      'Write the question or instruction the participant sees for this task.',
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
    defaultMessage: 'Node positions',
    description:
      'Heading of the group inside the sociogram prompt dialog deciding where the participant’s placements are kept.',
  },
  promptPositionsDescription: {
    id: 'protocolBuilder.networkCanvas.promptPositionsDescription',
    defaultMessage: "Where the participant's placements are remembered.",
    description: 'Description of the prompt node-positions group.',
  },
  promptLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.promptLayoutLabel',
    defaultMessage: 'Position attribute',
    description:
      'Label of the picker naming the codebook attribute one sociogram prompt stores each node’s position in. A layout attribute holds a pair of coordinates.',
  },
  promptLayoutHint: {
    id: 'protocolBuilder.networkCanvas.promptLayoutHint',
    defaultMessage:
      "The attribute that stores each node's position. Prompts sharing an attribute carry the participant's placements between them.",
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
  promptCreateLayoutDescription: {
    id: 'protocolBuilder.networkCanvas.promptCreateLayoutDescription',
    defaultMessage:
      'Create an attribute to store node positions, and use it for this prompt',
    description:
      'Description at the top of the dialog for creating a layout attribute from inside a sociogram prompt. No full stop in the English: it is a subtitle rather than a sentence.',
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
      'Choose the order the nodes the participant has not placed yet are handed to them in.',
    description: 'Description of the sort-unplaced-nodes group.',
  },
  promptSortLabel: {
    id: 'protocolBuilder.networkCanvas.promptSortLabel',
    defaultMessage: 'Sort rules',
    description:
      'Label of the ordered list of rules deciding which unplaced node the participant is handed next. Each rule is one attribute and a direction.',
  },
  promptSortHint: {
    id: 'protocolBuilder.networkCanvas.promptSortHint',
    defaultMessage:
      'Rules are applied in order. Use the asterisk to keep the order the nodes were added in.',
    description:
      'Guidance under the sort-rules list. The asterisk is the option offered in each rule’s attribute picker standing for the order the nodes were created in rather than for any attribute; keep it as the character *.',
  },
  promptSortAddLabel: {
    id: 'protocolBuilder.networkCanvas.promptSortAddLabel',
    defaultMessage:
      'Add a rule for the order unplaced nodes are handed over in',
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
    defaultMessage: 'Tapping a node',
    description:
      'Heading of the group inside the sociogram prompt dialog deciding what the participant tapping a node does.',
  },
  tapDescription: {
    id: 'protocolBuilder.networkCanvas.tapDescription',
    defaultMessage:
      'What happens when the participant taps a node on this prompt.',
    description: 'Description of the tapping-a-node group.',
  },
  tapBehaviourLabel: {
    id: 'protocolBuilder.networkCanvas.tapBehaviourLabel',
    defaultMessage: 'Tap behavior',
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
    defaultMessage: 'Create a connection',
    description:
      'Name of the choice where tapping two nodes draws a relationship between them. Offered as one of three cards; the sentence under it is tapCreateEdgeDescription.',
  },
  tapCreateEdgeDescription: {
    id: 'protocolBuilder.networkCanvas.tapCreateEdgeDescription',
    defaultMessage:
      'Tapping one node and then another draws a connection between them.',
    description:
      'Says what the participant does to draw a connection. A connection is an edge.',
  },
  tapHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.tapHighlightLabel',
    defaultMessage: 'Mark the node',
    description:
      'Name of the choice where tapping a node turns a true-or-false attribute on and off. Offered as one of three cards; the sentence under it is tapHighlightDescription.',
  },
  tapHighlightDescription: {
    id: 'protocolBuilder.networkCanvas.tapHighlightDescription',
    defaultMessage:
      'Tapping a node turns an attribute on, and tapping it again turns it off.',
    description: 'Says what marking a node does to the attribute behind it.',
  },
  promptCreateEdgeLabel: {
    id: 'protocolBuilder.networkCanvas.promptCreateEdgeLabel',
    defaultMessage: 'Connection type created',
    description:
      'Label of the picker naming which kind of relationship tapping two nodes draws.',
  },
  promptCreateEdgeHint: {
    id: 'protocolBuilder.networkCanvas.promptCreateEdgeHint',
    defaultMessage:
      'The kind of connection tapping two nodes draws between them.',
    description: 'Guidance under the connection-type-created picker.',
  },
  promptCreateEdgeRequired: {
    id: 'protocolBuilder.networkCanvas.promptCreateEdgeRequired',
    defaultMessage: 'Choose the kind of connection this prompt creates.',
    description:
      'Refusal shown under the connection-type-created picker when the researcher saves a prompt that draws connections without saying which kind.',
  },
  promptHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.promptHighlightLabel',
    defaultMessage: 'Attribute marked',
    description:
      'Label of the picker naming which true-or-false codebook attribute tapping a node turns on and off.',
  },
  promptHighlightHint: {
    id: 'protocolBuilder.networkCanvas.promptHighlightHint',
    defaultMessage:
      'Tapping a node turns this attribute on, and tapping it again turns it off.',
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
  promptCreateHighlightDescription: {
    id: 'protocolBuilder.networkCanvas.promptCreateHighlightDescription',
    defaultMessage:
      'Create a true-or-false attribute, and mark nodes with it on this prompt',
    description:
      'Description at the top of the dialog for creating a boolean attribute from inside a sociogram prompt. No full stop in the English: it is a subtitle rather than a sentence.',
  },
  promptEdgesTitle: {
    id: 'protocolBuilder.networkCanvas.promptEdgesTitle',
    defaultMessage: 'Connections shown',
    description:
      'Heading of the group inside the sociogram prompt dialog deciding which kinds of relationship are drawn while this prompt is on screen.',
  },
  promptEdgesDescription: {
    id: 'protocolBuilder.networkCanvas.promptEdgesDescription',
    defaultMessage:
      'The kinds of connection drawn between nodes on this prompt.',
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
    defaultMessage: 'Connection types shown',
    description:
      'Label of the tick list choosing which edge types are drawn while one sociogram prompt is on screen.',
  },
  promptDisplayEdgesHint: {
    id: 'protocolBuilder.networkCanvas.promptDisplayEdgesHint',
    defaultMessage: 'Leave every type unticked to draw no connections at all.',
    description:
      'Guidance under the prompt connection-types tick list, saying that ticking nothing is a real answer rather than an unfinished one.',
  },
  promptEmptyPreview: {
    id: 'protocolBuilder.networkCanvas.promptEmptyPreview',
    defaultMessage: 'Empty prompt',
    description:
      'Stands in for a prompt’s text in the collapsed row of the sociogram prompt list while the researcher has not written any yet.',
  },
});
