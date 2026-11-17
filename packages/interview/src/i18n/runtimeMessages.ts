import { defineMessages } from '@codaco/app-i18n/messages';

export const runtimeMessages = defineMessages({
  itemUnavailable: {
    id: 'interview.runtime.itemUnavailable',
    defaultMessage: 'This item could not be displayed.',
    description: 'Fallback when protocol-provided media cannot be displayed.',
  },
  copied: {
    id: 'interview.runtime.copied',
    defaultMessage: 'Copied',
    description:
      'Label the button under the interview error message changes to for a moment once it has copied the debug information, and the screen-reader announcement that the copy happened. Past tense of the Copy button label.',
  },
  copy: {
    id: 'interview.runtime.copy',
    defaultMessage: 'Copy',
    description:
      'Label of the button under the interview error message that copies the debug information the participant can send to the study organizer. The message above it calls this “the button below”.',
  },
  choosePassphraseHelp: {
    id: 'interview.runtime.choosePassphraseHelp',
    defaultMessage:
      'Some answers on this screen are protected by a passphrase. Keep it safe: you will need it to see or change these answers later, and it cannot be recovered if it is forgotten.',
    description:
      'Instructions in the passphrase dialog and on the passphrase screen, whether the participant is choosing the interview passphrase or entering the one already chosen. It must not suggest that anyone can recover or reset a forgotten passphrase, because no one can.',
  },
  unnamed: {
    id: 'interview.runtime.unnamed',
    defaultMessage: 'Unnamed',
    description:
      'Label shown on, and read out for, a person or other item the participant added without giving it a name.',
  },
  connection: {
    id: 'interview.runtime.connection',
    defaultMessage: 'Connection',
    description:
      'Title of the panel for a connection between two people or other items on the canvas, shown when the task gives that kind of connection no name of its own.',
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
      'This answer was saved earlier but cannot be shown here. Entering a new answer will replace it, so leave the field empty to keep the earlier answer.',
    description:
      'Explains, under a question whose earlier protected answer can no longer be shown, that the earlier answer is kept unless the participant enters a new one to replace it. Shown in both the read-only and the replacing state.',
  },
  passphrase: {
    id: 'interview.runtime.passphrase',
    defaultMessage: 'Passphrase',
    description:
      'Label of the secret phrase input used to decrypt interview data.',
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
  protectedAnswersNotSaved: {
    id: 'interview.runtime.protectedAnswersNotSaved',
    defaultMessage:
      'Your answers have not been saved. Enter your passphrase, then try again.',
    description:
      'Error when answers protected by the interview passphrase could not be saved because no working passphrase has been entered.',
  },
  taskErrorDescription: {
    id: 'interview.runtime.taskErrorDescription',
    // Markdown: the blank lines separate the heading and paragraphs.
    /* oxlint-disable formatjs/no-multiple-whitespaces */
    defaultMessage:
      '# There was an error\n\nThere was an error with the interview software, and this task could not be displayed.\n\nSome tasks, such as maps, need an internet connection, so check your connection and then try refreshing the page.\n\nIf the problem persists, please contact the study organizer and send them the debug information, which you can copy with the button below. You may be able to continue your interview by clicking the next button.',
    /* oxlint-enable formatjs/no-multiple-whitespaces */
    description:
      'Recovery instructions when an interview screen cannot be displayed, whether from a crash or a lost connection, written in markdown: a heading line starting with “# ” and three paragraphs separated by blank lines. Keep the markdown. The copy button is shown below this text.',
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
  noSearchMatch: {
    id: 'interview.runtime.noSearchMatch',
    defaultMessage: 'Nothing matched your search term.',
    description: 'Empty result after searching the interview screen list.',
  },
});
