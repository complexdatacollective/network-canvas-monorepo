import { defineMessages } from '@codaco/app-i18n/messages';

export const messages = defineMessages({
  conditionKey: {
    id: 'interview.narrativePedigree.conditionKey',
    defaultMessage: 'Condition key',
    description:
      'Accessible name of the side panel listing protocol-authored conditions and explaining the pedigree status symbols.',
  },
  key: {
    id: 'interview.narrativePedigree.key',
    defaultMessage: 'Key',
    description:
      'Heading for the symbol legend, shared by the on-screen condition panel and the printable snapshot document.',
  },
  conditions: {
    id: 'interview.narrativePedigree.conditions',
    defaultMessage: 'Conditions',
    description:
      'Subheading above protocol-authored condition names. Only this generic heading is translated, not the names of conditions.',
  },
  selectCondition: {
    id: 'interview.narrativePedigree.selectCondition',
    defaultMessage: 'Select a condition to see who it affects.',
    description:
      'Instruction for choosing one condition to show its inheritance notation and enable focusing on a family member.',
  },
  symbols: {
    id: 'interview.narrativePedigree.symbols',
    defaultMessage: 'What the symbols mean',
    description:
      'Subheading explaining the visual genetic-status glyphs, including uncertain statuses only when enabled by the protocol.',
  },
  saveSnapshot: {
    id: 'interview.narrativePedigree.saveSnapshot',
    defaultMessage: 'Save snapshot',
    description:
      'Action saving the current family tree, selected condition, focus and notation legend as a printable PNG image.',
  },
  hasCondition: {
    id: 'interview.narrativePedigree.hasCondition',
    defaultMessage: 'Has this condition',
    description:
      'Plain-language legend meaning of the filled affected-status symbol: the person is recorded as having the condition.',
  },
  willDevelop: {
    id: 'interview.narrativePedigree.willDevelop',
    defaultMessage: 'Will develop this condition',
    description:
      'Plain-language legend meaning of the obligate/presymptomatic affected symbol: development is modelled as certain, unlike the may-develop status.',
  },
  carries: {
    id: 'interview.narrativePedigree.carries',
    defaultMessage: 'Carries this condition',
    description:
      'Plain-language legend meaning of an obligate carrier: the person carries the relevant inherited variant, distinct from being affected.',
  },
  mayDevelop: {
    id: 'interview.narrativePedigree.mayDevelop',
    defaultMessage: 'May develop this condition',
    description:
      'Plain-language legend meaning of uncertain risk of developing the condition. Preserve the uncertainty and do not claim a diagnosis.',
  },
  mayCarry: {
    id: 'interview.narrativePedigree.mayCarry',
    defaultMessage: 'May carry this condition',
    description:
      'Plain-language legend meaning of uncertain carrier status. Preserve the uncertainty and distinguish carrying from developing the condition.',
  },
  notKnown: {
    id: 'interview.narrativePedigree.notKnown',
    defaultMessage: 'Not known',
    description:
      'Plain-language legend meaning when genetic status is unknown or the protocol hides probabilistic status markers.',
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
      'Accessible name for the toolbar or button group that enlarges and reduces the family-tree view.',
  },
  zoomOut: {
    id: 'interview.narrativePedigree.zoomOut',
    defaultMessage: 'Zoom out',
    description:
      'Accessible action reducing the diagram magnification while preserving the view centre.',
  },
  zoomIn: {
    id: 'interview.narrativePedigree.zoomIn',
    defaultMessage: 'Zoom in',
    description:
      'Accessible action increasing the diagram magnification while preserving the view centre.',
  },
  viewportControls: {
    id: 'interview.narrativePedigree.viewportControls',
    defaultMessage: 'Viewport controls',
    description:
      'Accessible group name for controls that reset the diagram view rather than change family data.',
  },
  resetZoom: {
    id: 'interview.narrativePedigree.resetZoom',
    defaultMessage: 'Reset zoom',
    description:
      'Accessible action restoring default diagram magnification and recentering the scroll position.',
  },
  focusOn: {
    id: 'interview.narrativePedigree.focusOn',
    defaultMessage: 'Focus on {name}',
    description:
      'Accessible action focusing the inheritance view on a person. name is entered research text or a localized relationship fallback; do not alter it.',
  },
  familyPedigree: {
    id: 'interview.narrativePedigree.familyPedigree',
    defaultMessage: 'Family pedigree',
    description:
      'Snapshot title fallback used only when the protocol has no stage label. An authored stage label always takes precedence and stays unchanged.',
  },
  snapshotCondition: {
    id: 'interview.narrativePedigree.snapshotCondition',
    defaultMessage: '{title}: {condition}',
    description:
      'Whole snapshot heading combining the authored stage title and condition name. title and condition remain verbatim; the punctuation can follow locale conventions.',
  },
  snapshotInheritance: {
    id: 'interview.narrativePedigree.snapshotInheritance',
    defaultMessage: '{title}: {condition} — inheritance for {name}',
    description:
      'Whole snapshot heading for a condition focused on a person. title and condition are authored text; name is entered text or a localized fallback. Translate only the surrounding inheritance phrase.',
  },
  sourceMissing: {
    id: 'interview.narrativePedigree.sourceMissing',
    defaultMessage:
      'This stage references a family pedigree that could not be found.',
    description:
      'Empty-state error when the protocol references a family-tree source that cannot be found. Uses participant language rather than exposing the internal stage identifier.',
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
  clearFocus: {
    id: 'interview.narrativePedigree.clearFocus',
    defaultMessage: 'Clear focus',
    description:
      'Action removing the selected focal person and their contributor highlight, while keeping the selected condition.',
  },
  diseaseStatus: {
    id: 'interview.narrativePedigree.diseaseStatus',
    defaultMessage: '{condition}: {status}',
    description:
      'One entry in a locale-formatted screen-reader list of conditions and statuses. condition is an authored condition name; status is an already localized clinical status label.',
  },
});
