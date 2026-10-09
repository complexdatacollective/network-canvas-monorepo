import { defineMessages } from '@codaco/app-i18n/messages';
import { getServerIntl } from '~/i18n/server';

import { ErrorMessage } from '../../interview/_components/ErrorMessage';

const messages = defineMessages({
  title: {
    id: 'fresco.onboard.noAnonymousRecruitment.title',
    defaultMessage: 'Anonymous recruitment disabled',
    description:
      'Heading of the page shown when someone opens a study link that does not name a participant, but the study only admits named participants.',
  },
  message: {
    id: 'fresco.onboard.noAnonymousRecruitment.message',
    defaultMessage:
      'Anonymous recruitment is disabled for this study. Researchers may optionally enable anonymous recruitment from the dashboard.',
    description:
      'Message under the "Anonymous recruitment disabled" heading. Written for the researcher who runs the study: anonymous recruitment is a study setting they can turn on from the Fresco dashboard.',
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
