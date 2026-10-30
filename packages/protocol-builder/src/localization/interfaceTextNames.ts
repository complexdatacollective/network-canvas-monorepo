import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';

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

/** What the translation table calls a group of the interview's shared words. */
export const nameInterfaceTextGroup = (intl: IntlShape, group: string) =>
  intl.formatMessage(messages.interfaceTextGroup, { group });

/** What the translation table calls one of the interview's shared words. */
export const nameInterfaceText = (intl: IntlShape, key: string) =>
  intl.formatMessage(messages.interfaceTextName, { key });
