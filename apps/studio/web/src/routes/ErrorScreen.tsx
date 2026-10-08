import type { ErrorComponentProps } from '@tanstack/react-router';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { ServerUnreachableError } from '../lib/serverUnreachable.ts';
import { refusalOf } from '../runtime/errors.ts';
import StatusScreen from '../shell/StatusScreen.tsx';

const messages = defineMessages({
  heading: {
    id: 'studio.errorScreen.heading',
    defaultMessage: 'Something went wrong',
    description:
      'Heading of the whole-route error screen shown when a screen could not load.',
  },
  serverUnreachable: {
    id: 'studio.errorScreen.serverUnreachable',
    defaultMessage:
      'The server could not be reached. Check that it is running, then reload this page.',
    description:
      'Error-screen explanation when the Studio server did not answer at all.',
  },
  maintenance: {
    id: 'studio.errorScreen.maintenance',
    defaultMessage:
      'Studio is down for maintenance. Reload this page in a few minutes.',
    description:
      'Error-screen explanation when the server refused the page because it is down for maintenance.',
  },
  loadFailed: {
    id: 'studio.errorScreen.loadFailed',
    defaultMessage: 'This page could not be loaded. Reload to try again.',
    description:
      'Error-screen explanation for any failure other than an unreachable server or a maintenance window.',
  },
  reload: {
    id: 'studio.errorScreen.reload',
    defaultMessage: 'Reload',
    description: 'Button on the error screen that reloads the page.',
  },
});

// The error message itself is deliberately not shown — an unhandled render
// error's text is for a developer, and this screen is for whoever is holding
// the tab.
export default function ErrorScreen({ error }: ErrorComponentProps) {
  const intl = useAppIntl();
  const explanation =
    error instanceof ServerUnreachableError
      ? messages.serverUnreachable
      : refusalOf(error)?.kind === 'maintenance'
        ? messages.maintenance
        : messages.loadFailed;
  return (
    <StatusScreen
      heading={intl.formatMessage(messages.heading)}
      message={intl.formatMessage(explanation)}
      action={{
        label: intl.formatMessage(messages.reload),
        onPress: () => window.location.reload(),
      }}
    />
  );
}
