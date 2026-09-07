import { defineMessages } from '@codaco/app-i18n/messages';

export const arrayItemMessages = defineMessages({
  attribute: {
    id: 'architect.arrayItem.attribute',
    defaultMessage: 'attribute',
    description:
      'Singular item name used in array-editor controls and whole confirmation sentences. Does not change stored field identifiers.',
  },
  field: {
    id: 'architect.arrayItem.field',
    defaultMessage: 'field',
    description:
      'Singular item name used in array-editor controls and whole confirmation sentences. Does not change stored field identifiers.',
  },
  prompt: {
    id: 'architect.arrayItem.prompt',
    defaultMessage: 'prompt',
    description:
      'Singular item name used in array-editor controls and whole confirmation sentences. Does not change stored field identifiers.',
  },
  disease: {
    id: 'architect.arrayItem.disease',
    defaultMessage: 'disease',
    description:
      'Singular item name used in array-editor controls and whole confirmation sentences. Does not change stored field identifiers.',
  },
  preset: {
    id: 'architect.arrayItem.preset',
    defaultMessage: 'preset',
    description:
      'Singular item name used in array-editor controls and whole confirmation sentences. Does not change stored field identifiers.',
  },
  item: {
    id: 'architect.arrayItem.item',
    defaultMessage: 'item',
    description:
      'Singular item name used in array-editor controls and whole confirmation sentences. Does not change stored field identifiers.',
  },
});

export const arrayValidationMessages = defineMessages({
  required: {
    id: 'architect.arrayValidation.required',
    defaultMessage: 'You must create at least one item.',
    description:
      'Whole actionable refusal for a researcher editing an array. Stored as a message descriptor so failed forms update when the language changes.',
  },
  duplicateAttribute: {
    id: 'architect.arrayValidation.duplicateAttribute',
    defaultMessage:
      'This attribute is already collected by another attribute in this list. Choose a different attribute, or edit the existing attribute instead.',
    description:
      'Whole actionable refusal for a researcher editing an array. Stored as a message descriptor so failed forms update when the language changes.',
  },
  duplicateField: {
    id: 'architect.arrayValidation.duplicateField',
    defaultMessage:
      'This attribute is already collected by another field in this form. Choose a different attribute, or edit the existing field instead.',
    description:
      'Whole actionable refusal for a researcher editing an array. Stored as a message descriptor so failed forms update when the language changes.',
  },
  duplicateDisease: {
    id: 'architect.arrayValidation.duplicateDisease',
    defaultMessage:
      'This attribute is already mapped by another disease. Choose a different attribute, or edit the existing disease instead.',
    description:
      'Whole actionable refusal for a researcher editing an array. Stored as a message descriptor so failed forms update when the language changes.',
  },
});
