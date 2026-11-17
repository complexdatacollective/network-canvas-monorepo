import {
  EVERY_VERSION,
  type MessageArguments,
} from '../../localization/messageArguments.ts';
import type { LocalizedTextShape } from './localized-string.ts';
import type { SuppliedText } from './supplied-stage-setting.ts';

// The interface text a protocol may hold (`interface-text.ts`): each text
// with the interview message that words it, the messages it stands in for,
// and the arguments its message may use and those it must show, which hold
// for any rewording or translation of it too. The words themselves are the
// interview's: each text's wording is one of its messages, written in English
// in the interview's source and translated in its catalogue for each language
// Network Canvas supplies (`packages/interview/src/locales/wording`).

export type InterfaceTextEntry = SuppliedText &
  Readonly<{
    /**
     * The messages the text stands in for in the interview and the controls
     * it uses: its wording shows wherever any of them is asked for. Usually
     * the message that words it; others too where one wording serves several
     * (the Yes answer is also a yes-or-no field's own Yes).
     */
    ids: readonly string[];
    arguments?: MessageArguments;
    /**
     * What the text may hold (see `LocalizedTextShape`): markdown, over
     * several lines, for a message the researcher may format and add links
     * to, which the interview renders as markdown. Absent, the text is one
     * plain line.
     */
    shape?: LocalizedTextShape;
  }>;

export const NAVIGATION_INTERFACE_TEXT = {
  exitInterview: {
    ids: ['interview.navigation.exitInterview'],
    wording: 'interview.navigation.exitInterview',
  },
  exitInterviewDescription: {
    ids: ['interview.navigation.exitInterviewDescription'],
    wording: 'interview.navigation.exitInterviewDescription',
  },
  back: {
    ids: ['common.back'],
    wording: 'interview.interfaceText.navigation.back',
  },
  continue: {
    ids: ['common.continue'],
    wording: 'interview.interfaceText.navigation.continue',
  },
  exitFailed: {
    ids: ['interview.navigation.exitFailed'],
    wording: 'interview.navigation.exitFailed',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const INTERVIEWER_INTERFACE_TEXT = {
  exitReview: {
    ids: ['interview.navigation.exitReview'],
    wording: 'interview.navigation.exitReview',
  },
  exitReviewTitle: {
    ids: ['interview.navigation.exitReviewTitle'],
    wording: 'interview.navigation.exitReviewTitle',
  },
  exitReviewDescription: {
    ids: ['interview.navigation.exitReviewDescription'],
    wording: 'interview.navigation.exitReviewDescription',
  },
  hiddenScreen: {
    ids: ['interview.runtime.hiddenByAnswers'],
    wording: 'interview.runtime.hiddenByAnswers',
  },
  outsidePath: {
    ids: ['interview.runtime.outsideCurrentPath'],
    wording: 'interview.runtime.outsideCurrentPath',
  },
  showScreenTitle: {
    ids: ['interview.navigation.showTitle'],
    wording: 'interview.navigation.showTitle',
  },
  hiddenScreenDescription: {
    ids: ['interview.navigation.hiddenScreen'],
    wording: 'interview.navigation.hiddenScreen',
  },
  outsidePathDescription: {
    ids: ['interview.navigation.outsidePath'],
    wording: 'interview.navigation.outsidePath',
  },
  showScreen: {
    ids: ['interview.navigation.showScreen'],
    wording: 'interview.navigation.showScreen',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const BUTTONS_INTERFACE_TEXT = {
  cancel: {
    ids: ['common.cancel'],
    wording: 'interview.interfaceText.buttons.cancel',
  },
  done: {
    ids: ['common.done'],
    wording: 'interview.interfaceText.buttons.done',
  },
  delete: {
    ids: ['common.delete'],
    wording: 'interview.interfaceText.buttons.delete',
  },
  yes: {
    ids: ['frescoUi.booleanField.yes'],
    wording: 'interview.interfaceText.buttons.yes',
  },
  no: {
    ids: ['frescoUi.booleanField.no'],
    wording: 'interview.interfaceText.buttons.no',
  },
  save: {
    ids: ['common.save'],
    wording: 'interview.interfaceText.buttons.save',
  },
  dontKnow: {
    ids: ['interview.interfaces.dontKnow'],
    wording: 'interview.interfaces.dontKnow',
  },
  pauseLayout: {
    ids: ['interview.interfaces.pauseLayout'],
    wording: 'interview.interfaces.pauseLayout',
  },
  resumeLayout: {
    ids: ['interview.interfaces.resumeLayout'],
    wording: 'interview.interfaces.resumeLayout',
  },
  copy: {
    ids: ['interview.runtime.copy'],
    wording: 'interview.runtime.copy',
  },
  copied: {
    ids: ['interview.runtime.copied'],
    wording: 'interview.runtime.copied',
  },
  zoomOut: {
    ids: ['interview.interfaces.zoomOut'],
    wording: 'interview.interfaces.zoomOut',
  },

  zoomIn: {
    ids: ['interview.interfaces.zoomIn'],
    wording: 'interview.interfaces.zoomIn',
  },

  undo: {
    ids: ['interview.interfaces.undo'],
    wording: 'interview.interfaces.undo',
  },

  redo: {
    ids: ['interview.interfaces.redo'],
    wording: 'interview.interfaces.redo',
  },

  skip: {
    ids: ['interview.familyPedigree.skipStep'],
    wording: 'interview.familyPedigree.skipStep',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const MESSAGES_INTERFACE_TEXT = {
  stageError: {
    ids: ['interview.runtime.taskErrorDescription'],
    shape: { format: 'markdown', lines: 'multiple' },
    wording: 'interview.runtime.taskErrorDescription',
    variants: ['en-GB'],
  },
  itemUnavailable: {
    ids: ['interview.runtime.itemUnavailable'],
    wording: 'interview.runtime.itemUnavailable',
  },
  error: {
    ids: ['common.genericError', 'frescoUi.form.submitFailed'],
    wording: 'interview.interfaceText.messages.error',
  },
  externalDataError: {
    ids: ['interview.interfaces.externalDataError'],
    wording: 'interview.interfaces.externalDataError',
  },
  loading: {
    ids: ['common.loading'],
    wording: 'interview.interfaceText.messages.loading',
  },
  unnamed: {
    ids: ['interview.runtime.unnamed'],
    wording: 'interview.runtime.unnamed',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const SEARCH_INTERFACE_TEXT = {
  searchLabel: {
    ids: ['common.search', 'frescoUi.collectionFilterInput.searchPlaceholder'],
    wording: 'interview.interfaceText.search.searchLabel',
  },
  searchNoMatch: {
    ids: ['interview.runtime.noSearchMatch'],
    wording: 'interview.runtime.noSearchMatch',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const PASSPHRASE_INTERFACE_TEXT = {
  passphrase: {
    ids: ['interview.runtime.passphrase'],
    wording: 'interview.runtime.passphrase',
  },
  choosePassphraseHelp: {
    ids: ['interview.runtime.choosePassphraseHelp'],
    wording: 'interview.runtime.choosePassphraseHelp',
  },
  passphraseIncorrect: {
    ids: ['interview.runtime.passphraseIncorrect'],
    wording: 'interview.runtime.passphraseIncorrect',
  },
  protectedAnswersLocked: {
    ids: ['interview.runtime.protectedAnswersLocked'],
    wording: 'interview.runtime.protectedAnswersLocked',
  },
  protectedAnswersNotSaved: {
    ids: ['interview.runtime.protectedAnswersNotSaved'],
    wording: 'interview.runtime.protectedAnswersNotSaved',
  },
  answerUnavailable: {
    ids: ['interview.runtime.answerUnavailable'],
    wording: 'interview.runtime.answerUnavailable',
  },
  answerUnavailableKept: {
    ids: ['interview.runtime.answerUnavailableKept'],
    wording: 'interview.runtime.answerUnavailableKept',
  },
  confirmPassphrase: {
    ids: ['interview.interfaces.confirmPassphrase'],
    wording: 'interview.interfaces.confirmPassphrase',
  },
  passphraseAccepted: {
    ids: ['interview.interfaces.passphraseAccepted'],
    wording: 'interview.interfaces.passphraseAccepted',
  },
  passwordPlaceholder: {
    ids: ['frescoUi.passwordField.placeholder'],
    wording: 'interview.interfaceText.passphrase.passwordPlaceholder',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

export const FORMS_INTERFACE_TEXT = {
  discardChangesTitle: {
    ids: ['interview.interfaces.discardChangesTitle'],
    wording: 'interview.interfaces.discardChangesTitle',
  },
  discardChangesDescription: {
    ids: ['interview.interfaces.discardChangesDescription'],
    wording: 'interview.interfaces.discardChangesDescription',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/**
 * What a message comparing an answer with an earlier one may use: whether the
 * earlier question has a label, and that label, which the message must show
 * when there is one.
 */
const COMPARED_ANSWER_ARGUMENTS = {
  hasLabel: { kind: 'select', cases: ['true'] },
  label: { kind: 'text', required: [{ hasLabel: 'true' }] },
} as const satisfies MessageArguments;

export const VALIDATION_INTERFACE_TEXT = {
  required: {
    ids: ['frescoUi.validation.required'],
    wording: 'interview.interfaceText.validation.required',
  },
  minLength: {
    ids: ['frescoUi.validation.minLengthError'],
    arguments: { min: { kind: 'plural', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.minLength',
  },
  maxLength: {
    ids: ['frescoUi.validation.maxLengthError'],
    arguments: { max: { kind: 'plural', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.maxLength',
  },
  minValue: {
    ids: ['frescoUi.validation.minValueError'],
    arguments: { min: { kind: 'text', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.minValue',
  },
  maxValue: {
    ids: ['frescoUi.validation.maxValueError'],
    arguments: { max: { kind: 'text', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.maxValue',
  },
  minDate: {
    ids: ['frescoUi.validation.minDate'],
    arguments: { min: { kind: 'text', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.minDate',
  },
  maxDate: {
    ids: ['frescoUi.validation.maxDate'],
    arguments: { max: { kind: 'text', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.maxDate',
  },
  minSelected: {
    ids: ['frescoUi.validation.minSelectedError'],
    arguments: { count: { kind: 'plural', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.minSelected',
  },
  maxSelected: {
    ids: ['frescoUi.validation.maxSelectedError'],
    arguments: { count: { kind: 'plural', required: EVERY_VERSION } },
    wording: 'interview.interfaceText.validation.maxSelected',
  },
  unique: {
    ids: ['frescoUi.validation.uniqueError'],
    wording: 'interview.interfaceText.validation.unique',
  },
  differentFrom: {
    ids: ['frescoUi.validation.differentFromError'],
    arguments: COMPARED_ANSWER_ARGUMENTS,
    wording: 'interview.interfaceText.validation.differentFrom',
  },
  sameAs: {
    ids: ['frescoUi.validation.sameAsError'],
    arguments: COMPARED_ANSWER_ARGUMENTS,
    wording: 'interview.interfaceText.validation.sameAs',
  },
  greaterThan: {
    ids: ['frescoUi.validation.greaterThanError'],
    arguments: COMPARED_ANSWER_ARGUMENTS,
    wording: 'interview.interfaceText.validation.greaterThan',
  },
  lessThan: {
    ids: ['frescoUi.validation.lessThanError'],
    arguments: COMPARED_ANSWER_ARGUMENTS,
    wording: 'interview.interfaceText.validation.lessThan',
  },
  greaterThanOrEqual: {
    ids: ['frescoUi.validation.greaterThanOrEqualError'],
    arguments: COMPARED_ANSWER_ARGUMENTS,
    wording: 'interview.interfaceText.validation.greaterThanOrEqual',
  },
  lessThanOrEqual: {
    ids: ['frescoUi.validation.lessThanOrEqualError'],
    arguments: COMPARED_ANSWER_ARGUMENTS,
    wording: 'interview.interfaceText.validation.lessThanOrEqual',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** The family tree view controls both pedigree stages show. */
export const FAMILY_TREE_VIEW_INTERFACE_TEXT = {
  zoomOutDescription: {
    ids: ['interview.familyPedigree.zoomOutDescription'],
    wording: 'interview.familyPedigree.zoomOutDescription',
  },
  zoomInDescription: {
    ids: ['interview.familyPedigree.zoomInDescription'],
    wording: 'interview.familyPedigree.zoomInDescription',
  },
  showWholeFamily: {
    ids: ['interview.familyPedigree.showWholeFamily'],
    wording: 'interview.familyPedigree.showWholeFamily',
  },
  showWholeFamilyDescription: {
    ids: ['interview.familyPedigree.showWholeFamilyDescription'],
    wording: 'interview.familyPedigree.showWholeFamilyDescription',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/**
 * Every Family Pedigree stage's own controls. The framing question and its
 * control are shown only by a stage whose participants choose the words
 * (see `INTERFACE_TEXT_GROUPS`).
 */
export const FAMILY_PEDIGREE_INTERFACE_TEXT = {
  pointerTool: {
    ids: ['interview.familyPedigree.pointerTool'],
    wording: 'interview.familyPedigree.pointerTool',
  },
  pointerToolDescription: {
    ids: ['interview.familyPedigree.pointerToolDescription'],
    wording: 'interview.familyPedigree.pointerToolDescription',
  },
  connectTool: {
    ids: ['interview.familyPedigree.connectTool'],
    wording: 'interview.familyPedigree.connectTool',
  },
  connectToolDescription: {
    ids: ['interview.familyPedigree.connectToolDescription'],
    wording: 'interview.familyPedigree.connectToolDescription',
  },
  connectHint: {
    ids: ['interview.familyPedigree.connectHint'],
    wording: 'interview.familyPedigree.connectHint',
  },
  disconnectTool: {
    ids: ['interview.familyPedigree.disconnectTool'],
    wording: 'interview.familyPedigree.disconnectTool',
  },
  disconnectToolDescription: {
    ids: ['interview.familyPedigree.disconnectToolDescription'],
    wording: 'interview.familyPedigree.disconnectToolDescription',
  },
  disconnectHint: {
    ids: ['interview.familyPedigree.disconnectHint'],
    wording: 'interview.familyPedigree.disconnectHint',
  },
  framingControlLabel: {
    ids: ['interview.familyPedigree.framingControlLabel'],
    wording: 'interview.familyPedigree.framingControlLabel',
  },
  framingControlDescription: {
    ids: ['interview.familyPedigree.framingControlDescription'],
    wording: 'interview.familyPedigree.framingControlDescription',
  },
  framingChoiceTitle: {
    ids: ['interview.familyPedigree.framingChoiceTitle'],
    wording: 'interview.familyPedigree.framingChoiceTitle',
  },
  framingChoiceDescription: {
    ids: ['interview.familyPedigree.framingChoiceDescription'],
    wording: 'interview.familyPedigree.framingChoiceDescription',
  },
  undoDescription: {
    ids: ['interview.familyPedigree.undoDescription'],
    wording: 'interview.familyPedigree.undoDescription',
  },
  redoDescription: {
    ids: ['interview.familyPedigree.redoDescription'],
    wording: 'interview.familyPedigree.redoDescription',
  },
  trackerAllDetails: {
    ids: ['interview.familyPedigree.trackerAllDetails'],
    wording: 'interview.familyPedigree.trackerAllDetails',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/**
 * The button an opened bin shows on a Categorical Bin that places nodes by
 * tapping, which places the node being placed in that bin.
 */
export const CATEGORICAL_BIN_INTERFACE_TEXT = {
  placeHere: {
    ids: ['interview.interfaces.binSelectPlaceHere'],
    wording: 'interview.interfaces.binSelectPlaceHere',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** Every quick-add Name Generator stage's own words. */
export const QUICK_ADD_INTERFACE_TEXT = {
  quickAddHint: {
    ids: ['interview.interfaces.quickAddHint'],
    wording: 'interview.interfaces.quickAddHint',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/**
 * Every Network Composer stage's own words. The Groups tool's name and the
 * edge tool's tooltip are shown only by a stage with groups and edge types,
 * the notice about an overtaken edit only by one whose inspector has a form,
 * and the name of a connection of another type only while the codebook has an
 * edge type the stage does not draw (see `INTERFACE_TEXT_GROUPS`).
 */
export const NETWORK_COMPOSER_INTERFACE_TEXT = {
  addNamePlaceholder: {
    ids: ['interview.interfaces.addNamePlaceholder'],
    wording: 'interview.interfaces.addNamePlaceholder',
  },
  overtakenEditNotice: {
    ids: ['interview.interfaces.overtakenEditNotice'],
    wording: 'interview.interfaces.overtakenEditNotice',
  },
  groupsHeading: {
    ids: ['interview.interfaces.composerGroups'],
    wording: 'interview.interfaces.composerGroups',
  },
  addNodeTooltip: {
    ids: ['interview.interfaces.composerAddNode'],
    wording: 'interview.interfaces.composerAddNode',
  },
  automaticLayoutTooltip: {
    ids: ['interview.interfaces.composerAutomaticLayout'],
    wording: 'interview.interfaces.composerAutomaticLayout',
  },
  drawEdgeTooltip: {
    ids: ['interview.interfaces.composerDrawEdge'],
    wording: 'interview.interfaces.composerDrawEdge',
  },
  connection: {
    ids: ['interview.runtime.connection'],
    wording: 'interview.runtime.connection',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/** Every Narrative stage's drawing tools, shown while its drawing is on. */
export const NARRATIVE_INTERFACE_TEXT = {
  toggleDrawing: {
    ids: ['interview.interfaces.toggleDrawing'],
    wording: 'interview.interfaces.toggleDrawing',
  },
  toggleFreezing: {
    ids: ['interview.interfaces.toggleFreezing'],
    wording: 'interview.interfaces.toggleFreezing',
  },
  resetAnnotations: {
    ids: ['interview.interfaces.resetAnnotations'],
    wording: 'interview.interfaces.resetAnnotations',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/**
 * What a condition's name may be called in the rows of a Narrative
 * Pedigree's key: the condition the key is showing.
 */
const CONDITION_ARGUMENTS = {
  condition: { kind: 'text' },
} as const satisfies MessageArguments;

/**
 * Every Narrative Pedigree stage's key, and the button that clears its focus.
 * The at-risk rows are shown only by a stage that shows at-risk statuses (see
 * `INTERFACE_TEXT_GROUPS`).
 */
export const NARRATIVE_PEDIGREE_INTERFACE_TEXT = {
  keyHeading: {
    ids: ['interview.narrativePedigree.keyHeading'],
    wording: 'interview.narrativePedigree.keyHeading',
  },
  hasCondition: {
    ids: ['interview.narrativePedigree.keyHasCondition'],
    arguments: CONDITION_ARGUMENTS,
    wording: 'interview.narrativePedigree.keyHasCondition',
  },
  willDevelop: {
    ids: ['interview.narrativePedigree.keyWillDevelop'],
    arguments: CONDITION_ARGUMENTS,
    wording: 'interview.narrativePedigree.keyWillDevelop',
  },
  carries: {
    ids: ['interview.narrativePedigree.keyCarries'],
    arguments: CONDITION_ARGUMENTS,
    wording: 'interview.narrativePedigree.keyCarries',
  },
  mayDevelop: {
    ids: ['interview.narrativePedigree.keyMayDevelop'],
    arguments: CONDITION_ARGUMENTS,
    wording: 'interview.narrativePedigree.keyMayDevelop',
  },
  mayCarry: {
    ids: ['interview.narrativePedigree.keyMayCarry'],
    arguments: CONDITION_ARGUMENTS,
    wording: 'interview.narrativePedigree.keyMayCarry',
  },
  notKnown: {
    ids: ['interview.narrativePedigree.keyNotKnown'],
    arguments: CONDITION_ARGUMENTS,
    wording: 'interview.narrativePedigree.keyNotKnown',
  },
  clearFocus: {
    ids: ['interview.narrativePedigree.clearFocus'],
    wording: 'interview.narrativePedigree.clearFocus',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;

/**
 * Every Geospatial stage's notices about its map. The search's notice is
 * shown only by a map with a search (see `INTERFACE_TEXT_GROUPS`).
 */
export const GEOSPATIAL_INTERFACE_TEXT = {
  offlineNotice: {
    ids: ['interview.interfaces.mapOffline'],
    wording: 'interview.interfaces.mapOffline',
  },
  mapUnavailable: {
    ids: ['interview.interfaces.mapUnavailable'],
    wording: 'interview.interfaces.mapUnavailable',
    variants: ['en-GB'],
  },
  searchFailed: {
    ids: ['interview.interfaces.searchFailed'],
    wording: 'interview.interfaces.searchFailed',
  },
} as const satisfies Readonly<Record<string, InterfaceTextEntry>>;
