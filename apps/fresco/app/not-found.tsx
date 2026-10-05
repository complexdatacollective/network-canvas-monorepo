'use client';

import { FileWarning } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const messages = defineMessages({
  pageNotFound: {
    id: 'fresco.notfound.pageNotFound',
    defaultMessage: 'Page not found.',
    description: 'Researcher-facing notfound: Page not found.',
  },
});

export default function NotFound() {
  const intl = useAppIntl();

  return (
    <div className="bg-surface flex h-screen flex-col items-center justify-center">
      <FileWarning className="text-primary mb-4 size-12" />
      <Heading level="h1">{String(404)}</Heading>
      <Paragraph intent="lead">
        {intl.formatMessage(messages.pageNotFound)}
      </Paragraph>
    </div>
  );
}
