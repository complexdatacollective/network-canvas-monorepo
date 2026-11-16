import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  keyHeading: {
    id: 'interview.narrativePedigree.keyHeading',
    defaultMessage: 'Key',
    description:
      'Heading over the key that explains the symbols drawn on the family tree for the chosen condition.',
  },
  keyHasCondition: {
    id: 'interview.narrativePedigree.keyHasCondition',
    defaultMessage: 'Has this condition',
    description:
      'Key row: what the filled symbol means. condition is the name of the condition the key shows, which the protocol may use.',
  },
  keyWillDevelop: {
    id: 'interview.narrativePedigree.keyWillDevelop',
    defaultMessage: 'Will develop this condition',
    description:
      'Key row: what the symbol with a vertical line means. condition is the name of the condition the key shows, which the protocol may use.',
  },
  keyCarries: {
    id: 'interview.narrativePedigree.keyCarries',
    defaultMessage: 'Carries this condition',
    description:
      'Key row: what the symbol with a horizontal line means. condition is the name of the condition the key shows, which the protocol may use.',
  },
  keyMayDevelop: {
    id: 'interview.narrativePedigree.keyMayDevelop',
    defaultMessage: 'May develop this condition',
    description:
      'Key row: what the symbol with a vertical line and a question mark means. condition is the name of the condition the key shows, which the protocol may use.',
  },
  keyMayCarry: {
    id: 'interview.narrativePedigree.keyMayCarry',
    defaultMessage: 'May carry this condition',
    description:
      'Key row: what the symbol with a horizontal line and a question mark means. condition is the name of the condition the key shows, which the protocol may use.',
  },
  keyNotKnown: {
    id: 'interview.narrativePedigree.keyNotKnown',
    defaultMessage: 'Not known',
    description:
      'Key row: what the plain symbol means when nothing is known about the condition. condition is the name of the condition the key shows, which the protocol may use.',
  },
  clearFocus: {
    id: 'interview.narrativePedigree.clearFocus',
    defaultMessage: 'Clear focus',
    description:
      'Accessible name and tooltip of the button that stops focusing the family tree on one person.',
  },
});
