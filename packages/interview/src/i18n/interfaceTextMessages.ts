import { defineMessages } from '@codaco/app-i18n/messages';

// The interview's wording for the interface text that stands in for messages
// of shared controls (`common.*`, `frescoUi.*`) or for several messages at
// once: what the interview shows for a text the protocol does not hold. The
// schema names each text and the messages it stands in for
// (`@codaco/protocol-validation`, `interface-text-entries.ts`). Interface text
// that stands in for one of the interview's own messages is worded by that
// message, so it is not repeated here.
export const interfaceTextMessages = defineMessages({
  'buttons.cancel': {
    id: 'interview.interfaceText.buttons.cancel',
    defaultMessage: 'Cancel',
    description: 'Generic action that abandons the current operation.',
  },
  'buttons.delete': {
    id: 'interview.interfaceText.buttons.delete',
    defaultMessage: 'Delete',
    description: 'Generic action that removes the selected item.',
  },
  'buttons.done': {
    id: 'interview.interfaceText.buttons.done',
    defaultMessage: 'Done',
    description: 'Generic action that finishes the current flow.',
  },
  'buttons.no': {
    id: 'interview.interfaceText.buttons.no',
    defaultMessage: 'No',
    description: 'Default negative option of a yes/no field.',
  },
  'buttons.save': {
    id: 'interview.interfaceText.buttons.save',
    defaultMessage: 'Save',
    description: 'Generic action that persists the current changes.',
  },
  'buttons.yes': {
    id: 'interview.interfaceText.buttons.yes',
    defaultMessage: 'Yes',
    description:
      'The Yes answer to a yes-or-no question, and the button that confirms discarding a form’s unsaved changes when the participant leaves it.',
  },
  'messages.error': {
    id: 'interview.interfaceText.messages.error',
    defaultMessage: 'An error occurred.',
    description:
      'Generic failure sentence shown when no more specific error applies, including when a form could not be submitted.',
  },
  'messages.loading': {
    id: 'interview.interfaceText.messages.loading',
    defaultMessage: 'Loading…',
    description: 'Generic indicator shown while content is being fetched.',
  },
  'navigation.back': {
    id: 'interview.interfaceText.navigation.back',
    defaultMessage: 'Back',
    description: 'Generic action that returns to the previous step.',
  },
  'navigation.continue': {
    id: 'interview.interfaceText.navigation.continue',
    defaultMessage: 'Continue',
    description: 'Generic action that advances to the next step.',
  },
  'passphrase.passwordPlaceholder': {
    id: 'interview.interfaceText.passphrase.passwordPlaceholder',
    defaultMessage: 'Enter password',
    description: 'Default placeholder of a password input.',
  },
  'search.searchLabel': {
    id: 'interview.interfaceText.search.searchLabel',
    defaultMessage: 'Search',
    description:
      'Label, accessible name and placeholder of a search box: the one that filters the interview’s list of screens, and the one over a list of people to choose from.',
  },
  'validation.differentFrom': {
    id: 'interview.interfaceText.validation.differentFrom',
    defaultMessage:
      "{hasLabel, select, true {Your answer must be different from your answer to ''{label}''.} other {Your answer must be different from your earlier answer.}}",
    description:
      'Error and hint for a must-differ comparison. hasLabel says whether the other question has a visible label; label is that label.',
  },
  'validation.greaterThan': {
    id: 'interview.interfaceText.validation.greaterThan',
    defaultMessage:
      "{hasLabel, select, true {Your answer must be greater than your answer to ''{label}''.} other {Your answer must be greater than your earlier answer.}}",
    description:
      'Error and hint for a must-be-greater comparison. hasLabel says whether the other question has a visible label; label is that label.',
  },
  'validation.greaterThanOrEqual': {
    id: 'interview.interfaceText.validation.greaterThanOrEqual',
    defaultMessage:
      "{hasLabel, select, true {Your answer must be the same as or greater than your answer to ''{label}''.} other {Your answer must be the same as or greater than your earlier answer.}}",
    description:
      'Error and hint for a must-be-at-least comparison. hasLabel says whether the other question has a visible label; label is that label.',
  },
  'validation.lessThan': {
    id: 'interview.interfaceText.validation.lessThan',
    defaultMessage:
      "{hasLabel, select, true {Your answer must be less than your answer to ''{label}''.} other {Your answer must be less than your earlier answer.}}",
    description:
      'Error and hint for a must-be-less comparison. hasLabel says whether the other question has a visible label; label is that label.',
  },
  'validation.lessThanOrEqual': {
    id: 'interview.interfaceText.validation.lessThanOrEqual',
    defaultMessage:
      "{hasLabel, select, true {Your answer must be the same as or less than your answer to ''{label}''.} other {Your answer must be the same as or less than your earlier answer.}}",
    description:
      'Error and hint for a must-be-at-most comparison. hasLabel says whether the other question has a visible label; label is that label.',
  },
  'validation.maxDate': {
    id: 'interview.interfaceText.validation.maxDate',
    defaultMessage: 'Must be on or before {max}.',
    description:
      'Hint and error for a date/time maximum; {max} is the formatted bound.',
  },
  'validation.maxLength': {
    id: 'interview.interfaceText.validation.maxLength',
    defaultMessage:
      '{max, plural, one {Enter at most # character.} other {Enter at most # characters.}}',
    description:
      'Error and hint shown when text is longer than its maximum length.',
  },
  'validation.maxSelected': {
    id: 'interview.interfaceText.validation.maxSelected',
    defaultMessage:
      '{count, plural, one {Select a maximum of # value.} other {Select a maximum of # values.}}',
    description: 'Error and hint shown when too many options are selected.',
  },
  'validation.maxValue': {
    id: 'interview.interfaceText.validation.maxValue',
    defaultMessage: 'Enter a value less than or equal to {max}.',
    description: 'Error and hint shown when a number is above its maximum.',
  },
  'validation.minDate': {
    id: 'interview.interfaceText.validation.minDate',
    defaultMessage: 'Must be on or after {min}.',
    description:
      'Hint and error for a date/time minimum; {min} is the formatted bound.',
  },
  'validation.minLength': {
    id: 'interview.interfaceText.validation.minLength',
    defaultMessage:
      '{min, plural, one {Enter at least # character.} other {Enter at least # characters.}}',
    description:
      'Error and hint shown when text is shorter than its minimum length.',
  },
  'validation.minSelected': {
    id: 'interview.interfaceText.validation.minSelected',
    defaultMessage:
      '{count, plural, one {Select at least # value.} other {Select at least # values.}}',
    description: 'Error and hint shown when too few options are selected.',
  },
  'validation.minValue': {
    id: 'interview.interfaceText.validation.minValue',
    defaultMessage: 'Enter a value greater than or equal to {min}.',
    description: 'Error and hint shown when a number is below its minimum.',
  },
  'validation.required': {
    id: 'interview.interfaceText.validation.required',
    defaultMessage: 'You must answer this question before continuing.',
    description: 'Error shown when a required form field is left unanswered.',
  },
  'validation.sameAs': {
    id: 'interview.interfaceText.validation.sameAs',
    defaultMessage:
      "{hasLabel, select, true {Your answer must be the same as your answer to ''{label}''.} other {Your answer must be the same as your earlier answer.}}",
    description:
      'Error and hint for a must-match comparison. hasLabel says whether the other question has a visible label; label is that label.',
  },
  'validation.unique': {
    id: 'interview.interfaceText.validation.unique',
    defaultMessage: 'Must be unique.',
    description:
      'Error and hint shown when a value duplicates one used elsewhere.',
  },
});
