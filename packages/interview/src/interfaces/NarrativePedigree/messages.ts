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
  conditionKey: {
    id: 'interview.narrativePedigree.conditionKey',
    defaultMessage: 'Condition key',
    description:
      'Accessible name of the side panel listing protocol-authored conditions and explaining the pedigree status symbols.',
  },
  affected: {
    id: 'interview.narrativePedigree.affected',
    defaultMessage: 'Affected',
    description:
      'Clinical status tooltip and screen-reader label for a person recorded as affected by the condition; the stable model key remains affected.',
  },
  obligateAffected: {
    id: 'interview.narrativePedigree.obligateAffected',
    defaultMessage: 'Obligate affected',
    description:
      'Clinical status label for a person inferred to be necessarily affected, including presymptomatic disease. This is stronger than an at-risk status.',
  },
  obligateCarrier: {
    id: 'interview.narrativePedigree.obligateCarrier',
    defaultMessage: 'Obligate carrier',
    description:
      'Clinical status label for a person inferred to necessarily carry the inherited variant. It does not itself say that they have symptoms.',
  },
  atRiskAffected: {
    id: 'interview.narrativePedigree.atRiskAffected',
    defaultMessage: 'At risk (affected)',
    description:
      'Clinical status label for uncertain risk of being affected or developing the condition; shown only when probabilistic statuses are enabled.',
  },
  atRiskCarrier: {
    id: 'interview.narrativePedigree.atRiskCarrier',
    defaultMessage: 'At risk (carrier)',
    description:
      'Clinical status label for uncertain carrier status, distinct from uncertain risk of developing the condition.',
  },
  statusUnknown: {
    id: 'interview.narrativePedigree.statusUnknown',
    defaultMessage: 'Status unknown',
    description:
      'Clinical status tooltip and screen-reader label when the inheritance information does not establish a displayed genetic status.',
  },
  toolbarLabel: {
    id: 'interview.narrativePedigree.toolbarLabel',
    defaultMessage: 'Family tree controls',
    description:
      'Accessible name for the toolbar under the family tree. It holds the menu that chooses which medical condition the tree shows, the buttons that zoom out, zoom in and show the whole family, and the button that saves a picture of the tree.',
  },
  focusOn: {
    id: 'interview.narrativePedigree.focusOn',
    defaultMessage: 'Focus on {name}',
    description:
      'Accessible action focusing the inheritance view on a person. name is entered research text or a localized relationship fallback; do not alter it.',
  },
  showingAll: {
    id: 'interview.narrativePedigree.showingAll',
    defaultMessage: 'Showing all conditions',
    description:
      'Live announcement when no single condition is selected and the interface shows all protocol conditions.',
  },
  showingCondition: {
    id: 'interview.narrativePedigree.showingCondition',
    defaultMessage: 'Showing {condition}',
    description:
      'Live announcement after selecting a condition. condition is its unchanged protocol-authored name.',
  },
  showingFocused: {
    id: 'interview.narrativePedigree.showingFocused',
    defaultMessage:
      'Showing {condition}. Focused on {name}. Showing who contributes to their inheritance.',
    description:
      'Whole live announcement naming the selected condition and focused person, then explaining the inheritance-contributor highlight. condition and name remain separate, unchanged values.',
  },
  showingAllFocused: {
    id: 'interview.narrativePedigree.showingAllFocused',
    defaultMessage:
      'Showing all conditions. Focused on {name}. Showing who contributes to their inheritance.',
    description:
      'Whole live announcement for an all-conditions view with a focused person. name is entered text or a localized fallback; preserve the explanation of contributor highlighting.',
  },
  resizeKey: {
    id: 'interview.narrativePedigree.resizeKey',
    defaultMessage: 'Resize the condition key panel',
    description:
      'Accessible name for the splitter resizing the condition-legend panel beside the diagram.',
  },
  diseaseStatus: {
    id: 'interview.narrativePedigree.diseaseStatus',
    defaultMessage: '{condition}: {status}',
    description:
      'One entry in a locale-formatted screen-reader list of conditions and statuses. condition is an authored condition name; status is an already localized clinical status label.',
  },
});
