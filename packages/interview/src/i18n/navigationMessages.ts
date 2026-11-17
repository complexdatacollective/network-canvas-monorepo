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
  exitFailed: {
    id: 'interview.navigation.exitFailed',
    defaultMessage:
      'Your answers could not be saved, so the interview has not been closed. Please try again. If the problem continues, contact the study organizer.',
    description:
      'Recoverable exit-dialog error when pending answers or the interview language could not be saved before leaving; the interview stays open.',
  },
});
