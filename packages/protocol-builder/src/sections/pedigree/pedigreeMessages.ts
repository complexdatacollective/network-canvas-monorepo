import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Everything a Family Pedigree stage editor says.
 *
 * One file for the whole area rather than descriptors beside each section's
 * markup, because a good half of what this family says is rendered somewhere
 * ELSE — in `BuilderSection`'s confirmation, in `DialogArrayField`'s row
 * affordances, in the shared form-fields section, and in a field error that
 * travelled to the form's error region as an encoded string. A translator
 * reading this file sees the whole of a pedigree at once, including the parts
 * no pedigree component renders.
 *
 * The family-member form's own words are here for a second reason as well. The
 * shared section is worded for a form that stands on its own — "Form fields",
 * "the fields this form asks" — and this one is hung off the node
 * configuration of a stage the participant adds RELATIVES to. What is being
 * described is a person in a family, and the pedigree is the only thing that
 * knows that.
 *
 * Vocabulary a translator needs throughout: a STAGE is one step of an
 * interview; a PROMPT is a question the participant is asked; an ATTRIBUTE is
 * one field of the protocol's codebook that an answer is stored in; a SLOT is
 * one named attribute the pedigree interface itself writes, rather than one a
 * participant fills in.
 */
export const pedigreeMessages = defineMessages({
  nominationPromptsClearTitle: {
    id: 'protocolBuilder.pedigree.nominationPromptsClearTitle',
    defaultMessage: 'This will delete your nomination prompts',
    description:
      'Title of the confirmation shown before a researcher switches off a Family Pedigree’s nomination prompts. Switching them off discards them, which is why it is confirmed.',
  },
  nominationPromptsClearDescription: {
    id: 'protocolBuilder.pedigree.nominationPromptsClearDescription',
    defaultMessage:
      'Every prompt you have written here will be removed, and participants will no longer be asked to mark family members.',
    description:
      'Body of the confirmation shown before the nomination prompts are switched off, saying what is lost. A nomination prompt asks the participant to mark which family members share a condition or trait.',
  },
  nominationPromptsClearConfirm: {
    id: 'protocolBuilder.pedigree.nominationPromptsClearConfirm',
    defaultMessage: 'Delete the prompts',
    description:
      'Button that confirms switching off the nomination prompts and discarding them.',
  },
  nominationPromptNoun: {
    id: 'protocolBuilder.pedigree.nominationPromptNoun',
    defaultMessage: 'nomination prompt',
    description:
      'What one row of the nomination prompt list is called inside things said ABOUT it — "Edit nomination prompt", "Remove this nomination prompt?" — so it is lower case and singular. Qualified rather than plain "prompt" because a pedigree editor shows a census prompt beside it.',
  },
  memberFormClearTitle: {
    id: 'protocolBuilder.pedigree.memberFormClearTitle',
    defaultMessage: 'This will delete the family member form',
    description:
      'Title of the confirmation shown before a researcher switches off the form a Family Pedigree asks about each family member. Switching it off discards the form, which is why it is confirmed.',
  },
  memberFormClearDescription: {
    id: 'protocolBuilder.pedigree.memberFormClearDescription',
    defaultMessage:
      'Every field you have added to it will be removed, and participants will no longer be asked anything when they add a family member.',
    description:
      'Body of the confirmation shown before the family member form is switched off, saying what is lost. A field is one question the form asks.',
  },
  memberFormClearConfirm: {
    id: 'protocolBuilder.pedigree.memberFormClearConfirm',
    defaultMessage: 'Delete the form',
    description:
      'Button that confirms switching off the family member form and discarding it.',
  },
  memberFormTitle: {
    id: 'protocolBuilder.pedigree.memberFormTitle',
    defaultMessage: 'Family member form',
    description:
      'Heading of the section holding what a Family Pedigree asks about each person the participant adds. Replaces the shared form section’s generic heading, because this form describes a relative rather than standing on its own.',
  },
  memberFormDescription: {
    id: 'protocolBuilder.pedigree.memberFormDescription',
    defaultMessage:
      'Optionally ask the participant more about each family member as they add them.',
    description:
      'Description of the family member form section. Optional because a pedigree may ask nothing at all about each person.',
  },
  memberFormFieldLabel: {
    id: 'protocolBuilder.pedigree.memberFormFieldLabel',
    defaultMessage: 'Form fields',
    description:
      'Label of the ordered list of questions the family member form asks.',
  },
  memberFormFieldHint: {
    id: 'protocolBuilder.pedigree.memberFormFieldHint',
    defaultMessage:
      'The participant answers these when they add or edit a family member. Drag to reorder them.',
    description: 'Guidance under the list of family member form fields.',
  },
  memberFormAddLabel: {
    id: 'protocolBuilder.pedigree.memberFormAddLabel',
    defaultMessage: 'Create new form field',
    description:
      'Button that opens the dialog for adding one more question to the family member form. Whole rather than a generic "Add", because a stage editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  memberFormEmptyState: {
    id: 'protocolBuilder.pedigree.memberFormEmptyState',
    defaultMessage:
      'No form fields yet. Create one to ask something about each family member.',
    description:
      'Shown in place of the family member form’s field list while it asks nothing yet.',
  },

  // The language the pedigree talks about biological parents in.
  framingTitle: {
    id: 'protocolBuilder.pedigree.framingTitle',
    defaultMessage: 'Pedigree framing',
    description:
      'Heading of the section where a researcher chooses the vocabulary the pedigree uses when it asks a participant about biological parents.',
  },
  framingDescription: {
    id: 'protocolBuilder.pedigree.framingDescription',
    defaultMessage:
      'Choose fixed terminology or let each participant select their preferred framing.',
    description:
      'Description of the pedigree framing section. "Framing" is this interface’s name for one of two sets of words it can ask about parents with.',
  },
  framingIntro: {
    id: 'protocolBuilder.pedigree.framingIntro',
    defaultMessage:
      'The framing determines the language the interface uses when talking about biological parents:',
    description:
      'Sentence introducing the list of framings below it, so it ends in a colon. "The interface" is the pedigree screen the participant sees.',
  },
  framingGameteExplanation: {
    id: 'protocolBuilder.pedigree.framingGameteExplanation',
    defaultMessage:
      '<term>Gamete-based</term> — describes each parent by their reproductive contribution, using terms such as “egg parent” and “sperm parent” and questions such as “Who provided the egg?”. This framing works for all family structures, including donor conception, surrogacy, and same-sex parents.',
    description:
      'What the gamete-based framing does, in the list a researcher chooses a framing from. The <term> tag holds the framing’s own name and is drawn in bold; keep it around whatever names the framing in your language, and keep it matching the "Gamete-based" option label. The quoted phrases are examples of what a participant would read.',
  },
  framingGenderedExplanation: {
    id: 'protocolBuilder.pedigree.framingGenderedExplanation',
    defaultMessage:
      '<term>Gendered</term> — uses gendered kinship terms such as “mother” and “father” and questions such as “Who is the biological mother?”. This framing assumes that each child has a mother and a father.',
    description:
      'What the gendered framing does, in the list a researcher chooses a framing from. The <term> tag holds the framing’s own name and is drawn in bold; keep it matching the "Gendered" option label. The quoted phrases are examples of what a participant would read.',
  },
  framingSharedWording: {
    id: 'protocolBuilder.pedigree.framingSharedWording',
    defaultMessage:
      'Both framings use the same wording for gestational carriers and donors.',
    description:
      'Said under the two framing explanations, so a researcher knows the choice does not affect how the pedigree asks about a surrogate or a donor.',
  },
  framingModeLabel: {
    id: 'protocolBuilder.pedigree.framingModeLabel',
    defaultMessage: 'Framing mode',
    description:
      'Label of the control choosing whether the researcher fixes the framing or the participant picks it.',
  },
  framingModeFixed: {
    id: 'protocolBuilder.pedigree.framingModeFixed',
    defaultMessage: 'Fixed framing',
    description:
      'Option meaning the researcher chooses one framing and every participant gets it. Keyed by the schema value "fixed".',
  },
  framingModeParticipantChoice: {
    id: 'protocolBuilder.pedigree.framingModeParticipantChoice',
    defaultMessage: 'Let the participant choose',
    description:
      'Option meaning each participant picks their own framing during the interview. Keyed by the schema value "participantChoice".',
  },
  framingValueLabel: {
    id: 'protocolBuilder.pedigree.framingValueLabel',
    defaultMessage: 'Fixed framing terminology',
    description:
      'Label of the control naming which framing every participant gets. Shown only while the framing mode is fixed.',
  },
  framingGamete: {
    id: 'protocolBuilder.pedigree.framingGamete',
    defaultMessage: 'Gamete-based',
    description:
      'Name of the framing that describes parents by their reproductive contribution — the egg and the sperm — rather than by gender. Keyed by the schema value "gamete"; the participant-facing words this framing selects live in the interview runtime and are translated there.',
  },
  framingGendered: {
    id: 'protocolBuilder.pedigree.framingGendered',
    defaultMessage: 'Gendered',
    description:
      'Name of the framing that describes parents with gendered kinship terms — mother, father. Keyed by the schema value "gendered".',
  },

  // How far the family tree has to reach before a participant may finish.
  boundariesTitle: {
    id: 'protocolBuilder.pedigree.boundariesTitle',
    defaultMessage: 'Pedigree boundaries',
    description:
      'Heading of the section setting how far beyond their immediate family a participant has to record before the stage will let them finish.',
  },
  boundariesDescription: {
    id: 'protocolBuilder.pedigree.boundariesDescription',
    defaultMessage:
      "Set how far the pedigree must extend beyond the participant's immediate family.",
    description: 'Description of the pedigree boundaries section.',
  },
  boundariesEnforcementIntro: {
    id: 'protocolBuilder.pedigree.boundariesEnforcementIntro',
    defaultMessage:
      'Each boundary below can be set to one of three enforcement levels, which determine how the interview behaves when the condition is not yet met:',
    description:
      'Sentence introducing the list of enforcement levels below it, so it ends in a colon.',
  },
  boundariesOffExplanation: {
    id: 'protocolBuilder.pedigree.boundariesOffExplanation',
    defaultMessage:
      '<term>Off</term> — the condition is never checked, and participants are not asked to provide this information.',
    description:
      'What the "Off" enforcement level does. The <term> tag holds the level’s own name and is drawn in bold; keep it matching the "Off" option label below.',
  },
  boundariesRecommendedExplanation: {
    id: 'protocolBuilder.pedigree.boundariesRecommendedExplanation',
    defaultMessage:
      '<term>Recommended</term> — participants see a reminder in the completion checklist, but can finish the stage without satisfying the condition.',
    description:
      'What the "Recommended" enforcement level does. The <term> tag holds the level’s own name and is drawn in bold; keep it matching the "Recommended" option label. The completion checklist is a list the participant sees on the pedigree screen.',
  },
  boundariesRequiredExplanation: {
    id: 'protocolBuilder.pedigree.boundariesRequiredExplanation',
    defaultMessage:
      '<term>Required</term> — participants cannot finish the stage until the condition is satisfied.',
    description:
      'What the "Required" enforcement level does. The <term> tag holds the level’s own name and is drawn in bold; keep it matching the "Required" option label.',
  },
  boundariesLevelRequired: {
    id: 'protocolBuilder.pedigree.boundariesLevelRequired',
    defaultMessage: 'Required',
    description:
      'Enforcement level meaning the participant cannot finish the stage until the boundary is met. Keyed by the schema value "required".',
  },
  boundariesLevelRecommended: {
    id: 'protocolBuilder.pedigree.boundariesLevelRecommended',
    defaultMessage: 'Recommended',
    description:
      'Enforcement level meaning the participant is reminded but may finish anyway. Keyed by the schema value "recommended".',
  },
  boundariesLevelOff: {
    id: 'protocolBuilder.pedigree.boundariesLevelOff',
    defaultMessage: 'Off',
    description:
      'Enforcement level meaning the boundary is never checked. Keyed by the schema value "off".',
  },
  boundariesSelectPlaceholder: {
    id: 'protocolBuilder.pedigree.boundariesSelectPlaceholder',
    defaultMessage: 'Select an option',
    description:
      'Shown in an enforcement-level control while the researcher has chosen no level yet.',
  },
  boundariesGrandparentsLabel: {
    id: 'protocolBuilder.pedigree.boundariesGrandparentsLabel',
    defaultMessage: 'Grandparent requirement',
    description:
      'Label of the control setting how strictly the pedigree asks for the participant’s grandparents.',
  },
  boundariesGrandparentsHint: {
    id: 'protocolBuilder.pedigree.boundariesGrandparentsHint',
    defaultMessage:
      "Asks the participant to record two parents for each of their own parents, so that all of the participant's grandparents appear in the family pedigree.",
    description: 'Guidance under the grandparent requirement control.',
  },
  boundariesChildrenContributorsLabel: {
    id: 'protocolBuilder.pedigree.boundariesChildrenContributorsLabel',
    defaultMessage: 'Co-parent family requirement',
    description:
      'Label of the control setting how strictly the pedigree asks about the families of the people the participant had children with.',
  },
  boundariesChildrenContributorsHint: {
    id: 'protocolBuilder.pedigree.boundariesChildrenContributorsHint',
    defaultMessage:
      "For each of the participant's children, asks that the child's other genetic parent has their own parents and grandparents recorded, extending the family pedigree to that side of the family. Participants without children can affirm this instead.",
    description:
      'Guidance under the co-parent family requirement control. "Affirm this instead" means a participant with no children confirms that fact rather than recording anybody.',
  },

  // The one question asked while the participant builds their family.
  censusTitle: {
    id: 'protocolBuilder.pedigree.censusTitle',
    defaultMessage: 'Family-building prompt',
    description:
      'Heading of the section holding the single question shown while a participant is drawing their family.',
  },
  censusDescription: {
    id: 'protocolBuilder.pedigree.censusDescription',
    defaultMessage:
      'Write the question the participant answers while they build their family.',
    description: 'Description of the family-building prompt section.',
  },
  censusFieldLabel: {
    id: 'protocolBuilder.pedigree.censusFieldLabel',
    defaultMessage: 'Census prompt',
    description:
      'Label of the field holding the question. "Census" is this interface’s name for the phase in which the participant lists everyone in their family.',
  },
  censusFieldHint: {
    id: 'protocolBuilder.pedigree.censusFieldHint',
    defaultMessage:
      'Shown throughout the family-building phase, so it should describe the whole task rather than one step of it.',
    description: 'Guidance under the census prompt field.',
  },
  censusPlaceholder: {
    id: 'protocolBuilder.pedigree.censusPlaceholder',
    defaultMessage: 'Enter your prompt...',
    description:
      'Placeholder shown in the empty census prompt field. The trailing dots are an ellipsis written as three full stops.',
  },

  // The node type the pedigree draws people as, and what it writes on them.
  nodeTitle: {
    id: 'protocolBuilder.pedigree.nodeTitle',
    defaultMessage: 'Family member data',
    description:
      'Heading of the section binding the node type and the attributes the pedigree stores each family member’s details in.',
  },
  nodeDescription: {
    id: 'protocolBuilder.pedigree.nodeDescription',
    defaultMessage:
      'Choose the node type and map the attributes used to represent family members.',
    description:
      'Description of the family member data section. "Map" here means point each of the interface’s slots at one attribute of the codebook.',
  },
  nodeTypeLabel: {
    id: 'protocolBuilder.pedigree.nodeTypeLabel',
    defaultMessage: 'Node type',
    description:
      'Label of the control choosing which node type of the codebook a family member is.',
  },
  nodeTypeHint: {
    id: 'protocolBuilder.pedigree.nodeTypeHint',
    defaultMessage:
      'Every family member the participant adds will be a node of this type.',
    description: 'Guidance under the pedigree’s node type control.',
  },
  dependentStagesTitle: {
    id: 'protocolBuilder.pedigree.dependentStagesTitle',
    defaultMessage: 'Other stages read this pedigree',
    description:
      'Title of the warning shown above the node type control when other stages of the same protocol draw their network from this pedigree.',
  },
  dependentStagesDescription: {
    id: 'protocolBuilder.pedigree.dependentStagesDescription',
    defaultMessage:
      "These stages visualize this pedigree's network and map their own attributes onto its node type: {stageNames}. Changing the node type here will leave them pointing at attributes the new type does not have.",
    description:
      'Body of the warning about other stages that read this pedigree. stageNames is the list of those stages’ names, each in quotation marks, already joined into one phrase in the reader’s language.',
  },
  slotEmptyState: {
    id: 'protocolBuilder.pedigree.slotEmptyState',
    defaultMessage:
      'No attributes of this type can be used here yet. Create one to continue.',
    description:
      'Shown in place of a pedigree slot’s attribute list when the codebook offers nothing this slot can take — usually because every candidate is already written by something else. "Of this type" means of the attribute type the slot needs, such as text or boolean.',
  },
  nodeLabelLabel: {
    id: 'protocolBuilder.pedigree.nodeLabelLabel',
    defaultMessage: 'Display label',
    description:
      'Label of the control binding the attribute that holds the name shown on each person drawn in the family tree.',
  },
  nodeLabelHint: {
    id: 'protocolBuilder.pedigree.nodeLabelHint',
    defaultMessage:
      'A text attribute holding the name shown on each family member other than the participant, who is drawn without one.',
    description: 'Guidance under the display label control.',
  },
  nodeLabelCreateLabel: {
    id: 'protocolBuilder.pedigree.nodeLabelCreateLabel',
    defaultMessage: 'Create a new display label attribute',
    description:
      'Button that opens a dialog for adding the display label attribute to the codebook. Whole rather than a generic "Create", because a pedigree editor shows several of these at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  nodeLabelCreateDescription: {
    id: 'protocolBuilder.pedigree.nodeLabelCreateDescription',
    defaultMessage: 'Create a text attribute for family member names',
    description:
      'Said inside the dialog for creating the display label attribute, so the researcher knows what the attribute they are naming is for.',
  },
  nodeEgoLabel: {
    id: 'protocolBuilder.pedigree.nodeEgoLabel',
    defaultMessage: 'Participant identifier',
    description:
      'Label of the control binding the attribute that marks which person in the family tree is the participant themselves.',
  },
  nodeEgoHint: {
    id: 'protocolBuilder.pedigree.nodeEgoHint',
    defaultMessage:
      'A boolean attribute marking which node is the participant. Every completeness check keys off it, so nothing else may write it.',
    description:
      'Guidance under the participant identifier control. A completeness check is one of the boundary rules that decide whether the participant may finish the stage.',
  },
  nodeEgoCreateLabel: {
    id: 'protocolBuilder.pedigree.nodeEgoCreateLabel',
    defaultMessage: 'Create a new participant identifier attribute',
    description:
      'Button that opens a dialog for adding the participant identifier attribute to the codebook.',
  },
  nodeEgoCreateDescription: {
    id: 'protocolBuilder.pedigree.nodeEgoCreateDescription',
    defaultMessage: 'Create a boolean attribute marking the participant',
    description:
      'Said inside the dialog for creating the participant identifier attribute.',
  },
  nodeRelationshipLabel: {
    id: 'protocolBuilder.pedigree.nodeRelationshipLabel',
    defaultMessage: 'Relationship to participant',
    description:
      'Label of the control binding the attribute that holds how each person is related to the participant.',
  },
  nodeRelationshipHint: {
    id: 'protocolBuilder.pedigree.nodeRelationshipHint',
    defaultMessage:
      "A text attribute holding each person's relationship to the participant, such as mother, uncle, or daughter. The pedigree works this out from the family tree.",
    description:
      'Guidance under the relationship-to-participant control. The three examples are kinship terms and should be replaced with natural ones in your language.',
  },
  nodeRelationshipCreateLabel: {
    id: 'protocolBuilder.pedigree.nodeRelationshipCreateLabel',
    defaultMessage: 'Create a new relationship attribute',
    description:
      'Button that opens a dialog for adding the relationship-to-participant attribute to the codebook.',
  },
  nodeRelationshipCreateDescription: {
    id: 'protocolBuilder.pedigree.nodeRelationshipCreateDescription',
    defaultMessage:
      'Create a text attribute for each relationship to the participant',
    description:
      'Said inside the dialog for creating the relationship-to-participant attribute.',
  },
  nodeBiologicalSexLabel: {
    id: 'protocolBuilder.pedigree.nodeBiologicalSexLabel',
    defaultMessage: 'Biological sex',
    description:
      'Label of the control binding the attribute that holds each family member’s sex recorded at birth.',
  },
  nodeBiologicalSexHint: {
    id: 'protocolBuilder.pedigree.nodeBiologicalSexHint',
    defaultMessage:
      "A categorical attribute holding each family member's sex recorded at birth, which the pedigree traces sex-linked inheritance through. Its values are fixed by the interface.",
    description:
      'Guidance under the biological sex control. "Its values are fixed by the interface" means the researcher may not edit the list of answers this attribute offers, because the genetics engine branches on those exact values.',
  },
  nodeBiologicalSexCreateLabel: {
    id: 'protocolBuilder.pedigree.nodeBiologicalSexCreateLabel',
    defaultMessage: 'Create a new biological sex attribute',
    description:
      'Button that opens a dialog for adding the biological sex attribute to the codebook.',
  },
  nodeBiologicalSexCreateDescription: {
    id: 'protocolBuilder.pedigree.nodeBiologicalSexCreateDescription',
    defaultMessage:
      'Create the categorical attribute the pedigree records sex in',
    description:
      'Said inside the dialog for creating the biological sex attribute. "The" rather than "a", because only one value set is allowed and the dialog seeds it.',
  },

  // The edge type the pedigree records relationships as.
  edgeTitle: {
    id: 'protocolBuilder.pedigree.edgeTitle',
    defaultMessage: 'Relationship data',
    description:
      'Heading of the section binding the edge type and the attributes the pedigree stores each family relationship’s details in.',
  },
  edgeDescription: {
    id: 'protocolBuilder.pedigree.edgeDescription',
    defaultMessage:
      'Choose the edge type and map the attributes used to store family relationships.',
    description: 'Description of the relationship data section.',
  },
  edgeTypeLabel: {
    id: 'protocolBuilder.pedigree.edgeTypeLabel',
    defaultMessage: 'Edge type',
    description:
      'Label of the control choosing which edge type of the codebook a family relationship is.',
  },
  edgeTypeHint: {
    id: 'protocolBuilder.pedigree.edgeTypeHint',
    defaultMessage:
      'Every relationship the pedigree records — parents, partners and donors alike — is an edge of this one type.',
    description: 'Guidance under the pedigree’s edge type control.',
  },
  edgeRelationshipTypeLabel: {
    id: 'protocolBuilder.pedigree.edgeRelationshipTypeLabel',
    defaultMessage: 'Relationship type',
    description:
      'Label of the control binding the attribute that holds what kind of relationship each edge is.',
  },
  edgeRelationshipTypeHint: {
    id: 'protocolBuilder.pedigree.edgeRelationshipTypeHint',
    defaultMessage:
      'A categorical attribute holding what kind of relationship each edge is — biological, social, donor, surrogate, adoptive or partner. Its values are fixed by the interface.',
    description:
      'Guidance under the relationship type control. The six words are the kinds of relationship a pedigree can record. "Its values are fixed by the interface" means the researcher may not edit the answers this attribute offers.',
  },
  edgeRelationshipTypeCreateLabel: {
    id: 'protocolBuilder.pedigree.edgeRelationshipTypeCreateLabel',
    defaultMessage: 'Create a new relationship type attribute',
    description:
      'Button that opens a dialog for adding the relationship type attribute to the codebook.',
  },
  edgeRelationshipTypeCreateDescription: {
    id: 'protocolBuilder.pedigree.edgeRelationshipTypeCreateDescription',
    defaultMessage:
      'Create the categorical attribute the pedigree records relationship kinds in',
    description:
      'Said inside the dialog for creating the relationship type attribute. "The" rather than "a", because only one value set is allowed and the dialog seeds it.',
  },
  edgeIsActiveLabel: {
    id: 'protocolBuilder.pedigree.edgeIsActiveLabel',
    defaultMessage: 'Active status',
    description:
      'Label of the control binding the attribute that records whether a relationship is a current one.',
  },
  edgeIsActiveHint: {
    id: 'protocolBuilder.pedigree.edgeIsActiveHint',
    defaultMessage:
      'A boolean attribute recording whether the relationship is a current one.',
    description: 'Guidance under the active status control.',
  },
  edgeIsActiveCreateLabel: {
    id: 'protocolBuilder.pedigree.edgeIsActiveCreateLabel',
    defaultMessage: 'Create a new active status attribute',
    description:
      'Button that opens a dialog for adding the active status attribute to the codebook.',
  },
  edgeIsActiveCreateDescription: {
    id: 'protocolBuilder.pedigree.edgeIsActiveCreateDescription',
    defaultMessage:
      'Create a boolean attribute recording whether a relationship is current',
    description:
      'Said inside the dialog for creating the active status attribute.',
  },
  edgeGestationalCarrierLabel: {
    id: 'protocolBuilder.pedigree.edgeGestationalCarrierLabel',
    defaultMessage: 'Gestational carrier',
    description:
      'Label of the control binding the attribute that records who carried each pregnancy. A gestational carrier is the person who was pregnant, who may not be a genetic parent.',
  },
  edgeGestationalCarrierHint: {
    id: 'protocolBuilder.pedigree.edgeGestationalCarrierHint',
    defaultMessage:
      'A boolean attribute recording who carried each pregnancy. It is only written on parent relationships.',
    description: 'Guidance under the gestational carrier control.',
  },
  edgeGestationalCarrierCreateLabel: {
    id: 'protocolBuilder.pedigree.edgeGestationalCarrierCreateLabel',
    defaultMessage: 'Create a new gestational carrier attribute',
    description:
      'Button that opens a dialog for adding the gestational carrier attribute to the codebook.',
  },
  edgeGestationalCarrierCreateDescription: {
    id: 'protocolBuilder.pedigree.edgeGestationalCarrierCreateDescription',
    defaultMessage:
      'Create a boolean attribute recording who carried each pregnancy',
    description:
      'Said inside the dialog for creating the gestational carrier attribute.',
  },
  edgeGameteRoleLabel: {
    id: 'protocolBuilder.pedigree.edgeGameteRoleLabel',
    defaultMessage: 'Gamete role',
    description:
      'Label of the control binding the attribute that records which reproductive cell a parent contributed — the egg or the sperm.',
  },
  edgeGameteRoleHint: {
    id: 'protocolBuilder.pedigree.edgeGameteRoleHint',
    defaultMessage:
      'A categorical attribute recording whether a parent contributed the egg or the sperm, which the pedigree traces biological inheritance through. Its values are fixed by the interface.',
    description:
      'Guidance under the gamete role control. "Its values are fixed by the interface" means the researcher may not edit the answers this attribute offers.',
  },
  edgeGameteRoleCreateLabel: {
    id: 'protocolBuilder.pedigree.edgeGameteRoleCreateLabel',
    defaultMessage: 'Create a new gamete role attribute',
    description:
      'Button that opens a dialog for adding the gamete role attribute to the codebook.',
  },
  edgeGameteRoleCreateDescription: {
    id: 'protocolBuilder.pedigree.edgeGameteRoleCreateDescription',
    defaultMessage:
      'Create the categorical attribute the pedigree records gamete roles in',
    description:
      'Said inside the dialog for creating the gamete role attribute. "The" rather than "a", because only one value set is allowed and the dialog seeds it.',
  },

  // The optional questions asked about every family member at once.
  nominationTitle: {
    id: 'protocolBuilder.pedigree.nominationTitle',
    defaultMessage: 'Nomination prompts',
    description:
      'Heading of the optional section holding questions the participant answers about the whole family at once, by marking the members each one applies to.',
  },
  nominationDescription: {
    id: 'protocolBuilder.pedigree.nominationDescription',
    defaultMessage:
      'Optionally ask the participant to mark family members who share a condition or trait.',
    description:
      'Description of the nomination prompts section. Optional because a pedigree that only draws the family is a complete pedigree.',
  },
  nominationWaitingDescription: {
    id: 'protocolBuilder.pedigree.nominationWaitingDescription',
    defaultMessage:
      'Choose a node type before writing this pedigree’s nomination prompts.',
    description:
      'Shown in place of the nomination prompts section’s description while the researcher has not yet chosen the node type, so there is no attribute for a prompt to record its answer in.',
  },
  nominationFieldLabel: {
    id: 'protocolBuilder.pedigree.nominationFieldLabel',
    defaultMessage: 'Nomination prompts',
    description:
      'Label of the list of nomination prompts. The same words as the section heading, and translated once for each: the heading names the part of the stage, and this names the control.',
  },
  nominationFieldHint: {
    id: 'protocolBuilder.pedigree.nominationFieldHint',
    defaultMessage:
      'The participant answers each of these across the whole family, in this order. Drag to reorder them.',
    description: 'Guidance under the list of nomination prompts.',
  },
  nominationAddLabel: {
    id: 'protocolBuilder.pedigree.nominationAddLabel',
    defaultMessage: 'Create new nomination prompt',
    description:
      'Button that opens the dialog for writing one more nomination prompt. Whole rather than a generic "Add", because a pedigree editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  nominationAddTitle: {
    id: 'protocolBuilder.pedigree.nominationAddTitle',
    defaultMessage: 'Create nomination prompt',
    description:
      'Title of the dialog a researcher fills in to write one more nomination prompt.',
  },
  nominationEditTitle: {
    id: 'protocolBuilder.pedigree.nominationEditTitle',
    defaultMessage: 'Edit nomination prompt',
    description:
      'Title of the dialog a researcher fills in to change a nomination prompt they have already written.',
  },
  nominationEmptyState: {
    id: 'protocolBuilder.pedigree.nominationEmptyState',
    defaultMessage:
      'No nomination prompts yet. Create one to ask the participant to mark family members.',
    description:
      'Shown in place of the nomination prompt list while the section is switched on but holds nothing.',
  },
  nominationAtLeastOne: {
    id: 'protocolBuilder.pedigree.nominationAtLeastOne',
    defaultMessage:
      'Add at least one nomination prompt, or switch this section off.',
    description:
      'Refusal shown above the nomination prompt list when a researcher saves a pedigree whose nomination section is switched on and empty. Switching the section off is the other way out, and is offered beside the list.',
  },
  nominationTextLabel: {
    id: 'protocolBuilder.pedigree.nominationTextLabel',
    defaultMessage: 'Prompt text',
    description:
      'Label of the field holding the question one nomination prompt asks.',
  },
  nominationTextHint: {
    id: 'protocolBuilder.pedigree.nominationTextHint',
    defaultMessage:
      'The question the participant answers for each family member.',
    description: 'Guidance under a nomination prompt’s question field.',
  },
  nominationTextPlaceholder: {
    id: 'protocolBuilder.pedigree.nominationTextPlaceholder',
    defaultMessage: 'Enter your prompt...',
    description:
      'Placeholder shown in a nomination prompt’s empty question field. The trailing dots are an ellipsis written as three full stops.',
  },
  nominationTextRequired: {
    id: 'protocolBuilder.pedigree.nominationTextRequired',
    defaultMessage: 'Enter the question this prompt asks.',
    description:
      'Refusal shown under a nomination prompt’s question field when the researcher saves the row without writing one.',
  },
  nominationVariableLabel: {
    id: 'protocolBuilder.pedigree.nominationVariableLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the control choosing which codebook attribute one nomination prompt’s answers are stored in.',
  },
  nominationVariableHint: {
    id: 'protocolBuilder.pedigree.nominationVariableHint',
    defaultMessage: 'The boolean attribute each answer is recorded in.',
    description:
      'Guidance under a nomination prompt’s attribute control. Boolean because the participant either marks a family member or does not.',
  },
  nominationVariableEmpty: {
    id: 'protocolBuilder.pedigree.nominationVariableEmpty',
    defaultMessage:
      'No boolean attributes of this node type can be nominated yet. Create one to continue.',
    description:
      'Shown in place of a nomination prompt’s attribute list when every boolean attribute of the node type is already written by something else.',
  },
  nominationVariableRequired: {
    id: 'protocolBuilder.pedigree.nominationVariableRequired',
    defaultMessage: 'Choose the attribute this prompt records.',
    description:
      'Refusal shown under a nomination prompt’s attribute control when the researcher saves the row without choosing one.',
  },
  nominationCreateLabel: {
    id: 'protocolBuilder.pedigree.nominationCreateLabel',
    defaultMessage: 'Create a new nomination attribute',
    description:
      'Button that opens a dialog for adding the attribute this nomination prompt will record its answers in to the codebook.',
  },
  nominationCreateDescription: {
    id: 'protocolBuilder.pedigree.nominationCreateDescription',
    defaultMessage: 'Create a boolean attribute for this nomination prompt',
    description:
      'Said inside the dialog for creating a nomination prompt’s attribute.',
  },
  nominationPreviewEmptyText: {
    id: 'protocolBuilder.pedigree.nominationPreviewEmptyText',
    defaultMessage: 'Empty prompt',
    description:
      'Stands in for a nomination prompt’s question in the list while the researcher has written none.',
  },
  nominationPreviewRecords: {
    id: 'protocolBuilder.pedigree.nominationPreviewRecords',
    defaultMessage: 'Records the boolean attribute "{attributeName}"',
    description:
      'Shown on one closed nomination prompt row, saying where its answers go. attributeName is the codebook name the researcher gave that attribute, which is not translated.',
  },

  // Refusals a pedigree slot earns, encoded and read back where they render.
  slotUnvalidatedElsewhereRefusal: {
    id: 'protocolBuilder.pedigree.slotUnvalidatedElsewhereRefusal',
    defaultMessage:
      '"{attributeName}" is written without validation by another stage, so it cannot also be collected here (the values that stage writes bypass this attribute’s validation)',
    description:
      'Refusal shown under a pedigree slot that collects an answer — the display label — when the attribute picked is already written directly by another stage of the protocol, which would let unchecked values in under the same name. attributeName is the codebook name of the attribute, which is not translated.',
  },
  slotDraftFormCollectsRefusal: {
    id: 'protocolBuilder.pedigree.slotDraftFormCollectsRefusal',
    defaultMessage:
      '"{attributeName}" is collected by this stage’s own form, so it cannot also be written by this slot (values written here would bypass its validation)',
    description:
      'Refusal shown under a pedigree slot the interface writes directly, when the attribute picked is already collected by the family member form one section above — so both are on the screen the researcher is looking at, and the wording must not send them searching their other stages. attributeName is the codebook name of the attribute, which is not translated.',
  },
  slotDraftSlotDerivesRefusal: {
    id: 'protocolBuilder.pedigree.slotDraftSlotDerivesRefusal',
    defaultMessage:
      '"{attributeName}" is written without validation by another slot in this stage, so it cannot also be collected here (the values that slot writes bypass this attribute’s validation)',
    description:
      'Refusal shown under the display label — the one pedigree slot whose value is collected through a form field — when the attribute picked is already written directly by another slot of the same stage. Deliberately says "slot" rather than "form field": told it cannot be used as a form field, a researcher goes looking for a form field they never added. attributeName is the codebook name of the attribute, which is not translated.',
  },
});
