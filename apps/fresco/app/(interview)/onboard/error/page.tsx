import { defineMessages } from '@codaco/app-i18n/messages';
import { getServerIntl } from '~/i18n/server';

import { ErrorMessage } from '../../interview/_components/ErrorMessage';

const messages = defineMessages({
  title: {
    id: 'fresco.onboard.error.title',
    defaultMessage: 'Something went wrong during onboarding',
    description:
      'Heading of the page shown to a participant when starting their interview from a study link failed unexpectedly.',
  },
  message: {
    id: 'fresco.onboard.error.message',
    defaultMessage:
      'There was a problem during onboarding. Please contact the person who recruited you to this study for assistance.',
    description:
      'Message under the "Something went wrong during onboarding" heading, telling the participant to ask the person who recruited them for help.',
  },
});

export default async function Page() {
  const intl = await getServerIntl();

  return (
    <ErrorMessage
      title={intl.formatMessage(messages.title)}
      message={intl.formatMessage(messages.message)}
    />
  );
}
