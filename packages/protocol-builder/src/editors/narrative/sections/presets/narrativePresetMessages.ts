import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What a narrative stage says about the ways of looking at the network it
 * offers.
 *
 * One file rather than descriptors beside the markup, which is the rule
 * elsewhere in this package, because of the seam: the list section hands four
 * of these sentences to the shared row machinery and the row dialog renders
 * the rest, so a translator reading half of one decision in two files would be
 * reading half of this section.
 */
export const narrativePresetMessages = defineMessages({
  presetsTitle: {
    id: 'protocolBuilder.networkCanvas.presetsTitle',
    defaultMessage: 'Visualization presets',
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
  presetsAtLeastOne: {
    id: 'protocolBuilder.networkCanvas.presetsAtLeastOne',
    defaultMessage:
      'Create at least one preset. A narrative stage with no presets shows the participant nothing.',
    description:
      'Refusal shown above the preset list when a researcher saves a narrative stage that offers no way of looking at the network. A preset is one saved view; a stage is one step of an interview.',
  },
  presetNoun: {
    id: 'protocolBuilder.networkCanvas.presetNoun',
    defaultMessage: 'preset',
    description:
      'What one row of the visualisation preset list is called inside things said ABOUT it — "Edit preset", "Delete this preset?" — so it is lower case and singular. A preset is one saved way of looking at the network.',
  },
  presetUnnamedPreview: {
    id: 'protocolBuilder.networkCanvas.presetUnnamedPreview',
    defaultMessage: 'Unnamed preset',
    description:
      'Stands in for a preset’s name in the collapsed row of the preset list while the researcher has not written one yet.',
  },
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
  presetUnavailableHighlightAttribute: {
    id: 'protocolBuilder.networkCanvas.presetUnavailableHighlightAttribute',
    defaultMessage: '{attributeId} — this attribute is not available here',
    description:
      'Name of the tick-list choice standing for an attribute a preset still highlights by and the list can no longer offer — it may have been deleted from the protocol’s codebook, or changed to a kind of attribute that is not true-or-false. Worded for what the list knows: it is handed the true-or-false attributes and a stored choice, and cannot tell those two cases apart. attributeId is the raw stored identifier, which is not translated.',
  },
});
