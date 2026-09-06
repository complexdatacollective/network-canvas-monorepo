import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The pedigree sections' copy that leaves this family and is rendered
 * elsewhere.
 *
 * Same rule as `networkCanvasMessages`: a confirmation `BuilderSection` shows,
 * a row noun `DialogArrayField` builds its refusals around, and the sentences
 * `FormFieldsSection` says on the pedigree's behalf are all declared here as
 * descriptors, because a string handed across that seam is extracted by
 * nothing and translated by nobody.
 *
 * The family-member form's own words are here for a second reason as well. The
 * shared section is worded for a form that stands on its own — "Form fields",
 * "the fields this form asks" — and this one is hung off the node
 * configuration of a stage the participant adds RELATIVES to. What is being
 * described is a person in a family, and the pedigree is the only thing that
 * knows that.
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
});
