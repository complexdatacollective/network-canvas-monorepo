import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
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
  zoomControls: {
    id: 'interview.narrativePedigree.zoomControls',
    defaultMessage: 'Zoom controls',
    description:
      'Accessible name for the toolbar under the family tree with buttons that zoom out, zoom in and show the whole family.',
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
