import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The Family Pedigree stage editor's own words.
 *
 * In the interview, the participant selects a person on a canvas and adds
 * their parent, sibling, partner or child, describing each new person in a
 * side panel. These messages describe that interface to the researcher
 * configuring it.
 */
export const familyPedigreeMessages = defineMessages({
  personAttributesTitle: {
    id: 'protocolBuilder.pedigree.personAttributesTitle',
    defaultMessage: 'Person attributes',
    description:
      'Heading of the section where a researcher chooses the codebook attributes a Family Pedigree records about every family member the participant adds.',
  },
  personAttributesDescription: {
    id: 'protocolBuilder.pedigree.personAttributesDescription',
    defaultMessage:
      'Choose where the interface records what it asks about every family member. Pick an existing attribute, or create a new one from the picker.',
    description:
      'Description of the person attributes section. An attribute is a codebook variable.',
  },
  personAttributesWaiting: {
    id: 'protocolBuilder.pedigree.personAttributesWaiting',
    defaultMessage: 'Choose the node type before choosing its attributes.',
    description:
      'Shown in place of the person attributes section’s description while no node type has been chosen for the stage.',
  },
  nameLabel: {
    id: 'protocolBuilder.pedigree.nameLabel',
    defaultMessage: 'Name',
    description:
      'Label of the control choosing the text attribute that holds each family member’s name.',
  },
  nameHint: {
    id: 'protocolBuilder.pedigree.nameHint',
    defaultMessage:
      'A text attribute holding each person’s name, shown beneath their symbol on the pedigree.',
    description: 'Guidance under the name attribute control.',
  },
  nameCreateLabel: {
    id: 'protocolBuilder.pedigree.nameCreateLabel',
    defaultMessage: 'Create a new name attribute',
    description:
      'Title of the dialog that creates a new text attribute for family members’ names.',
  },
  genderIdentityLabel: {
    id: 'protocolBuilder.pedigree.genderIdentityLabel',
    defaultMessage: 'Gender identity',
    description:
      'Label of the control choosing the categorical attribute that holds each family member’s gender identity.',
  },
  genderIdentityHint: {
    id: 'protocolBuilder.pedigree.genderIdentityHint',
    defaultMessage:
      'Decides the symbol each person is drawn with. The interface sets the options this attribute offers, and they cannot be changed.',
    description:
      'Guidance under the gender identity attribute control. The options are a fixed list the interface owns.',
  },
  genderIdentityCreateLabel: {
    id: 'protocolBuilder.pedigree.genderIdentityCreateLabel',
    defaultMessage: 'Create a new gender identity attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for gender identity, seeded with the fixed options the interface owns.',
  },
  sexAssignedAtBirthLabel: {
    id: 'protocolBuilder.pedigree.sexAssignedAtBirthLabel',
    defaultMessage: 'Sex assigned at birth',
    description:
      'Label of the control choosing the categorical attribute that holds each family member’s sex assigned at birth.',
  },
  sexAssignedAtBirthHint: {
    id: 'protocolBuilder.pedigree.sexAssignedAtBirthHint',
    defaultMessage:
      'Shown beneath each person’s symbol. The interface sets the options this attribute offers, and they cannot be changed.',
    description:
      'Guidance under the sex assigned at birth attribute control. The options are a fixed list the interface owns.',
  },
  sexAssignedAtBirthCreateLabel: {
    id: 'protocolBuilder.pedigree.sexAssignedAtBirthCreateLabel',
    defaultMessage: 'Create a new sex assigned at birth attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for sex assigned at birth, seeded with the fixed options the interface owns.',
  },
  egoLabel: {
    id: 'protocolBuilder.pedigree.egoLabel',
    defaultMessage: 'Participant marker',
    description:
      'Label of the control choosing the true/false attribute that marks which family member is the participant.',
  },
  egoHint: {
    id: 'protocolBuilder.pedigree.egoHint',
    defaultMessage:
      'A true/false attribute the interface sets on the participant. Nothing else in the protocol may write it.',
    description: 'Guidance under the participant marker attribute control.',
  },
  egoCreateLabel: {
    id: 'protocolBuilder.pedigree.egoCreateLabel',
    defaultMessage: 'Create a new participant marker attribute',
    description:
      'Title of the dialog that creates a new true/false attribute marking the participant.',
  },

  relationshipsTitle: {
    id: 'protocolBuilder.pedigree.relationshipsTitle',
    defaultMessage: 'Relationships',
    description:
      'Heading of the section where a researcher chooses how a Family Pedigree records the relationships between family members.',
  },
  relationshipsDescription: {
    id: 'protocolBuilder.pedigree.relationshipsDescription',
    defaultMessage:
      'Choose the edge type family relationships are recorded as, and the attributes the interface writes on each one. Siblings are not recorded directly: two people are siblings when they share a parent.',
    description:
      'Description of the relationships section. An edge is a connection between two members of the network.',
  },
  relationshipTypeLabel: {
    id: 'protocolBuilder.pedigree.relationshipTypeLabel',
    defaultMessage: 'Relationship edge type',
    description:
      'Label of the control choosing which kind of connection family relationships are recorded as.',
  },
  relationshipTypeHint: {
    id: 'protocolBuilder.pedigree.relationshipTypeHint',
    defaultMessage:
      'Every partnership and parent–child relationship the participant draws is recorded as an edge of this type.',
    description: 'Guidance under the relationship edge type control.',
  },
  kindLabel: {
    id: 'protocolBuilder.pedigree.kindLabel',
    defaultMessage: 'Relationship kind',
    description:
      'Label of the control choosing the categorical attribute that records what kind of relationship each edge is: a partnership, or a kind of parenthood.',
  },
  kindHint: {
    id: 'protocolBuilder.pedigree.kindHint',
    defaultMessage:
      'Records whether a relationship is a partnership or which kind of parent one person is to the other. The interface sets the options this attribute offers, and nothing else in the protocol may write it.',
    description:
      'Guidance under the relationship kind attribute control. The options are a fixed list the interface owns.',
  },
  kindCreateLabel: {
    id: 'protocolBuilder.pedigree.kindCreateLabel',
    defaultMessage: 'Create a new relationship kind attribute',
    description:
      'Title of the dialog that creates a new categorical attribute for relationship kinds, seeded with the fixed options the interface owns.',
  },
  gestationalCarrierLabel: {
    id: 'protocolBuilder.pedigree.gestationalCarrierLabel',
    defaultMessage: 'Gestational carrier',
    description:
      'Label of the control choosing the true/false attribute that marks the parent who carried a pregnancy.',
  },
  gestationalCarrierHint: {
    id: 'protocolBuilder.pedigree.gestationalCarrierHint',
    defaultMessage:
      'A true/false attribute set on a parent relationship when that parent carried the pregnancy. Nothing else in the protocol may write it.',
    description: 'Guidance under the gestational carrier attribute control.',
  },
  gestationalCarrierCreateLabel: {
    id: 'protocolBuilder.pedigree.gestationalCarrierCreateLabel',
    defaultMessage: 'Create a new gestational carrier attribute',
    description:
      'Title of the dialog that creates a new true/false attribute marking the parent who carried a pregnancy.',
  },
  currentPartnerLabel: {
    id: 'protocolBuilder.pedigree.currentPartnerLabel',
    defaultMessage: 'Current partner',
    description:
      'Label of the control choosing the true/false attribute that marks a partnership as current.',
  },
  currentPartnerHint: {
    id: 'protocolBuilder.pedigree.currentPartnerHint',
    defaultMessage:
      'A true/false attribute set on a partner relationship when the partnership is current. Nothing else in the protocol may write it.',
    description: 'Guidance under the current partner attribute control.',
  },
  currentPartnerCreateLabel: {
    id: 'protocolBuilder.pedigree.currentPartnerCreateLabel',
    defaultMessage: 'Create a new current partner attribute',
    description:
      'Title of the dialog that creates a new true/false attribute marking a current partnership.',
  },
  relationshipTypeChangeTitle: {
    id: 'protocolBuilder.pedigree.relationshipTypeChangeTitle',
    defaultMessage: 'Change the relationship edge type?',
    description:
      'Title of the confirmation shown before a researcher changes the edge type a Family Pedigree records relationships as, when relationship attributes are already chosen.',
  },
  relationshipTypeChangeDescription: {
    id: 'protocolBuilder.pedigree.relationshipTypeChangeDescription',
    defaultMessage:
      'The relationship kind, gestational carrier and current partner attributes belong to the current edge type, so changing it removes them.',
    description:
      'Body of the confirmation shown before a Family Pedigree’s relationship edge type changes, saying what the change discards.',
  },
  relationshipTypeChangeConfirm: {
    id: 'protocolBuilder.pedigree.relationshipTypeChangeConfirm',
    defaultMessage: 'Change the edge type',
    description:
      'Button that confirms changing a Family Pedigree’s relationship edge type and discarding the attributes chosen for the previous one.',
  },

  promptTitle: {
    id: 'protocolBuilder.pedigree.promptTitle',
    defaultMessage: 'Prompt',
    description:
      'Heading of the section holding the instruction a Family Pedigree shows the participant while they draw their family.',
  },
  promptLabel: {
    id: 'protocolBuilder.pedigree.promptLabel',
    defaultMessage: 'Prompt text',
    description:
      'Label of the field holding the instruction shown to the participant on the pedigree canvas.',
  },
  promptHint: {
    id: 'protocolBuilder.pedigree.promptHint',
    defaultMessage:
      'Shown to the participant above the canvas for the whole stage. Tell them how to add their relatives.',
    description: 'Guidance under the pedigree prompt field.',
  },
  promptPlaceholder: {
    id: 'protocolBuilder.pedigree.promptPlaceholder',
    defaultMessage:
      'Add the members of your family. Select a person to add their relatives.',
    description:
      'Example shown inside the empty pedigree prompt field. Written as it would read to a participant.',
  },

  personFormTitle: {
    id: 'protocolBuilder.pedigree.personFormTitle',
    defaultMessage: 'Additional person fields',
    description:
      'Heading of the section holding the extra questions a Family Pedigree asks about each family member, after its own questions.',
  },
  personFormDescription: {
    id: 'protocolBuilder.pedigree.personFormDescription',
    defaultMessage:
      'Optionally ask more about each family member. These fields are shown in the side panel after the name, gender identity and sex assigned at birth.',
    description:
      'Description of the additional person fields section. The side panel is where the participant describes each person they add.',
  },
  personFormFieldLabel: {
    id: 'protocolBuilder.pedigree.personFormFieldLabel',
    defaultMessage: 'Form fields',
    description:
      'Label of the ordered list of extra questions asked about each family member.',
  },
  personFormAddLabel: {
    id: 'protocolBuilder.pedigree.personFormAddLabel',
    defaultMessage: 'Create new person field',
    description:
      'Button that opens the dialog for adding one more question about each family member.',
  },
  personFormEmptyState: {
    id: 'protocolBuilder.pedigree.personFormEmptyState',
    defaultMessage:
      'No fields yet. Create one to ask something more about each family member.',
    description:
      'Shown in place of the additional person fields list while it asks nothing yet.',
  },
  personFormClearTitle: {
    id: 'protocolBuilder.pedigree.personFormClearTitle',
    defaultMessage: 'Remove the additional person fields?',
    description:
      'Title of the confirmation shown before a researcher switches off the extra questions a Family Pedigree asks about each family member.',
  },
  personFormClearDescription: {
    id: 'protocolBuilder.pedigree.personFormClearDescription',
    defaultMessage:
      'Every field you have added will be removed, and participants will only be asked the interface’s own questions about each family member.',
    description:
      'Body of the confirmation shown before the additional person fields are switched off, saying what is lost.',
  },
  personFormClearConfirm: {
    id: 'protocolBuilder.pedigree.personFormClearConfirm',
    defaultMessage: 'Remove the fields',
    description:
      'Button that confirms switching off the additional person fields and discarding them.',
  },
  personFormReservedRefusal: {
    id: 'protocolBuilder.pedigree.personFormReservedRefusal',
    defaultMessage:
      'The interface already records this attribute as one of its person attributes, so these fields cannot collect it as well. Choose another attribute, or remove the field.',
    description:
      'Refusal shown when an additional person field collects an attribute already chosen as one of the Family Pedigree’s own person attributes (name, gender identity, sex assigned at birth or participant marker).',
  },
});
