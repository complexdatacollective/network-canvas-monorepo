import { defineMessages } from '@codaco/app-i18n/messages';

// The id stays the one the step button was first written with, so its
// translations carry over.
export const messages = defineMessages({
  skipStep: {
    id: 'interview.familyPedigree.skipStep',
    defaultMessage: 'Skip',
    description:
      'Button in the side panel where a new family member’s details are given, one group of questions at a time. Shown while some questions in the group are left unanswered; it moves on to the next group without answering them. They can still be answered by going back.',
  },
});
