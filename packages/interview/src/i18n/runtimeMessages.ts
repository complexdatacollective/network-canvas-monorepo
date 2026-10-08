import { defineMessages } from '@codaco/app-i18n/messages';

export const runtimeMessages = defineMessages({
  finishConfirmationDescription: {
    id: 'interview.runtime.finishConfirmationDescription',
    defaultMessage:
      'Finish this interview only when you are satisfied with your responses.',
    description:
      'Default finish confirmation; the host may supply its own context-specific explanation.',
  },
  unplacedCount: {
    id: 'interview.runtime.unplacedCount',
    defaultMessage: '{count, number} unplaced',
    description:
      'Number of items in the tray that have not yet been placed on the canvas.',
  },
  addPerson: {
    id: 'interview.runtime.addPerson',
    defaultMessage: 'Add a person',
    description:
      'Accessible action that adds a person to the current interview task.',
  },
  loadingVideo: {
    id: 'interview.runtime.loadingVideo',
    defaultMessage: 'Loading video...',
    description: 'Status while a protocol-provided video is loading.',
  },
  videoUnavailable: {
    id: 'interview.runtime.videoUnavailable',
    defaultMessage: 'Video could not be loaded.',
    description: 'Error when a protocol-provided video cannot load.',
  },
  itemUnavailable: {
    id: 'interview.runtime.itemUnavailable',
    defaultMessage: 'This item could not be displayed.',
    description: 'Fallback when protocol-provided media cannot be displayed.',
  },
  copied: {
    id: 'interview.runtime.copied',
    defaultMessage: 'Copied!',
    description:
      'Confirmation that interview diagnostic information was copied.',
  },
  copyDebugInfo: {
    id: 'interview.runtime.copyDebugInfo',
    defaultMessage: 'Copy Debug Info',
    description:
      'Button that copies interview error details for the study organizer.',
  },
  offlineMap: {
    id: 'interview.runtime.offlineMap',
    defaultMessage:
      'You are offline — the map will not load until you reconnect.',
    description: 'Persistent message while a map screen cannot load offline.',
  },
  canvas: {
    id: 'interview.runtime.canvas',
    defaultMessage: 'Placement area',
    description: 'Announced name of the area where items can be positioned.',
  },
  deleteBin: {
    id: 'interview.runtime.deleteBin',
    defaultMessage: 'Delete bin',
    description: 'Announced name of the drop target that deletes an item.',
  },
  drawer: {
    id: 'interview.runtime.drawer',
    defaultMessage: 'Drawer',
    description:
      'Announced name of the tray containing items that can be placed.',
  },
  collapseDrawer: {
    id: 'interview.runtime.collapseDrawer',
    defaultMessage: 'Collapse drawer',
    description: 'Accessible action that folds the item tray closed.',
  },
  expandDrawer: {
    id: 'interview.runtime.expandDrawer',
    defaultMessage: 'Expand drawer',
    description: 'Accessible action that expands the item tray.',
  },
  dropToRemove: {
    id: 'interview.runtime.dropToRemove',
    defaultMessage: 'Drop here to remove',
    description:
      'Hint shown on the tray when dropping an item removes its position.',
  },
  nodeList: {
    id: 'interview.runtime.nodeList',
    defaultMessage: 'Item list',
    description: 'Accessible name for a list of people or other items.',
  },
  firstNode: {
    id: 'interview.runtime.firstNode',
    defaultMessage: 'First item',
    description:
      'Fallback accessible name for the first item when its name is missing.',
  },
  secondNode: {
    id: 'interview.runtime.secondNode',
    defaultMessage: 'second item',
    description:
      'Fallback accessible name for the second item when its name is missing.',
  },
  passphraseNeeded: {
    id: 'interview.runtime.passphraseNeeded',
    defaultMessage:
      'Your passphrase is needed to show data on this screen. Click here to enter it.',
    description:
      'Explains why a passphrase is needed to reveal data on the current screen.',
  },
  enterPassphrase: {
    id: 'interview.runtime.enterPassphrase',
    defaultMessage: 'Enter your passphrase',
    description: 'Title of the dialog for revealing encrypted interview data.',
  },
  submitPassphrase: {
    id: 'interview.runtime.submitPassphrase',
    defaultMessage: 'Submit passphrase',
    description: 'Action that submits a passphrase to decrypt interview data.',
  },
  choosePassphrase: {
    id: 'interview.runtime.choosePassphrase',
    defaultMessage: 'Choose a passphrase',
    description:
      'Title of the dialog in which the participant chooses the passphrase that will protect some of their answers, when none has been chosen yet in this interview.',
  },
  choosePassphraseHelp: {
    id: 'interview.runtime.choosePassphraseHelp',
    defaultMessage:
      'Some answers on this screen are protected by a passphrase. Choose one, and keep it safe: you will need it to see or change these answers later, and it cannot be recovered if it is forgotten.',
    description:
      'Instructions in the dialog for choosing the interview passphrase, explaining that it cannot be recovered.',
  },
  enterChosenPassphrase: {
    id: 'interview.runtime.enterChosenPassphrase',
    defaultMessage:
      'You chose a passphrase earlier in this interview. Enter it to continue.',
    description:
      'Shown on the passphrase screen when the participant already chose a passphrase earlier in this interview and needs to enter it again.',
  },
  checkingPassphrase: {
    id: 'interview.runtime.checkingPassphrase',
    defaultMessage: 'Checking your passphrase…',
    description:
      'Status shown and announced while an entered passphrase is being checked, which can take a few seconds.',
  },
  answerUnavailable: {
    id: 'interview.runtime.answerUnavailable',
    defaultMessage: 'Answer unavailable',
    description:
      'Shown in place of a protected answer, such as a name, that was saved earlier but can no longer be shown.',
  },
  answerUnavailableKept: {
    id: 'interview.runtime.answerUnavailableKept',
    defaultMessage:
      'This answer was saved earlier but cannot be shown here. It will be kept as it is unless you enter a new one.',
    description:
      'Explains, under a question whose earlier protected answer can no longer be shown, that the earlier answer is kept unless the participant replaces it.',
  },
  replaceUnavailableAnswer: {
    id: 'interview.runtime.replaceUnavailableAnswer',
    defaultMessage: 'Enter a new answer',
    description:
      'Button beside an earlier answer that can no longer be shown, which lets the participant type a new answer to replace it.',
  },
  replacingUnavailableAnswer: {
    id: 'interview.runtime.replacingUnavailableAnswer',
    defaultMessage:
      'Your new answer will replace the earlier one, which cannot be shown. Leave this empty to keep the earlier answer.',
    description:
      'Hint under a question the participant chose to answer again because its earlier protected answer can no longer be shown.',
  },
  passphraseHelp: {
    id: 'interview.runtime.passphraseHelp',
    defaultMessage:
      'Enter the passphrase you chose earlier in this interview to see and change the answers on this screen. A passphrase cannot be recovered if it is forgotten.',
    description:
      'Instructions in the dialog for entering the passphrase chosen earlier in this interview. It must not suggest that anyone can recover or reset a forgotten passphrase, because no one can.',
  },
  passphrase: {
    id: 'interview.runtime.passphrase',
    defaultMessage: 'Passphrase',
    description:
      'Label of the secret phrase input used to decrypt interview data.',
  },
  passphrasePlaceholder: {
    id: 'interview.runtime.passphrasePlaceholder',
    defaultMessage: 'Enter your passphrase...',
    description: 'Placeholder for the interview decryption passphrase input.',
  },
  passphraseIncorrect: {
    id: 'interview.runtime.passphraseIncorrect',
    defaultMessage:
      'This passphrase does not match the one used earlier in this interview. Check it and try again.',
    description:
      'Inline error under the passphrase input when the entered passphrase cannot unlock the information already saved in the interview.',
  },
  protectedAnswersLocked: {
    id: 'interview.runtime.protectedAnswersLocked',
    defaultMessage:
      'Some answers here are protected by your passphrase. Enter your passphrase to see and change them.',
    description:
      'Shown in place of questions whose answers are protected by the interview passphrase, and as a brief notice when such an answer is asked for, until that passphrase is entered.',
  },
  protectedAnswersUnavailable: {
    id: 'interview.runtime.protectedAnswersUnavailable',
    defaultMessage:
      'Answers protected by a passphrase cannot be shown or saved in this interview. Please let the person who recruited you to this study know.',
    description:
      'Shown in place of questions whose answers are protected by a passphrase, and on the passphrase screen, when the information this interview needs to check a passphrase is damaged, so no passphrase can be entered.',
  },
  protectedAnswersNotSaved: {
    id: 'interview.runtime.protectedAnswersNotSaved',
    defaultMessage:
      'Your answers have not been saved. Enter your passphrase, then try again.',
    description:
      'Error when answers protected by the interview passphrase could not be saved because no working passphrase has been entered.',
  },
  protectedAnswersNotChecked: {
    id: 'interview.runtime.protectedAnswersNotChecked',
    defaultMessage:
      'This answer is checked against answers protected by your passphrase. Enter your passphrase, then try again.',
    description:
      'Error under a question whose answer must be compared with answers protected by the interview passphrase, shown until that passphrase is entered.',
  },
  offlineTaskTitle: {
    id: 'interview.runtime.offlineTaskTitle',
    defaultMessage: 'This task needs an internet connection',
    description: 'Error heading when an interview task cannot run offline.',
  },
  offlineTaskDescription: {
    id: 'interview.runtime.offlineTaskDescription',
    defaultMessage:
      'You appear to be offline, and this task could not be displayed. Some tasks (such as maps) need a connection. Check your connection and refresh the page. You may be able to continue by selecting the next arrow. If the problem persists once you are back online, please contact the study organizer and provide the debug information below.',
    description:
      'Recovery instructions when an interview task cannot be displayed without a network connection.',
  },
  taskErrorTitle: {
    id: 'interview.runtime.taskErrorTitle',
    defaultMessage: 'A problem occurred!',
    description: 'Heading when an interview screen cannot be rendered.',
  },
  taskErrorDescription: {
    id: 'interview.runtime.taskErrorDescription',
    defaultMessage:
      'There was an error with the interview software, and this task could not be displayed. Try refreshing the page. If the problem persists, please contact the study organizer and provide the debug information below. You may be able to continue your interview by clicking the next button.',
    description:
      'Recovery instructions for an unexpected interview screen failure.',
  },
  hiddenByAnswers: {
    id: 'interview.runtime.hiddenByAnswers',
    defaultMessage: 'Hidden by answers',
    description:
      'Status on a screen unavailable because of answers given so far.',
  },
  outsideCurrentPath: {
    id: 'interview.runtime.outsideCurrentPath',
    defaultMessage: 'Outside current path',
    description:
      'Status on a screen outside the currently selected interview path.',
  },
  interviewScreens: {
    id: 'interview.runtime.interviewScreens',
    defaultMessage: 'Interview screens',
    description: 'Accessible name of the interview screen navigation list.',
  },
  noSearchMatch: {
    id: 'interview.runtime.noSearchMatch',
    defaultMessage: 'Nothing matched your search term.',
    description: 'Empty result after searching the interview screen list.',
  },
  filter: {
    id: 'interview.runtime.filter',
    defaultMessage: 'Filter...',
    description:
      'Placeholder for filtering the interview screen navigation list.',
  },
  minimumItems: {
    id: 'interview.runtime.minimumItems',
    defaultMessage:
      'You must create at least <strong>{count, number}</strong> {count, plural, one {item} other {items}} before you can continue.',
    description:
      'Blocking message when too few items have been created; emphasize the minimum count.',
  },
  taskComplete: {
    id: 'interview.runtime.taskComplete',
    defaultMessage:
      'You have completed this task. Click the next arrow to continue.',
    description:
      'Notification that the maximum item count is reached and the participant can continue.',
  },
  submissionFailed: {
    id: 'interview.runtime.submissionFailed',
    defaultMessage: 'An error occurred while submitting the form.',
    description:
      'Generic form error when no submit handler exists or it throws unexpectedly.',
  },
  finishFailed: {
    id: 'interview.runtime.finishFailed',
    defaultMessage:
      'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
    description:
      'Recoverable finish-dialog error after saving pending answers or the host finish request fails; no claim is made that all responses have been submitted.',
  },
  notifications: {
    id: 'interview.runtime.notifications',
    defaultMessage: 'Interview notifications',
    description: 'Accessible name of the interview notification region.',
  },
  unnamedRosterItem: {
    id: 'interview.runtime.unnamedRosterItem',
    defaultMessage: 'Unnamed {subject} {number, number}',
    description:
      'Fallback label for an external-roster item with no usable name; subject is protocol-authored and number is a stable position.',
  },
});
