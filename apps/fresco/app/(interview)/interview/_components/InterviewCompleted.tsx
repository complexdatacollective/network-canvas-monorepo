'use client';

import { BadgeCheck } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export default function InterviewCompleted() {
  return (
    <Surface className="flex h-screen flex-col items-center justify-center">
      <BadgeCheck className="text-sea-green mb-4 size-12" aria-hidden />
      <Heading level="h1">
        <AppMessage message={messages.title} />
      </Heading>
      <Paragraph>
        <AppMessage message={messages.message} />
      </Paragraph>
    </Surface>
  );
}

const messages = defineMessages({
  message: {
    id: 'fresco.participantPages.interviewCompleted.message',
    defaultMessage: 'Your interview has been successfully completed.',
    description:
      'Participant-facing confirmation shown once an interview has been finished.',
  },

  title: {
    id: 'fresco.participantPages.interviewCompleted.title',
    defaultMessage: 'Thank you for participating!',
    description:
      'Participant-facing heading shown once an interview has been finished.',
  },
});
