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
  nodeFormClearTitle: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearTitle',
    defaultMessage: 'This will delete the node form',
    description:
      'Title of the confirmation shown before a researcher switches off the form a Network Composer stage asks about each node. Switching it off discards the form, which is why it is confirmed.',
  },
  nodeFormClearDescription: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearDescription',
    defaultMessage:
      'Every field you have added to it will be removed, and the panel that opens when a participant selects a node will have nothing to ask.',
    description:
      'Body of the confirmation shown before the node form is switched off, saying what is lost. A field is one question the form asks; a node is one person or thing in the participant’s network.',
  },
  nodeFormClearConfirm: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearConfirm',
    defaultMessage: 'Delete the form',
    description:
      'Button that confirms switching off the node form and discarding it.',
  },
  nodeFormFieldNoun: {
    id: 'protocolBuilder.networkCanvas.nodeFormFieldNoun',
    defaultMessage: 'node attribute field',
    description:
      'What one row of the node form’s list is called inside things said ABOUT it — "Edit node attribute field", "Remove this node attribute field?" — so it is lower case and singular. Qualified by "node" because the same stage editor shows a connection list beside it.',
  },
  edgeFormFieldNoun: {
    id: 'protocolBuilder.networkCanvas.edgeFormFieldNoun',
    defaultMessage: 'connection attribute field',
    description:
      'What one row of a connection form’s list is called inside things said ABOUT it, so it is lower case and singular. A connection is an edge — a relationship drawn between two people in the network.',
  },
  presetNoun: {
    id: 'protocolBuilder.networkCanvas.presetNoun',
    defaultMessage: 'preset',
    description:
      'What one row of the visualisation preset list is called inside things said ABOUT it — "Edit preset", "Remove this preset?" — so it is lower case and singular. A preset is one saved way of looking at the network.',
  },
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
      'Gives the inner rings more room than the outer ones, so nodes placed near the centre overlap less.',
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

  // The list of saved ways of looking at the network.
  presetsAtLeastOne: {
    id: 'protocolBuilder.networkCanvas.presetsAtLeastOne',
    defaultMessage:
      'Create at least one preset. A narrative stage with no presets shows the participant nothing.',
    description:
      'Refusal shown above the preset list when a researcher saves a narrative stage that offers no way of looking at the network. A preset is one saved view; a stage is one step of an interview.',
  },
  presetsTitle: {
    id: 'protocolBuilder.networkCanvas.presetsTitle',
    defaultMessage: 'Visualisation presets',
    description:
      'Heading of the section holding the saved ways of looking at the network. Also names the section in the editor outline and to assistive technology.',
  },
  presetsDescription: {
    id: 'protocolBuilder.networkCanvas.presetsDescription',
    defaultMessage:
      'Build the ways of looking at the network that can be switched between during the interview.',
    description: 'Description of the visualisation-presets section.',
  },
  presetsWaitingDescription: {
    id: 'protocolBuilder.networkCanvas.presetsWaitingDescription',
    defaultMessage:
      'Choose what this stage works with before building its presets.',
    description:
      'Shown in place of the presets description while the researcher has not yet chosen which node type the stage is about, so every picker inside a preset would have nothing to offer.',
  },
  presetsFieldLabel: {
    id: 'protocolBuilder.networkCanvas.presetsFieldLabel',
    defaultMessage: 'Presets',
    description:
      'Label of the list of saved views inside the presets section. The same word as the section heading, and translated once for each: the heading names the part of the stage, and this names the control.',
  },
  presetsFieldHint: {
    id: 'protocolBuilder.networkCanvas.presetsFieldHint',
    defaultMessage:
      'Each preset is a whole picture of the network. They are offered in this order, so drag them into the order you want to talk through.',
    description:
      'Guidance under the list of presets. Addressed to the researcher.',
  },
  presetsAddLabel: {
    id: 'protocolBuilder.networkCanvas.presetsAddLabel',
    defaultMessage: 'Create new preset',
    description:
      'Button that opens the dialog for building one more saved view. Whole rather than a generic "Add", because a stage editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  presetsAddTitle: {
    id: 'protocolBuilder.networkCanvas.presetsAddTitle',
    defaultMessage: 'Create preset',
    description:
      'Title of the dialog a researcher fills in to build one more saved view.',
  },
  presetsEditTitle: {
    id: 'protocolBuilder.networkCanvas.presetsEditTitle',
    defaultMessage: 'Edit preset',
    description:
      'Title of the dialog a researcher fills in to change a saved view they have already built.',
  },
  presetsEmptyState: {
    id: 'protocolBuilder.networkCanvas.presetsEmptyState',
    defaultMessage:
      'No presets yet. Create one to say how the network should look.',
    description:
      'Shown in place of the preset list while the stage offers no saved view yet.',
  },

  // One preset, as its dialog asks for it.
  presetIdentityTitle: {
    id: 'protocolBuilder.networkCanvas.presetIdentityTitle',
    defaultMessage: 'Preset identity',
    description:
      'Heading of the group inside the preset dialog holding what this saved view is called.',
  },
  presetIdentityDescription: {
    id: 'protocolBuilder.networkCanvas.presetIdentityDescription',
    defaultMessage: 'Name this way of looking at the network.',
    description: 'Description of the preset-identity group.',
  },
  presetNameLabel: {
    id: 'protocolBuilder.networkCanvas.presetNameLabel',
    defaultMessage: 'Preset name',
    description: 'Label of the box holding what this saved view is called.',
  },
  presetNameHint: {
    id: 'protocolBuilder.networkCanvas.presetNameHint',
    defaultMessage:
      'Shown to the participant when they switch between presets, so name it in their words.',
    description:
      'Guidance under the preset-name box, warning the researcher that this name is participant-facing rather than an internal label.',
  },
  presetNamePlaceholder: {
    id: 'protocolBuilder.networkCanvas.presetNamePlaceholder',
    defaultMessage: 'Enter a name for this preset...',
    description:
      'Placeholder shown in the empty preset-name box. The trailing dots are an ellipsis written as three full stops.',
  },
  presetNameRequired: {
    id: 'protocolBuilder.networkCanvas.presetNameRequired',
    defaultMessage: 'Give this preset a name.',
    description:
      'Refusal shown under the preset-name box when the researcher saves a preset without naming it.',
  },
  presetPositionsTitle: {
    id: 'protocolBuilder.networkCanvas.presetPositionsTitle',
    defaultMessage: 'Node positions',
    description:
      'Heading of the group inside the preset dialog deciding where this saved view puts each node.',
  },
  presetPositionsDescription: {
    id: 'protocolBuilder.networkCanvas.presetPositionsDescription',
    defaultMessage: 'Where this preset puts each node on the canvas.',
    description: 'Description of the preset node-positions group.',
  },
  presetLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.presetLayoutLabel',
    defaultMessage: 'Position attribute',
    description:
      'Label of the picker naming the codebook attribute a preset reads each node’s position from. A layout attribute holds a pair of coordinates.',
  },
  presetLayoutHint: {
    id: 'protocolBuilder.networkCanvas.presetLayoutHint',
    defaultMessage:
      "The attribute that stores each node's position. Presets sharing an attribute share their positions.",
    description: 'Guidance under the preset position-attribute picker.',
  },
  presetLayoutEmpty: {
    id: 'protocolBuilder.networkCanvas.presetLayoutEmpty',
    defaultMessage:
      'This type has no position attributes yet. Create one to lay this preset out.',
    description:
      'Shown in place of the preset position-attribute picker when the node type this stage is about has no layout attribute in the codebook. "This type" is that node type.',
  },
  presetLayoutRequired: {
    id: 'protocolBuilder.networkCanvas.presetLayoutRequired',
    defaultMessage: 'Choose the attribute this preset positions nodes with.',
    description:
      'Refusal shown under the preset position-attribute picker when the researcher saves a preset without choosing one.',
  },
  presetCreateLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.presetCreateLayoutLabel',
    defaultMessage: 'Create a new position attribute',
    description:
      'Button beside the preset position-attribute picker that adds a layout attribute to the codebook without leaving the stage. Also the title of the dialog it opens.',
  },
  presetCreateLayoutDescription: {
    id: 'protocolBuilder.networkCanvas.presetCreateLayoutDescription',
    defaultMessage:
      'Create an attribute to store node positions, and use it for this preset',
    description:
      'Description at the top of the dialog for creating a layout attribute from inside a preset. No full stop in the English: it is a subtitle rather than a sentence.',
  },
  presetGroupingTitle: {
    id: 'protocolBuilder.networkCanvas.presetGroupingTitle',
    defaultMessage: 'Node grouping',
    description:
      'Heading of the group inside the preset dialog deciding which nodes are drawn inside a shared outline.',
  },
  presetGroupingDescription: {
    id: 'protocolBuilder.networkCanvas.presetGroupingDescription',
    defaultMessage:
      'Draw a shaded outline around the nodes that share a value.',
    description: 'Description of the preset node-grouping group.',
  },
  presetGroupLabel: {
    id: 'protocolBuilder.networkCanvas.presetGroupLabel',
    defaultMessage: 'Grouping attribute',
    description:
      'Label of the picker naming the codebook attribute a preset groups nodes by. A categorical attribute holds one or more of a fixed set of values.',
  },
  presetGroupHint: {
    id: 'protocolBuilder.networkCanvas.presetGroupHint',
    defaultMessage:
      'Nodes sharing a value of this attribute are outlined together. A node with several values appears in several overlapping outlines.',
    description: 'Guidance under the preset grouping-attribute picker.',
  },
  presetGroupEmpty: {
    id: 'protocolBuilder.networkCanvas.presetGroupEmpty',
    defaultMessage:
      'This type has no attributes with a fixed set of values, so there is nothing to group by.',
    description:
      'Shown in place of the preset grouping-attribute picker when the node type this stage is about has no categorical attribute in the codebook. "This type" is that node type.',
  },
  presetConnectionsTitle: {
    id: 'protocolBuilder.networkCanvas.presetConnectionsTitle',
    defaultMessage: 'Connections',
    description:
      'Heading of the group inside the preset dialog deciding which kinds of relationship are drawn between the nodes. A connection is an edge.',
  },
  presetConnectionsDescription: {
    id: 'protocolBuilder.networkCanvas.presetConnectionsDescription',
    defaultMessage: 'The kinds of connection this preset draws between nodes.',
    description: 'Description of the preset connections group.',
  },
  presetDisplayEdgesLabel: {
    id: 'protocolBuilder.networkCanvas.presetDisplayEdgesLabel',
    defaultMessage: 'Connection types shown',
    description:
      'Label of the tick list choosing which edge types a preset draws.',
  },
  presetDisplayEdgesHint: {
    id: 'protocolBuilder.networkCanvas.presetDisplayEdgesHint',
    defaultMessage: 'Leave every type unticked to show no connections at all.',
    description:
      'Guidance under the preset connection-types tick list, saying that ticking nothing is a real answer rather than an unfinished one.',
  },
  presetHighlightTitle: {
    id: 'protocolBuilder.networkCanvas.presetHighlightTitle',
    defaultMessage: 'Highlighted nodes',
    description:
      'Heading of the group inside the preset dialog deciding which nodes are drawn so as to stand out.',
  },
  presetHighlightDescription: {
    id: 'protocolBuilder.networkCanvas.presetHighlightDescription',
    defaultMessage: 'Make some nodes stand out from the rest.',
    description: 'Description of the preset highlighted-nodes group.',
  },
  presetHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.presetHighlightLabel',
    defaultMessage: 'Highlight attributes',
    description:
      'Label of the tick list choosing which true-or-false codebook attributes make a node stand out.',
  },
  presetHighlightHint: {
    id: 'protocolBuilder.networkCanvas.presetHighlightHint',
    defaultMessage:
      'A node is highlighted while any of these attributes is true of it.',
    description: 'Guidance under the preset highlight-attributes tick list.',
  },
  presetUnnamedPreview: {
    id: 'protocolBuilder.networkCanvas.presetUnnamedPreview',
    defaultMessage: 'Unnamed preset',
    description:
      'Stands in for a preset’s name in the collapsed row of the preset list while the researcher has not written one yet.',
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
    defaultMessage: 'Tap behaviour',
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

  // How a network composer's nodes are added and arranged.
  composerNodeTitle: {
    id: 'protocolBuilder.networkCanvas.composerNodeTitle',
    defaultMessage: 'Adding and arranging nodes',
    description:
      'Heading of the section deciding what a participant can do with nodes on a Network Composer canvas. Also names the section in the editor outline and to assistive technology.',
  },
  composerNodeDescription: {
    id: 'protocolBuilder.networkCanvas.composerNodeDescription',
    defaultMessage:
      'How the participant adds nodes to the canvas, where those nodes sit, and how they group them.',
    description: 'Description of the adding-and-arranging-nodes section.',
  },
  composerNodeWaitingDescription: {
    id: 'protocolBuilder.networkCanvas.composerNodeWaitingDescription',
    defaultMessage:
      'Choose what this stage works with before configuring how its nodes behave.',
    description:
      'Shown in place of the adding-and-arranging-nodes description while the researcher has not yet chosen which node type the stage is about, so every attribute picker in it would have nothing to offer.',
  },
  quickAddLabel: {
    id: 'protocolBuilder.networkCanvas.quickAddLabel',
    defaultMessage: 'Attribute filled in when a node is added',
    description:
      'Label of the picker naming the codebook attribute the participant answers in the one box they type into to add a node.',
  },
  quickAddHint: {
    id: 'protocolBuilder.networkCanvas.quickAddHint',
    defaultMessage:
      'The participant types one thing to add a node — usually a name. It is stored in this attribute, and checked against the rules the codebook gives it.',
    description:
      'Guidance under the quick-add attribute picker. The codebook is where a protocol’s attributes and their validation rules are defined.',
  },
  quickAddEmpty: {
    id: 'protocolBuilder.networkCanvas.quickAddEmpty',
    defaultMessage:
      'This type has no free-text attributes available, so there is nothing for the quick-add box to fill in.',
    description:
      'Shown in place of the quick-add attribute picker when the node type this stage is about has no text attribute the stage may take. "This type" is that node type.',
  },
  createQuickAddLabel: {
    id: 'protocolBuilder.networkCanvas.createQuickAddLabel',
    defaultMessage: 'Create a new attribute to fill in',
    description:
      'Button beside the quick-add attribute picker that adds a text attribute to the codebook without leaving the stage. Also the title of the dialog it opens.',
  },
  createQuickAddDescription: {
    id: 'protocolBuilder.networkCanvas.createQuickAddDescription',
    defaultMessage:
      'Create a free-text attribute, and fill it in when a node is added',
    description:
      'Description at the top of the dialog for creating a text attribute from the quick-add picker. No full stop in the English: it is a subtitle rather than a sentence.',
  },
  composerLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.composerLayoutLabel',
    defaultMessage: 'Position attribute',
    description:
      'Label of the picker naming the codebook attribute a Network Composer stage stores each node’s position in. A layout attribute holds a pair of coordinates.',
  },
  composerLayoutHint: {
    id: 'protocolBuilder.networkCanvas.composerLayoutHint',
    defaultMessage:
      "The attribute that stores each node's position. Stages sharing an attribute carry the participant's placements between them.",
    description:
      'Guidance under the composer position-attribute picker. A stage is one step of an interview.',
  },
  composerLayoutEmpty: {
    id: 'protocolBuilder.networkCanvas.composerLayoutEmpty',
    defaultMessage:
      'This type has no position attributes yet. Create one to store where the participant puts each node.',
    description:
      'Shown in place of the composer position-attribute picker when the node type this stage is about has no layout attribute in the codebook. "This type" is that node type.',
  },
  composerCreateLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.composerCreateLayoutLabel',
    defaultMessage: 'Create a new position attribute',
    description:
      'Button beside the composer position-attribute picker that adds a layout attribute to the codebook without leaving the stage. Also the title of the dialog it opens.',
  },
  composerCreateLayoutDescription: {
    id: 'protocolBuilder.networkCanvas.composerCreateLayoutDescription',
    defaultMessage:
      'Create an attribute to store node positions, and use it on this stage',
    description:
      'Description at the top of the dialog for creating a layout attribute from a Network Composer stage. No full stop in the English: it is a subtitle rather than a sentence.',
  },
  composerAutomaticLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.composerAutomaticLayoutLabel',
    defaultMessage: 'Start with automatic layout switched on',
    description:
      'Label of the switch deciding whether a Network Composer canvas is already arranging its nodes when the participant arrives.',
  },
  composerAutomaticLayoutHint: {
    id: 'protocolBuilder.networkCanvas.composerAutomaticLayoutHint',
    defaultMessage:
      'Arranges the nodes by simulating attraction and repulsion. The participant can switch this off and on during the interview; this is only where it starts.',
    description:
      'Guidance under the start-with-automatic-layout switch, saying that the researcher is choosing a starting point rather than taking the choice away from the participant.',
  },
  hullLabel: {
    id: 'protocolBuilder.networkCanvas.hullLabel',
    defaultMessage: 'Grouping attribute',
    description:
      'Label of the picker naming the codebook attribute a Network Composer stage draws shared outlines around nodes by. A categorical attribute holds one or more of a fixed set of values.',
  },
  hullHint: {
    id: 'protocolBuilder.networkCanvas.hullHint',
    defaultMessage:
      'Nodes sharing a value of this attribute are drawn inside a shaded outline. The participant sets those values on the canvas, so this attribute is written without the codebook checking it.',
    description:
      'Guidance under the composer grouping-attribute picker, warning that values written this way bypass the codebook’s validation rules.',
  },
  hullEmpty: {
    id: 'protocolBuilder.networkCanvas.hullEmpty',
    defaultMessage:
      'This type has no attributes with a fixed set of values, so there is nothing to group nodes by.',
    description:
      'Shown in place of the composer grouping-attribute picker when the node type this stage is about has no categorical attribute the stage may take. "This type" is that node type.',
  },
  createHullLabel: {
    id: 'protocolBuilder.networkCanvas.createHullLabel',
    defaultMessage: 'Create a new grouping attribute',
    description:
      'Button beside the composer grouping-attribute picker that adds a categorical attribute to the codebook without leaving the stage. Also the title of the dialog it opens.',
  },
  createHullDescription: {
    id: 'protocolBuilder.networkCanvas.createHullDescription',
    defaultMessage:
      'Create an attribute with a fixed set of values, and group nodes by it',
    description:
      'Description at the top of the dialog for creating a categorical attribute from the grouping picker. No full stop in the English: it is a subtitle rather than a sentence.',
  },
  quickAddUnvalidatedElsewhereRefusal: {
    id: 'protocolBuilder.networkCanvas.quickAddUnvalidatedElsewhereRefusal',
    defaultMessage:
      '"{variableName}" is already written directly by another part of this protocol, so a form here would validate values it did not collect. Choose a different attribute.',
    description:
      'Refusal shown under the quick-add attribute picker when the attribute chosen is already written somewhere that bypasses the codebook’s validation rules — a canvas grouping, a highlight, a stamp — which cannot be mixed with an attribute collected through those rules. variableName is the attribute’s researcher-facing name, shown inside straight double quotes.',
  },

  // The node form a network composer opens when a node is selected.
  nodeFormTitle: {
    id: 'protocolBuilder.networkCanvas.nodeFormTitle',
    defaultMessage: 'Node attributes',
    description:
      'Heading of the section holding the form a Network Composer shows when a participant selects a node. Also names the section in the editor outline and to assistive technology.',
  },
  nodeFormDescription: {
    id: 'protocolBuilder.networkCanvas.nodeFormDescription',
    defaultMessage:
      'Optionally let the participant fill in more about each node after they have added it.',
    description:
      'Description of the node-attributes section, which is a capability the researcher can leave switched off.',
  },
  nodeFormFieldsLabel: {
    id: 'protocolBuilder.networkCanvas.nodeFormFieldsLabel',
    defaultMessage: 'Form fields',
    description:
      'Label of the ordered list of questions the node form asks. A field is one question.',
  },
  nodeFormFieldsHint: {
    id: 'protocolBuilder.networkCanvas.nodeFormFieldsHint',
    defaultMessage:
      'The participant answers these in the panel that opens when they select a node. Drag to reorder them.',
    description: 'Guidance under the node form’s list of fields.',
  },
  nodeFormAddLabel: {
    id: 'protocolBuilder.networkCanvas.nodeFormAddLabel',
    defaultMessage: 'Create new node attribute field',
    description:
      'Button that opens the dialog for adding one more question to the node form. Whole rather than a generic "Add", because the same stage editor shows a connection list beside it and the two would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  nodeFormAddTitle: {
    id: 'protocolBuilder.networkCanvas.nodeFormAddTitle',
    defaultMessage: 'Create node attribute field',
    description:
      'Title of the dialog a researcher fills in to add one more question to the node form.',
  },
  nodeFormEditTitle: {
    id: 'protocolBuilder.networkCanvas.nodeFormEditTitle',
    defaultMessage: 'Edit node attribute field',
    description:
      'Title of the dialog a researcher fills in to change a question the node form already asks.',
  },
  nodeFormEmptyState: {
    id: 'protocolBuilder.networkCanvas.nodeFormEmptyState',
    defaultMessage:
      'No node attributes yet. Create one to ask the participant something about each node.',
    description:
      'Shown in place of the node form’s list of fields while it asks nothing yet.',
  },

  // Which connections a network composer lets the participant draw.
  composerEdgeTitle: {
    id: 'protocolBuilder.networkCanvas.composerEdgeTitle',
    defaultMessage: 'Connections',
    description:
      'Heading of the section deciding which kinds of relationship a participant may draw between nodes on a Network Composer canvas. Also names the section in the editor outline and to assistive technology.',
  },
  composerEdgeDescription: {
    id: 'protocolBuilder.networkCanvas.composerEdgeDescription',
    defaultMessage:
      'Choose the kinds of connection the participant can draw between nodes on this canvas.',
    description: 'Description of the connections section.',
  },
  composerEdgeFieldLabel: {
    id: 'protocolBuilder.networkCanvas.composerEdgeFieldLabel',
    defaultMessage: 'Connection types',
    description:
      'Label of the tick list choosing which edge types the stage draws.',
  },
  composerEdgeFieldHint: {
    id: 'protocolBuilder.networkCanvas.composerEdgeFieldHint',
    defaultMessage:
      'The participant can draw a connection of any kind you tick here. Leave them all unticked to build a network of nodes alone.',
    description:
      'Guidance under the connection-types tick list. Addressed to the researcher; ticking nothing is a real answer rather than an unfinished one.',
  },
  composerEdgeEmpty: {
    id: 'protocolBuilder.networkCanvas.composerEdgeEmpty',
    defaultMessage:
      'This protocol has no connection types yet. Create one to let the participant connect nodes.',
    description:
      'Shown in place of the connection-types tick list when the protocol’s codebook defines no edge type at all.',
  },
  createEdgeTypeLabel: {
    id: 'protocolBuilder.networkCanvas.createEdgeTypeLabel',
    defaultMessage: 'Create a new connection type',
    description:
      'Button beside the connection-types tick list that adds an edge type to the protocol without leaving the stage. Also the title of the dialog it opens.',
  },
  createEdgeTypeDescription: {
    id: 'protocolBuilder.networkCanvas.createEdgeTypeDescription',
    defaultMessage:
      'Create a connection type, and let the participant draw it on this stage',
    description:
      'Description at the top of the dialog for creating an edge type from a Network Composer stage. No full stop in the English: it is a subtitle rather than a sentence.',
  },
  edgeFormsTitle: {
    id: 'protocolBuilder.networkCanvas.edgeFormsTitle',
    defaultMessage: 'Connection attributes',
    description:
      'Heading of the section holding one form per connection type the stage draws. Also names the section in the editor outline and to assistive technology.',
  },
  edgeFormsDescription: {
    id: 'protocolBuilder.networkCanvas.edgeFormsDescription',
    defaultMessage:
      'Optionally ask the participant more about each connection they draw. Each connection type is asked about separately, because each records its own attributes.',
    description: 'Description of the connection-attributes section.',
  },
  edgeFormHeading: {
    id: 'protocolBuilder.networkCanvas.edgeFormHeading',
    defaultMessage: 'Attributes for "{typeName}" connections',
    description:
      'Heading naming which connection type the form below it belongs to. typeName is the edge type’s researcher-facing name from the codebook, shown inside straight double quotes.',
  },
  edgeFormFieldsHint: {
    id: 'protocolBuilder.networkCanvas.edgeFormFieldsHint',
    defaultMessage:
      'The participant answers these in the panel that opens when they select a connection of this kind. Drag to reorder them.',
    description: 'Guidance under one connection form’s list of fields.',
  },
  edgeFormAddLabel: {
    id: 'protocolBuilder.networkCanvas.edgeFormAddLabel',
    defaultMessage: 'Create new attribute field for "{typeName}" connections',
    description:
      'Button that opens the dialog for adding one more question to one connection type’s form. Names the type because a stage draws several kinds of connection and their lists sit one under another. typeName is the edge type’s researcher-facing name, shown inside straight double quotes.',
  },
  edgeFormAddTitle: {
    id: 'protocolBuilder.networkCanvas.edgeFormAddTitle',
    defaultMessage: 'Create attribute field for "{typeName}" connections',
    description:
      'Title of the dialog a researcher fills in to add one more question to one connection type’s form. typeName is the edge type’s researcher-facing name, shown inside straight double quotes.',
  },
  edgeFormEditTitle: {
    id: 'protocolBuilder.networkCanvas.edgeFormEditTitle',
    defaultMessage: 'Edit attribute field for "{typeName}" connections',
    description:
      'Title of the dialog a researcher fills in to change a question one connection type’s form already asks. typeName is the edge type’s researcher-facing name, shown inside straight double quotes.',
  },
  edgeFormEmptyState: {
    id: 'protocolBuilder.networkCanvas.edgeFormEmptyState',
    defaultMessage:
      'No attributes yet for this connection type. Create one to ask the participant something about each connection they draw.',
    description:
      'Shown in place of one connection type’s list of fields while its form asks nothing yet.',
  },

  // One field of a composer form, as its dialog asks for it.
  formFieldVariableLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldVariableLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the picker naming the codebook attribute one form field records its answer in.',
  },
  formFieldVariableHint: {
    id: 'protocolBuilder.networkCanvas.formFieldVariableHint',
    defaultMessage:
      'The attribute each answer is recorded in. Only attributes a form can collect are listed: a position or a location is written by the canvas, not answered.',
    description:
      'Guidance under the form field’s attribute picker, saying why some of the codebook’s attributes are missing from it.',
  },
  formFieldVariableEmpty: {
    id: 'protocolBuilder.networkCanvas.formFieldVariableEmpty',
    defaultMessage:
      'This type has no attributes a form can collect yet. Create one in the codebook to continue.',
    description:
      'Shown in place of the form field’s attribute picker when the entity type this form is about has no attribute a participant could answer. "This type" is that node or edge type.',
  },
  formFieldVariableRequired: {
    id: 'protocolBuilder.networkCanvas.formFieldVariableRequired',
    defaultMessage: 'Choose the attribute this field records.',
    description:
      'Refusal shown under the form field’s attribute picker when the researcher saves a field without choosing one.',
  },
  formFieldControlLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldControlLabel',
    defaultMessage: 'Input control',
    description:
      'Label of the picker naming which on-screen control the participant answers this field with — a text box, a slider, a set of radio buttons.',
  },
  formFieldControlHint: {
    id: 'protocolBuilder.networkCanvas.formFieldControlHint',
    defaultMessage:
      'How the participant answers. Only controls that can render this attribute are listed.',
    description:
      'Guidance under the input-control picker, saying why some controls are missing from it.',
  },
  formFieldControlPlaceholder: {
    id: 'protocolBuilder.networkCanvas.formFieldControlPlaceholder',
    defaultMessage: 'Select an input control...',
    description:
      'Placeholder shown in the input-control picker before one is chosen. The trailing dots are an ellipsis written as three full stops.',
  },
  formFieldControlRequired: {
    id: 'protocolBuilder.networkCanvas.formFieldControlRequired',
    defaultMessage: 'Choose how the participant answers this field.',
    description:
      'Refusal shown under the input-control picker when the researcher saves a field without choosing one.',
  },
  formFieldQuestionLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldQuestionLabel',
    defaultMessage: 'Question',
    description:
      'Label of the box holding the words the participant reads above this field.',
  },
  formFieldQuestionHint: {
    id: 'protocolBuilder.networkCanvas.formFieldQuestionHint',
    defaultMessage:
      "What the participant is asked. Leave it empty to use the attribute's own name.",
    description:
      'Guidance under the form field’s question box, saying what happens when it is left empty.',
  },
  formFieldQuestionPlaceholder: {
    id: 'protocolBuilder.networkCanvas.formFieldQuestionPlaceholder',
    defaultMessage: 'Enter your question...',
    description:
      'Placeholder shown in the empty question box. The trailing dots are an ellipsis written as three full stops.',
  },
  formFieldHelpLabel: {
    id: 'protocolBuilder.networkCanvas.formFieldHelpLabel',
    defaultMessage: 'Help text',
    description:
      'Label of the box holding an optional explanation shown under this field’s question.',
  },
  formFieldHelpHint: {
    id: 'protocolBuilder.networkCanvas.formFieldHelpHint',
    defaultMessage:
      'Shown under the question, for anything the participant might need explained. Optional.',
    description: 'Guidance under the form field’s help-text box.',
  },
  formFieldHelpPlaceholder: {
    id: 'protocolBuilder.networkCanvas.formFieldHelpPlaceholder',
    defaultMessage: 'Enter help text...',
    description:
      'Placeholder shown in the empty help-text box. The trailing dots are an ellipsis written as three full stops.',
  },
  formFieldRecordsAttribute: {
    id: 'protocolBuilder.networkCanvas.formFieldRecordsAttribute',
    defaultMessage: 'Records the attribute "{attributeName}"',
    description:
      'Badge in the collapsed row of a composer form’s field list saying which codebook attribute that field writes to. attributeName is the attribute’s researcher-facing name, shown inside straight double quotes.',
  },
  formFieldEmptyPreview: {
    id: 'protocolBuilder.networkCanvas.formFieldEmptyPreview',
    defaultMessage: 'Empty field',
    description:
      'Stands in for a field’s question in the collapsed row of a composer form’s field list while the researcher has neither written a question nor chosen an attribute to borrow a name from.',
  },
  duplicateVariableRefusal: {
    id: 'protocolBuilder.networkCanvas.duplicateVariableRefusal',
    defaultMessage:
      'Another field on this form already records this attribute. Choose a different one, or edit the existing field instead.',
    description:
      'Refusal shown under a composer form field’s attribute picker when a sibling field of the same form already records its answer under the attribute just chosen.',
  },
  fieldParametersLegend: {
    id: 'protocolBuilder.networkCanvas.fieldParametersLegend',
    defaultMessage: 'What this field accepts',
    description:
      'Heading of the block inside a composer form field’s dialog holding the settings the chosen input control takes — the two dates a date picker allows, the words at each end of a sliding scale.',
  },
  fieldParametersDescription: {
    id: 'protocolBuilder.networkCanvas.fieldParametersDescription',
    defaultMessage:
      'These settings belong to this field rather than to the attribute, so the same attribute can be asked for differently on another form.',
    description:
      'Guidance under the settings block’s heading, explaining that these settings are saved with the stage rather than with the codebook attribute.',
  },

  // The input controls a composer form field can be answered with. Keyed by
  // the schema's own `ComponentTypes` tokens in `composerFormComponents.ts`;
  // each says what the PARTICIPANT will see, because that is the thing the
  // researcher is choosing between.
  inputControlText: {
    id: 'protocolBuilder.networkCanvas.inputControlText',
    defaultMessage: 'Single-line text box',
    description:
      'Researcher-facing name of the input control that is one line the participant types into.',
  },
  inputControlTextArea: {
    id: 'protocolBuilder.networkCanvas.inputControlTextArea',
    defaultMessage: 'Multi-line text box',
    description:
      'Researcher-facing name of the input control that is a box of several lines the participant types into.',
  },
  inputControlNumber: {
    id: 'protocolBuilder.networkCanvas.inputControlNumber',
    defaultMessage: 'Number box',
    description:
      'Researcher-facing name of the input control that accepts a number only.',
  },
  inputControlRadioGroup: {
    id: 'protocolBuilder.networkCanvas.inputControlRadioGroup',
    defaultMessage: 'Radio buttons — one answer',
    description:
      'Researcher-facing name of the input control offering a set of options of which the participant may pick exactly one. The dash separates the control from what it allows.',
  },
  inputControlCheckboxGroup: {
    id: 'protocolBuilder.networkCanvas.inputControlCheckboxGroup',
    defaultMessage: 'Checkboxes — several answers',
    description:
      'Researcher-facing name of the input control offering a set of options of which the participant may pick any number. The dash separates the control from what it allows.',
  },
  inputControlBoolean: {
    id: 'protocolBuilder.networkCanvas.inputControlBoolean',
    defaultMessage: 'Yes or no buttons',
    description:
      'Researcher-facing name of the input control offering two named answers side by side. The words on the two buttons are the attribute’s own and default to Yes and No.',
  },
  inputControlToggle: {
    id: 'protocolBuilder.networkCanvas.inputControlToggle',
    defaultMessage: 'Toggle switch',
    description:
      'Researcher-facing name of the input control that is a single switch the participant turns on or off.',
  },
  inputControlToggleButtonGroup: {
    id: 'protocolBuilder.networkCanvas.inputControlToggleButtonGroup',
    defaultMessage: 'Toggle buttons — several answers',
    description:
      'Researcher-facing name of the input control offering a row of buttons the participant switches on and off independently. The dash separates the control from what it allows.',
  },
  inputControlVisualAnalogScale: {
    id: 'protocolBuilder.networkCanvas.inputControlVisualAnalogScale',
    defaultMessage: 'Sliding scale',
    description:
      'Researcher-facing name of the input control that is a slider the participant moves between two ends.',
  },
  inputControlLikertScale: {
    id: 'protocolBuilder.networkCanvas.inputControlLikertScale',
    defaultMessage: 'Likert scale',
    description:
      'Researcher-facing name of the input control offering a run of ordered, labelled steps between two extremes. Likert is a surname and is not translated.',
  },
  inputControlDatePicker: {
    id: 'protocolBuilder.networkCanvas.inputControlDatePicker',
    defaultMessage: 'Date picker',
    description:
      'Researcher-facing name of the input control the participant chooses a calendar date with.',
  },
  inputControlRelativeDatePicker: {
    id: 'protocolBuilder.networkCanvas.inputControlRelativeDatePicker',
    defaultMessage: 'Relative date picker',
    description:
      'Researcher-facing name of the input control the participant chooses a date with, measured from a fixed point rather than from the calendar — "three weeks ago" rather than a date.',
  },
});
