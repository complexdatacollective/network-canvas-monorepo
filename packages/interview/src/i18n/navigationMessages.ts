import { defineMessages } from '@codaco/app-i18n/messages';

export const navigationMessages = defineMessages({
  showTitle: {
    id: 'interview.navigation.showTitle',
    defaultMessage: 'Show this screen?',
    description:
      'Confirmation title before opening an interview screen hidden by earlier answers.',
  },
  hiddenScreen: {
    id: 'interview.navigation.hiddenScreen',
    defaultMessage:
      'This screen is hidden based on the answers given so far. Do you want to show it anyway?',
    description:
      'Explains why an interview screen is hidden before overriding that navigation rule.',
  },
  outsidePath: {
    id: 'interview.navigation.outsidePath',
    defaultMessage:
      'This screen is outside the current interview path based on the answers given so far. Do you want to show it anyway?',
    description:
      'Explains that a screen is outside the current answer-dependent path before opening it.',
  },
  showScreen: {
    id: 'interview.navigation.showScreen',
    defaultMessage: 'Show screen',
    description: 'Action that opens an otherwise unavailable interview screen.',
  },
  exitReviewTitle: {
    id: 'interview.navigation.exitReviewTitle',
    defaultMessage: 'Exit this review?',
    description: 'Confirmation title before leaving an interview review.',
  },
  exitInterviewTitle: {
    id: 'interview.navigation.exitInterviewTitle',
    defaultMessage: 'Exit this interview?',
    description: 'Confirmation title before leaving an unfinished interview.',
  },
  exitReviewDescription: {
    id: 'interview.navigation.exitReviewDescription',
    defaultMessage: 'Changes made during this review will not be saved.',
    description:
      'Explains the temporary nature of answers changed in review mode.',
  },
  exitInterviewDescription: {
    id: 'interview.navigation.exitInterviewDescription',
    defaultMessage:
      'Your answers so far will be saved and you can continue later.',
    description:
      'Reassures the participant that exiting preserves their answers for resuming.',
  },
  exitReview: {
    id: 'interview.navigation.exitReview',
    defaultMessage: 'Exit review',
    description: 'Action to leave the temporary interview review.',
  },
  exitInterview: {
    id: 'interview.navigation.exitInterview',
    defaultMessage: 'Exit interview',
    description:
      'Action to leave an unfinished interview while preserving answers.',
  },
  settings: {
    id: 'interview.navigation.settings',
    defaultMessage: 'Settings',
    description: 'Accessible name of the interview settings button.',
  },
  interviewSettings: {
    id: 'interview.navigation.interviewSettings',
    defaultMessage: 'Interview settings',
    description:
      'Accessible name of the settings popover inside a running interview.',
  },
  textSize: {
    id: 'interview.navigation.textSize',
    defaultMessage: 'Text size<hidden> percentage</hidden>',
    description:
      'Legend for the text-size input; hidden adds the percentage unit for screen readers.',
  },
  decreaseTextSize: {
    id: 'interview.navigation.decreaseTextSize',
    defaultMessage: 'Decrease text size',
    description: 'Accessible action that decreases interview text size.',
  },
  increaseTextSize: {
    id: 'interview.navigation.increaseTextSize',
    defaultMessage: 'Increase text size',
    description: 'Accessible action that increases interview text size.',
  },
  currentTextSize: {
    id: 'interview.navigation.currentTextSize',
    defaultMessage: 'Current text size: {size, number, ::percent}',
    description:
      'Screen-reader announcement after the participant changes text size; size is a multiplier.',
  },
  previousStep: {
    id: 'interview.navigation.previousStep',
    defaultMessage: 'Previous Step',
    description:
      'Accessible name of the arrow that moves to the previous interview screen.',
  },
  nextStep: {
    id: 'interview.navigation.nextStep',
    defaultMessage: 'Next Step',
    description:
      'Accessible name of the arrow that moves to the next interview screen.',
  },
  goToScreen: {
    id: 'interview.navigation.goToScreen',
    defaultMessage: 'Go to another screen',
    description:
      'Accessible name for opening the interview screen navigation drawer.',
  },
  interfaceLanguage: {
    id: 'interview.navigation.interfaceLanguage',
    defaultMessage: 'Interface language',
    description:
      "Label for the language of the interview package's built-in controls; protocol text is separate.",
  },
  automaticLanguage: {
    id: 'interview.navigation.automaticLanguage',
    defaultMessage: 'Automatic',
    description:
      "Language option that follows the host's requested interface language.",
  },
});
