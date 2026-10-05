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
  copyClipboard: {
    id: 'interview.runtime.copyClipboard',
    defaultMessage: 'Copy to clipboard',
    description:
      'Tooltip for copying diagnostic information about an interview error.',
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
  decryptRetry: {
    id: 'interview.runtime.decryptRetry',
    defaultMessage:
      'There was a problem decrypting the data. Please re-enter your passphrase.',
    description:
      'Message asking for another passphrase after decryption fails.',
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
    defaultMessage: 'Enter your Passphrase',
    description: 'Title of the dialog for revealing encrypted interview data.',
  },
  submitPassphrase: {
    id: 'interview.runtime.submitPassphrase',
    defaultMessage: 'Submit passphrase',
    description: 'Action that submits a passphrase to decrypt interview data.',
  },
  decryptFailed: {
    id: 'interview.runtime.decryptFailed',
    defaultMessage:
      'There was an error decrypting the data with the passphrase entered. Please try again.',
    description:
      'Error after the entered passphrase could not decrypt the data.',
  },
  passphraseHelp: {
    id: 'interview.runtime.passphraseHelp',
    defaultMessage:
      'Enter your passphrase in order to unlock the data on this screen. If you cannot remember your passphrase, please contact the person who recruited you to this study.',
    description:
      'Instructions for unlocking encrypted data and finding help if the passphrase is forgotten.',
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
  untitledStage: {
    id: 'interview.runtime.untitledStage',
    defaultMessage: 'Untitled stage',
    description: 'Fallback for an interview screen with no authored label.',
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
