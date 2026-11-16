import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

// Kept apart from `localizedTextNames.ts`, which imports every editor's
// messages: a stage editor that names the interview's shared words (see
// `SharedStageWording`) would otherwise import itself.
const messages = defineMessages({
  interfaceTextGroup: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextGroup',
    defaultMessage:
      '{group, select, navigation {Interview navigation} interviewer {Interviewer controls} buttons {Buttons} messages {Messages} search {Search} passphrase {Passphrase} forms {Forms} validation {Validation messages} familyTreeView {Family tree view} familyPedigree {Family Pedigree} narrativePedigree {Narrative Pedigree} categoricalBin {Categorical Bin} quickAdd {Name Generator (quick add)} networkComposer {Network Composer} narrative {Narrative} geospatial {Geospatial} other {{group}}}',
    description:
      'Names a group of the words the interview itself shows, such as its buttons and messages, where they are listed for translation. group is which: those for moving through the interview and leaving it, those only an interviewer uses (leaving a review, showing a hidden screen), the labels of its buttons, its error messages, those of a search box, those shown when answers are protected by a passphrase, those shown with forms, or the messages that say an answer breaks one of its rules. The rest are named for the kind of stage whose every stage shows them: familyTreeView is the controls for viewing a family tree, shared by the Family Pedigree and Narrative Pedigree stages; the others are the stage types Family Pedigree, Narrative Pedigree, Categorical Bin, Name Generator (quick add), Network Composer, Narrative and Geospatial, named as the stage type menu names them.',
  },
  interfaceTextName: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextName',
    defaultMessage:
      '{key, select, exitInterview {Exit button} exitInterviewDescription {Exit explanation} stageError {Screen error message} itemUnavailable {Missing item message} back {Back button} continue {Continue button} cancel {Cancel button} done {Done button} delete {Delete button} yes {Yes answer} no {No answer} save {Save button} dontKnow {Don’t know answer} pauseLayout {Pause layout button} resumeLayout {Resume layout button} error {Error message} externalDataError {External data error message} searchLabel {Search field} searchNoMatch {No results message} passphrase {Passphrase field} choosePassphraseHelp {Passphrase advice} passphraseIncorrect {Wrong passphrase message} protectedAnswersLocked {Locked answers message} protectedAnswersNotSaved {Unsaved answers message} answerUnavailable {Unavailable answer label} answerUnavailableKept {Earlier answer message} confirmPassphrase {Confirm passphrase field} passphraseAccepted {Passphrase accepted message} discardChangesTitle {Discard question} discardChangesDescription {Discard explanation} required {Required answer message} minLength {Too short message} maxLength {Too long message} minValue {Too small message} maxValue {Too large message} minDate {Too early message} maxDate {Too late message} minSelected {Too few chosen message} maxSelected {Too many chosen message} unique {Repeated answer message} differentFrom {Must differ message} sameAs {Must match message} greaterThan {Must be greater message} lessThan {Must be less message} greaterThanOrEqual {Must be at least message} lessThanOrEqual {Must be at most message} copy {Copy button} copied {Copied message} loading {Loading message} unnamed {Unnamed label} exitFailed {Exit failed message} exitReview {Exit review button} exitReviewTitle {Exit review question} exitReviewDescription {Exit review explanation} hiddenScreen {Hidden screen label} outsidePath {Outside path label} showScreenTitle {Show screen question} hiddenScreenDescription {Hidden screen explanation} outsidePathDescription {Outside path explanation} showScreen {Show screen button} passwordPlaceholder {Passphrase field hint} zoomOut {Zoom out button} zoomOutDescription {Zoom out explanation} zoomIn {Zoom in button} zoomInDescription {Zoom in explanation} showWholeFamily {Whole family button} showWholeFamilyDescription {Whole family explanation} pointerToolDescription {Select tool explanation} connectToolDescription {Connect tool explanation} disconnectToolDescription {Disconnect tool explanation} framingControlDescription {Relationship words explanation} undo {Undo button} undoDescription {Undo explanation} redo {Redo button} redoDescription {Redo explanation} skip {Skip button} trackerAllDetails {All details checklist item} placeHere {Place here label} connection {Connection label} addNamePlaceholder {Name box placeholder} pointerTool {Pointer tool button} connectTool {Connect tool button} connectHint {Connect hint} disconnectTool {Disconnect tool button} disconnectHint {Disconnect hint} framingControlLabel {Wording control button} framingChoiceTitle {Wording question} framingChoiceDescription {Wording question explanation} quickAddHint {Quick-add hint} overtakenEditNotice {Warning about an overtaken edit} groupsHeading {Groups tool button} addNodeTooltip {Add node tooltip} automaticLayoutTooltip {Automatic layout tooltip} drawEdgeTooltip {Draw edge tooltip} toggleDrawing {Toggle drawing tooltip} toggleFreezing {Toggle freezing annotations tooltip} resetAnnotations {Reset annotations tooltip} keyHeading {Key heading} hasCondition {Has condition key entry} willDevelop {Will develop key entry} carries {Carries key entry} mayDevelop {May develop key entry} mayCarry {May carry key entry} notKnown {Not known key entry} clearFocus {Clear focus tooltip} offlineNotice {Offline message} mapUnavailable {Map unavailable message} searchFailed {Search failed message} other {{key}}}',
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
      'Last item in the completeness checklist, asking for the required details of every family member. Only used when the stage checks completeness.',
    description:
      'Hint under the setting holding the all details checklist item, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  placeHere: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.placeHere',
    defaultMessage:
      'Button that places the selected node in the bin the participant has opened. Only used when nodes are placed by tapping.',
    description:
      'Hint under the setting holding the place here label, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  connection: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.connection',
    defaultMessage:
      'Title shown when the interviewer selects an edge of a type this stage does not draw, such as one from an earlier stage.',
    description:
      'Hint under the setting holding the connection label, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  pointerTool: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.pointerTool',
    defaultMessage:
      'Name of the toolbar tool for selecting a family member to edit them or add relatives. Shown in its tooltip.',
    description:
      'Hint under the setting holding the pointer tool button, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  connectTool: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.connectTool',
    defaultMessage:
      'Name of the toolbar tool for connecting two family members. Shown in its tooltip.',
    description:
      'Hint under the setting holding the connect tool button, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  connectHint: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.connectHint',
    defaultMessage:
      'Instruction shown on the family tree while the connect tool is in use.',
    description:
      'Hint under the setting holding the connect hint, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  disconnectTool: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.disconnectTool',
    defaultMessage:
      'Name of the toolbar tool for removing a connection. Shown in its tooltip.',
    description:
      'Hint under the setting holding the disconnect tool button, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  disconnectHint: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.disconnectHint',
    defaultMessage:
      'Instruction shown on the family tree while the disconnect tool is in use.',
    description:
      'Hint under the setting holding the disconnect hint, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  framingControlLabel: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.framingControlLabel',
    defaultMessage:
      'Name of the toolbar button for changing the words used for family members, shown in its tooltip. Only used when participants choose the words.',
    description:
      'Hint under the setting holding the wording control button, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  framingChoiceTitle: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.framingChoiceTitle',
    defaultMessage:
      'Question asking the participant which words to use for family members. Only used when participants choose the words.',
    description:
      'Hint under the setting holding the wording question, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  framingChoiceDescription: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.framingChoiceDescription',
    defaultMessage:
      'Explanation under the question about which words to use. Only used when participants choose the words.',
    description:
      'Hint under the setting holding the explanation under the wording question, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  quickAddHint: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.quickAddHint',
    defaultMessage:
      'Tooltip that appears above the quick-add box after a few seconds without typing, telling the participant how to finish adding a node. No longer shown once the participant has added a node.',
    description:
      'Hint under the setting holding the quick-add hint, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  addNamePlaceholder: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.addNamePlaceholder',
    defaultMessage:
      'Placeholder in the box where the interviewer types a new node’s name, shown until they start typing.',
    description:
      'Hint under the setting holding the name box placeholder, among the words every Network Composer stage shares, in the Customize built-in wording section of its stage editor. It tells the researcher where the interviewer sees this text and what it is for. The interviewer, not the participant, uses this stage.',
  },
  overtakenEditNotice: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.overtakenEditNotice',
    defaultMessage:
      'Shown in the dialog that asks whether to discard changes, if an undo or redo changed the answer the interviewer was editing. Only used when the stage has a form for nodes or edges.',
    description:
      'Hint under the setting holding the warning about an overtaken edit, among the words every Network Composer stage shares, in the Customize built-in wording section of its stage editor. It tells the researcher where the interviewer sees this text and what it is for. The interviewer, not the participant, uses this stage.',
  },
  groupsHeading: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.groupsHeading',
    defaultMessage:
      'Name of the tool that puts nodes in groups, shown in its tooltip. Only used when a canvas groups nodes.',
    description:
      'Hint under the setting holding the groups tool button, among the words every Network Composer stage shares, in the Customize built-in wording section of its stage editor. It tells the researcher where the interviewer sees this text and what it is for. The interviewer, not the participant, uses this stage.',
  },
  addNodeTooltip: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.addNodeTooltip',
    defaultMessage: 'Tooltip for the tool that adds a node to the canvas.',
    description:
      'Hint under the setting holding the add node tooltip, among the words every Network Composer stage shares, in the Customize built-in wording section of its stage editor. It tells the researcher where the interviewer sees this text and what it is for. The interviewer, not the participant, uses this stage.',
  },
  automaticLayoutTooltip: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.automaticLayoutTooltip',
    defaultMessage: 'Tooltip for the automatic layout tool.',
    description:
      'Hint under the setting holding the automatic layout tooltip, among the words every Network Composer stage shares, in the Customize built-in wording section of its stage editor. It tells the researcher where the interviewer sees this text and what it is for. The interviewer, not the participant, uses this stage.',
  },
  drawEdgeTooltip: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.drawEdgeTooltip',
    defaultMessage:
      'Tooltip for the tool that draws an edge between two nodes. Only used when a canvas has edge types.',
    description:
      'Hint under the setting holding the draw edge tooltip, among the words every Network Composer stage shares, in the Customize built-in wording section of its stage editor. It tells the researcher where the interviewer sees this text and what it is for. The interviewer, not the participant, uses this stage.',
  },
  toggleDrawing: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.toggleDrawing',
    defaultMessage:
      'Tooltip for the button that turns drawing on the canvas on and off. Only used when a stage allows drawing.',
    description:
      'Hint under the setting holding the toggle drawing tooltip, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  toggleFreezing: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.toggleFreezing',
    defaultMessage:
      'Tooltip for the button that keeps drawings on the canvas, or lets them fade again. Only used when a stage allows drawing.',
    description:
      'Hint under the setting holding the toggle freezing annotations tooltip, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  resetAnnotations: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.resetAnnotations',
    defaultMessage:
      'Tooltip for the button that removes all drawings. Only used when a stage allows drawing.',
    description:
      'Hint under the setting holding the reset annotations tooltip, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  keyHeading: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.keyHeading',
    defaultMessage:
      'Heading of the key that explains the symbols on the pedigree.',
    description:
      'Hint under the setting holding the key heading, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  hasCondition: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.hasCondition',
    defaultMessage:
      'Key entry for family members who have the selected condition.',
    description:
      'Hint under the setting holding the has condition key entry, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  willDevelop: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.willDevelop',
    defaultMessage:
      'Key entry for family members who will develop the selected condition.',
    description:
      'Hint under the setting holding the will develop key entry, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  carries: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.carries',
    defaultMessage:
      'Key entry for family members who carry the selected condition.',
    description:
      'Hint under the setting holding the carries key entry, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  mayDevelop: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.mayDevelop',
    defaultMessage:
      'Key entry for family members who may develop the selected condition. Only used when a pedigree shows at-risk statuses.',
    description:
      'Hint under the setting holding the may develop key entry, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  mayCarry: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.mayCarry',
    defaultMessage:
      'Key entry for family members who may carry the selected condition. Only used when a pedigree shows at-risk statuses.',
    description:
      'Hint under the setting holding the may carry key entry, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  notKnown: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.notKnown',
    defaultMessage:
      'Key entry for family members whose status for the selected condition is not known.',
    description:
      'Hint under the setting holding the not known key entry, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  clearFocus: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.clearFocus',
    defaultMessage:
      'Tooltip for the button that clears the selected family member.',
    description:
      'Hint under the setting holding the clear focus tooltip, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  offlineNotice: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.offlineNotice',
    defaultMessage:
      'Shown while the device is offline, because the map cannot load without a connection.',
    description:
      'Hint under the setting holding the offline message, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  mapUnavailable: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.mapUnavailable',
    defaultMessage:
      'Shown in place of the map when it cannot be drawn, and says what to try.',
    description:
      'Hint under the setting holding the map unavailable message, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  searchFailed: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextHint.searchFailed',
    defaultMessage:
      'Shown when a map search could not run. It does not mean the place does not exist.',
    description:
      'Hint under the setting holding the search failed message, among the words every stage of one kind shares, in the Customize built-in wording section of a stage editor. It tells the researcher where the participant sees this text and what it is for.',
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
