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
      'Create visualizations that researchers can switch between during the interview.',
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
      'Add one or more "presets" below, to create different visualizations that you can switch between within the interview.',
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
  presetNameLabel: {
    id: 'protocolBuilder.networkCanvas.presetNameLabel',
    defaultMessage: 'Preset label',
    description: 'Label of the box holding what this saved view is called.',
  },
  presetNameHint: {
    id: 'protocolBuilder.networkCanvas.presetNameHint',
    defaultMessage:
      'The preset label will used to quickly identify the preset from within the narrative interface. It will be visible to the participant.',
    description:
      'Guidance under the preset-name box, warning the researcher that this name is participant-facing rather than an internal label.',
  },
  presetNamePlaceholder: {
    id: 'protocolBuilder.networkCanvas.presetNamePlaceholder',
    defaultMessage: 'Enter a label for the preset...',
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
    defaultMessage: 'Node layout',
    description:
      'Heading of the group inside the preset dialog deciding where this saved view puts each node.',
  },
  presetLayoutLabel: {
    id: 'protocolBuilder.networkCanvas.presetLayoutLabel',
    defaultMessage: 'Layout',
    description:
      'Label of the control choosing the layout that a preset shows nodes in. A layout is a named set of node positions in the codebook, set on a sociogram or network composer stage.',
  },
  presetLayoutHint: {
    id: 'protocolBuilder.networkCanvas.presetLayoutHint',
    defaultMessage:
      'Select the layout this preset shows. Nodes appear where they were placed on an earlier stage that uses this layout.',
    description:
      'Guidance under the preset layout control. A stage is one step of an interview; a sociogram or network composer stage is where nodes are placed in a layout.',
  },
  presetLayoutRequired: {
    id: 'protocolBuilder.networkCanvas.presetLayoutRequired',
    defaultMessage: 'Choose the layout this preset shows.',
    description:
      'Refusal shown under the preset layout control when the researcher saves a preset without choosing a layout.',
  },
  presetFilterTitle: {
    id: 'protocolBuilder.networkCanvas.presetFilterTitle',
    defaultMessage: 'Preset filter',
    description:
      'Heading of the part of the dialog for one narrative preset that narrows which members of the network the preset shows. Each preset has a filter of its own, so two presets on one stage can show different parts of the network.',
  },
  presetFilterDescription: {
    id: 'protocolBuilder.networkCanvas.presetFilterDescription',
    defaultMessage:
      'Filter the nodes and edges shown in this preset. A preset with no filter shows the whole network.',
    description:
      'Description of the preset-filter part of the dialog for one narrative preset. A node is one member of the network; an edge is a connection between two members.',
  },
  presetFilterRulesLabel: {
    id: 'protocolBuilder.networkCanvas.presetFilterRulesLabel',
    defaultMessage: 'Filter rules',
    description:
      'Label of the rule builder narrowing which members of the network one narrative preset shows.',
  },
  presetFilterRulesHint: {
    id: 'protocolBuilder.networkCanvas.presetFilterRulesHint',
    defaultMessage:
      'Create one or more rules that must match in order for a node or edge to be shown in this preset.',
    description: 'Guidance under one narrative preset’s filter rules.',
  },
  presetFilterClearTitle: {
    id: 'protocolBuilder.networkCanvas.presetFilterClearTitle',
    defaultMessage: 'This will clear this preset’s filter',
    description:
      'Title of the dialog asking a researcher to confirm switching off one narrative preset’s filter, which throws away every rule in it.',
  },
  presetFilterClearDescription: {
    id: 'protocolBuilder.networkCanvas.presetFilterClearDescription',
    defaultMessage:
      'This will clear the filter, and delete any rules you have created for it. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching one narrative preset’s filter off throws away every rule in it.',
  },
  presetFilterClearConfirm: {
    id: 'protocolBuilder.networkCanvas.presetFilterClearConfirm',
    defaultMessage: 'Clear filter',
    description:
      'Action that confirms switching one narrative preset’s filter off and discarding its rules.',
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
      'Draw convex hulls around nodes that share a categorical attribute.',
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
      'The selected values draw semi-transparent convex hulls around matching nodes; nodes with multiple values appear in overlapping hulls.',
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
    defaultMessage: 'Displayed edges',
    description:
      'Heading of the group inside the preset dialog deciding which kinds of relationship are drawn between the nodes. An edge is a connection between two members of the network.',
  },
  presetConnectionsDescription: {
    id: 'protocolBuilder.networkCanvas.presetConnectionsDescription',
    defaultMessage: 'Select the edge types shown in this visualization preset.',
    description: 'Description of the preset connections group.',
  },
  presetDisplayEdgesLabel: {
    id: 'protocolBuilder.networkCanvas.presetDisplayEdgesLabel',
    defaultMessage: 'Edge types',
    description:
      'Label of the tick list choosing which edge types a preset draws.',
  },
  presetDisplayEdgesHint: {
    id: 'protocolBuilder.networkCanvas.presetDisplayEdgesHint',
    defaultMessage: 'Leave every type unticked to show no connections at all.',
    description:
      'Guidance under the preset connection-types tick list, saying that ticking nothing is a real answer rather than an unfinished one.',
  },
  presetEdgeLegendLabel: {
    id: 'protocolBuilder.networkCanvas.presetEdgeLegendLabel',
    defaultMessage: 'Label for “{edgeType}”',
    description:
      'Label of the text box naming one drawn edge type in the interview. edgeType is the edge type’s name in the protocol’s codebook, which is not translated.',
  },
  presetEdgeLegendHint: {
    id: 'protocolBuilder.networkCanvas.presetEdgeLegendHint',
    defaultMessage:
      'Shown during the interview, in the legend of connections this preset draws.',
    description:
      'Guidance under the text box naming one drawn edge type, saying where the label appears.',
  },
  presetEdgeLegendRequired: {
    id: 'protocolBuilder.networkCanvas.presetEdgeLegendRequired',
    defaultMessage: 'Enter a label for this edge type.',
    description: 'Shown when the label of a drawn edge type is left empty.',
  },
  presetHighlightTitle: {
    id: 'protocolBuilder.networkCanvas.presetHighlightTitle',
    defaultMessage: 'Node highlighting',
    description:
      'Heading of the group inside the preset dialog deciding which nodes are drawn so as to stand out.',
  },
  presetHighlightDescription: {
    id: 'protocolBuilder.networkCanvas.presetHighlightEntriesDescription',
    defaultMessage:
      'Add a highlight for each boolean attribute that the interviewer can use to make nodes stand out. Nodes stand out while their attribute is true.',
    description:
      'Description of the node-highlighting group in the dialog for one narrative preset, on a stage that shows one node type. Read by the researcher designing the stage. A boolean attribute is a true-or-false codebook variable; the interviewer is the person running the interview.',
  },
  presetHighlightDescriptionSeveral: {
    id: 'protocolBuilder.networkCanvas.presetHighlightDescriptionSeveral',
    defaultMessage:
      'Add a highlight for each set of boolean attributes that the interviewer can use to make nodes stand out. Choose an attribute for each node type that the highlight covers. Nodes stand out while the attribute for their type is true.',
    description:
      'Description of the node-highlighting group in the dialog for one narrative preset, on a stage that shows several node types. One highlight names one true-or-false attribute of each node type, so one switch in the interview makes nodes of every type stand out. Read by the researcher designing the stage.',
  },
  presetHighlightLabel: {
    id: 'protocolBuilder.networkCanvas.presetHighlightEntriesLabel',
    defaultMessage: 'Highlights',
    description:
      'Label of the list of highlights in the dialog for one narrative preset. A highlight is one way the interviewer can make some nodes stand out during the interview.',
  },
  presetHighlightEmptyState: {
    id: 'protocolBuilder.networkCanvas.presetHighlightEmptyState',
    defaultMessage: 'This preset has no highlights.',
    description:
      'Shown in place of the list of highlights in the dialog for one narrative preset while the preset has none. Not a problem to fix: a preset may highlight nothing.',
  },
  presetHighlightAdd: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAdd',
    defaultMessage: 'Add a highlight',
    description:
      'Button in the dialog for one narrative preset that adds one more highlight to the preset. A highlight is one way the interviewer can make some nodes stand out during the interview.',
  },
  presetHighlightEntryLegend: {
    id: 'protocolBuilder.networkCanvas.presetHighlightEntryLegend',
    defaultMessage: 'Highlight {number}',
    description:
      'Heading of the group of controls for one highlight in the dialog for one narrative preset. number is the position of the highlight in the list, starting at 1.',
  },
  presetHighlightEntryRemove: {
    id: 'protocolBuilder.networkCanvas.presetHighlightEntryRemove',
    defaultMessage: 'Remove highlight {number}',
    description:
      'Button in the dialog for one narrative preset that removes one highlight from the preset. number is the position of the highlight in the list, starting at 1.',
  },
  presetHighlightLegendLabel: {
    id: 'protocolBuilder.networkCanvas.presetHighlightLegendLabel',
    defaultMessage: 'Highlight label',
    description:
      'Label of the text box for the name of one highlight in the dialog for one narrative preset. The name is shown during the interview.',
  },
  presetHighlightLegendHint: {
    id: 'protocolBuilder.networkCanvas.presetHighlightLegendHint',
    defaultMessage:
      'Shown during the interview, in the list of highlights this preset offers.',
    description:
      'Guidance under the text box for the name of one highlight, saying where the name appears.',
  },
  presetHighlightLegendRequired: {
    id: 'protocolBuilder.networkCanvas.presetHighlightLegendRequired',
    defaultMessage: 'Enter a label for this highlight.',
    description:
      'Shown under the text box for the name of one highlight in the dialog for one narrative preset, when the researcher saves the preset with that box empty.',
  },
  presetHighlightAttribute: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAttribute',
    defaultMessage: 'Attribute',
    description:
      'Label of the picker for the true-or-false codebook attribute that one highlight of a narrative preset reads, on a stage that shows one node type.',
  },
  presetHighlightAttributeForType: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAttributeForType',
    defaultMessage: 'Attribute for {nodeType}',
    description:
      'Label of the picker for the true-or-false codebook attribute that one highlight of a narrative preset reads on nodes of one type, on a stage that shows several node types. nodeType is the name of the node type in the codebook, which is not translated.',
  },
  presetHighlightAttributeHintSeveral: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAttributeHintSeveral',
    defaultMessage:
      'Optional. Leave this empty if nodes of this type should not stand out for this highlight.',
    description:
      'Guidance under the picker for the attribute that one highlight of a narrative preset reads on nodes of one type, on a stage that shows several node types.',
  },
  presetHighlightAttributeRequired: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAttributeRequired',
    defaultMessage: 'Choose the attribute for this highlight.',
    description:
      'Shown under the attribute picker of one highlight in the dialog for one narrative preset, when the researcher saves the preset without choosing an attribute.',
  },
  presetHighlightAttributeRequiredSeveral: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAttributeRequiredSeveral',
    defaultMessage:
      'Choose an attribute for at least one node type, or remove this highlight.',
    description:
      'Shown under the first attribute picker of one highlight in the dialog for one narrative preset, on a stage that shows several node types, when the researcher saves the preset with no attribute chosen for that highlight.',
  },
  presetHighlightAttributeEmpty: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAttributeEmpty',
    defaultMessage:
      'This type has no boolean attributes, so there is nothing to highlight by.',
    description:
      'Shown in place of the attribute picker of one highlight in a narrative preset when the node type has no true-or-false attribute in the codebook. "This type" is that node type.',
  },
  presetHighlightAttributeClear: {
    id: 'protocolBuilder.networkCanvas.presetHighlightAttributeClear',
    defaultMessage: 'Do not highlight {nodeType}',
    description:
      'Button under the attribute picker of one highlight in a narrative preset, on a stage that shows several node types. It empties the picker, so nodes of that type do not stand out for this highlight. nodeType is the name of the node type in the codebook, which is not translated.',
  },
  presetGroupNeedsOneType: {
    id: 'protocolBuilder.networkCanvas.presetGroupNeedsOneType',
    defaultMessage:
      'Groups need one node type. This stage shows several node types, so its presets cannot group nodes.',
    description:
      'Shown in place of the grouping-attribute picker in the dialog for one narrative preset, when the stage shows more than one node type. Groups are outlines drawn around nodes that share a value of one attribute of one node type.',
  },
});
