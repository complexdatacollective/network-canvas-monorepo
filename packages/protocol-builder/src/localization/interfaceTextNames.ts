import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

// Kept apart from `localizedTextNames.ts`, which imports every editor's
// messages: a stage editor that names the interview's shared words (see
// `SharedStageWording`) would otherwise import itself.
const messages = defineMessages({
  interfaceTextGroup: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextGroup',
    defaultMessage:
      '{group, select, navigation {Interview navigation} interviewer {Interviewer controls} buttons {Buttons} messages {Messages} search {Search} passphrase {Passphrase} forms {Forms} validation {Validation messages} familyTreeView {Family tree view} familyPedigree {Family Pedigree} categoricalBin {Categorical Bin} quickAdd {Name Generator (quick add)} roster {Name Generator for Roster Data} networkComposer {Network Composer} egoForm {Ego Form} other {{group}}}',
    description:
      'Names a group of the words the interview itself shows, such as its buttons and messages, where they are listed for translation. group is which: those for moving through the interview and leaving it, those only an interviewer uses (leaving a review, showing a hidden screen), the labels of its buttons, its error messages, those of a search box, those shown when answers are protected by a passphrase, those shown with forms, or the messages that say an answer breaks one of its rules. The rest are named for the kind of stage whose every stage shows them: familyTreeView is the controls for viewing a family tree, shared by the Family Pedigree and Narrative Pedigree stages; the others are the stage types Family Pedigree, Categorical Bin, Name Generator (quick add), Name Generator for Roster Data, Network Composer and Ego Form, named as the stage type menu names them.',
  },
  interfaceTextName: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextName',
    defaultMessage:
      '{key, select, exitInterview {Exit button} exitInterviewDescription {Exit explanation} stageError {Screen error message} itemUnavailable {Missing item message} back {Back button} continue {Continue button} cancel {Cancel button} done {Done button} delete {Delete button} yes {Yes answer} no {No answer} save {Save button} dontKnow {Don’t know answer} pauseLayout {Pause layout button} resumeLayout {Resume layout button} error {Error message} externalDataError {External data error message} searchLabel {Search field} searchNoMatch {No results message} passphrase {Passphrase field} choosePassphraseHelp {Passphrase advice} passphraseIncorrect {Wrong passphrase message} protectedAnswersLocked {Locked answers message} protectedAnswersNotSaved {Unsaved answers message} protectedAnswersUnavailable {Unavailable answers message} answerUnavailable {Unavailable answer label} answerUnavailableKept {Earlier answer message} confirmPassphrase {Confirm passphrase field} passphraseAccepted {Passphrase accepted message} discardChangesTitle {Discard question} discardChangesDescription {Discard explanation} required {Required answer message} minLength {Too short message} maxLength {Too long message} minValue {Too small message} maxValue {Too large message} minDate {Too early message} maxDate {Too late message} minSelected {Too few chosen message} maxSelected {Too many chosen message} unique {Repeated answer message} differentFrom {Must differ message} sameAs {Must match message} greaterThan {Must be greater message} lessThan {Must be less message} greaterThanOrEqual {Must be at least message} lessThanOrEqual {Must be at most message} copy {Copy button} copied {Copied message} loading {Loading message} unnamed {Unnamed label} exitFailed {Exit failed message} exitReview {Exit review button} exitReviewTitle {Exit review question} exitReviewDescription {Exit review explanation} hiddenScreen {Hidden screen label} outsidePath {Outside path label} showScreenTitle {Show screen question} hiddenScreenDescription {Hidden screen explanation} outsidePathDescription {Outside path explanation} showScreen {Show screen button} checkingPassphrase {Checking passphrase message} passwordPlaceholder {Passphrase field hint} zoomOut {Zoom out button} zoomOutDescription {Zoom out explanation} zoomIn {Zoom in button} zoomInDescription {Zoom in explanation} showWholeFamily {Whole family button} showWholeFamilyDescription {Whole family explanation} pointerToolDescription {Select tool explanation} connectToolDescription {Connect tool explanation} disconnectToolDescription {Disconnect tool explanation} framingControlDescription {Relationship words explanation} undo {Undo button} undoDescription {Undo explanation} redo {Redo button} redoDescription {Redo explanation} skip {Skip button} trackerAllDetails {All details checklist item} placeHere {Place here label} unnamedNumbered {Numbered unnamed label} dropToRemove {Drop to remove message} connection {Connection label} scrollForQuestions {More questions hint} addNamePlaceholder {Name box placeholder} other {{key}}}',
    description:
      'Names one of the words the interview itself shows, where it is listed for translation: a button, a field label or a message, by what it is for. key says which.',
  },
});

/**
 * The hint under each of the interview's shared words that a stage editor's
 * built-in wording shows: where the participant sees it and what it is for.
 */
const hints = defineMessages({
  zoomOutDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.zoomOutDescription',
    defaultMessage: 'Tooltip text for the zoom out button on the family tree.',
    description:
      'Hint under the setting holding the zoom out explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  zoomInDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.zoomInDescription',
    defaultMessage: 'Tooltip text for the zoom in button on the family tree.',
    description:
      'Hint under the setting holding the zoom in explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  showWholeFamily: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.showWholeFamily',
    defaultMessage:
      'Name of the toolbar button that fits the whole family tree on the screen. Shown in its tooltip.',
    description:
      'Hint under the setting holding the whole family button, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  showWholeFamilyDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.showWholeFamilyDescription',
    defaultMessage:
      'Tooltip text for the button that fits the whole family tree on the screen.',
    description:
      'Hint under the setting holding the whole family explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  pointerToolDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.pointerToolDescription',
    defaultMessage:
      'Tooltip text for the pointer tool in the family tree toolbar.',
    description:
      'Hint under the setting holding the select tool explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  connectToolDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.connectToolDescription',
    defaultMessage:
      'Tooltip text for the connect tool in the family tree toolbar.',
    description:
      'Hint under the setting holding the connect tool explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  disconnectToolDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.disconnectToolDescription',
    defaultMessage:
      'Tooltip text for the disconnect tool in the family tree toolbar.',
    description:
      'Hint under the setting holding the disconnect tool explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  framingControlDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.framingControlDescription',
    defaultMessage:
      'Tooltip text for the control that changes the words used for family members. Only used when participants choose the words.',
    description:
      'Hint under the setting holding the relationship words explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  undoDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.undoDescription',
    defaultMessage:
      'Tooltip text for the undo button in the family tree toolbar.',
    description:
      'Hint under the setting holding the undo explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  redoDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.redoDescription',
    defaultMessage:
      'Tooltip text for the redo button in the family tree toolbar.',
    description:
      'Hint under the setting holding the redo explanation, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  trackerAllDetails: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.trackerAllDetails',
    defaultMessage:
      'Last item in the completeness checklist, asking for the required details of every family member.',
    description:
      'Hint under the setting holding the all details checklist item, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  placeHere: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.placeHere',
    defaultMessage:
      'Button on each bin that places the selected node in it, when the participant taps a node and then a bin.',
    description:
      'Hint under the setting holding the place here label, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  unnamedNumbered: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.unnamedNumbered',
    defaultMessage:
      'Label for a roster item that has no name. The number tells unnamed items apart.',
    description:
      'Hint under the setting holding the numbered unnamed label, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  dropToRemove: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.dropToRemove',
    defaultMessage:
      'Shown over the roster list while the participant drags an added node back to remove it.',
    description:
      'Hint under the setting holding the drop to remove message, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  connection: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.connection',
    defaultMessage:
      'Title shown when the participant selects an edge of a type this stage does not draw, such as one from an earlier stage.',
    description:
      'Hint under the setting holding the connection label, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  scrollForQuestions: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.scrollForQuestions',
    defaultMessage:
      'Read by screen readers on the arrow that shows there are more questions below.',
    description:
      'Hint under the setting holding the more questions hint, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  addNamePlaceholder: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.addNamePlaceholder',
    defaultMessage:
      'Placeholder in the quick-add box where the participant types a name, shown until they start typing.',
    description:
      'Hint under the setting holding the name box placeholder, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
});

/** What the translation table calls a group of the interview's shared words. */
export const nameInterfaceTextGroup = (intl: IntlShape, group: string) =>
  intl.formatMessage(messages.interfaceTextGroup, { group });

/** What the translation table calls one of the interview's shared words. */
export const nameInterfaceText = (intl: IntlShape, key: string) =>
  intl.formatMessage(messages.interfaceTextName, { key });

/**
 * The hint under one of the interview's shared words in a stage's built-in
 * wording, or undefined for one no stage's wording shows.
 */
export const hintInterfaceText = (
  intl: IntlShape,
  key: string,
): string | undefined => {
  const hint = new Map<string, MessageDescriptor>(Object.entries(hints)).get(
    key,
  );
  return hint === undefined ? undefined : intl.formatMessage(hint);
};
