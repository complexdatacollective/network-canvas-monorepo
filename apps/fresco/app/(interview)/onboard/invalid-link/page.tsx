import { defineMessages } from '@codaco/app-i18n/messages';
import { getServerIntl } from '~/i18n/server';

import { ErrorMessage } from '../../interview/_components/ErrorMessage';

const messages = defineMessages({
  title: {
    id: 'fresco.onboard.invalidLink.title',
    defaultMessage: 'This interview link is no longer valid',
    description:
      'Heading of the page shown to a participant who opened an interview link for a study that no longer exists.',
  },
  message: {
    id: 'fresco.onboard.invalidLink.message',
    defaultMessage:
      'The study this link points to is not available. Please contact the person who recruited you to this study for assistance.',
    description:
      'Message under the "This interview link is no longer valid" heading, telling the participant to ask the person who recruited them for help.',
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
