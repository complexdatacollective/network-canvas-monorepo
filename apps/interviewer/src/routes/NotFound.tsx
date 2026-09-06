import { useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const messages = defineMessages({
  pageNotFound: {
    id: 'interviewer.notFound.pageNotFound',
    defaultMessage: 'Page not found',
    description: 'Visible copy in Interviewer Not Found.',
  },
  thePageYouWereLookingForDoes: {
    id: 'interviewer.notFound.thePageYouWereLookingForDoes',
    defaultMessage: 'The page you were looking for does not exist.',
    description: 'Visible copy in Interviewer Not Found.',
  },
  returnHome: {
    id: 'interviewer.notFound.returnHome',
    defaultMessage: 'Return home',
    description: 'Visible copy in Interviewer Not Found.',
  },
});

export function NotFoundRoute() {
  const intl = useAppIntl();
  const [, navigate] = useLocation();
  return (
    <div className="mx-auto flex h-full max-w-xl items-center justify-center p-8">
      <Surface
        floating
        spacing="lg"
        shadow="lg"
        className="flex flex-col items-center gap-4 text-center"
      >
        <Heading level="h1">
          {intl.formatMessage(messages.pageNotFound)}
        </Heading>
        <Paragraph>
          {intl.formatMessage(messages.thePageYouWereLookingForDoes)}
        </Paragraph>
        <Button onClick={() => navigate('/')}>
          {intl.formatMessage(messages.returnHome)}
        </Button>
      </Surface>
    </div>
  );
}
