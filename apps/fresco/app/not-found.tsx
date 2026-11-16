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
    description:
      'Text shown under the large 404 number on the page displayed when the address does not match any page of the app. May be seen by anyone, including a participant.',
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
