import type { ErrorComponentProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import { DEFAULT_SKIP_TARGET_ID } from '@codaco/fresco-ui/layout/AppFrame';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { ServerUnreachableError } from '../lib/session.ts';
import { useInsideAreaMain } from '../shell/AreaMain.tsx';

const CENTRED = 'flex h-full items-center justify-center p-4';

/**
 * The landmark this screen contributes, which depends on where the router put
 * it (§7.1).
 *
 * The error component replaces the match that failed and nothing else, so an
 * error thrown below an area layout renders inside the `<main>` that layout is
 * still supplying, while an error thrown BY an area layout — or by the app
 * layout, or on a focused, site or participant route — renders where no
 * `<main>` exists at all. A landmark of its own is right in the second case and
 * wrong in the first: nested mains give the skip link two candidates and it
 * takes the outer one.
 *
 * The id is the skip link's target, not decoration. Without it an area layout
 * that fails takes the shell's only bypass target away with it, leaving a
 * header the keyboard has to walk through with nothing to skip to.
 */
function ErrorLandmark({ children }: { children: ReactNode }) {
  const insideAreaMain = useInsideAreaMain();

  if (insideAreaMain) return <div className={CENTRED}>{children}</div>;
  return (
    <main id={DEFAULT_SKIP_TARGET_ID} className={CENTRED}>
      {children}
    </main>
  );
}

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
  loadFailed: {
    id: 'studio.errorScreen.loadFailed',
    defaultMessage: 'This page could not be loaded. Reload to try again.',
    description:
      'Error-screen explanation for any failure other than an unreachable server.',
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
  const unreachable = error instanceof ServerUnreachableError;
  return (
    <ErrorLandmark>
      <Surface maxWidth="xl" spacing="lg">
        {/*
          A route that fails is still a route change, and this heading is what
          §7.2's landing lands on. Without it the researcher who navigated into
          a failure keeps focus on `<body>` and their screen reader is told
          nothing at all — the one arrival where saying nothing is worst.
        */}
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph role="alert">
          {intl.formatMessage(
            unreachable ? messages.serverUnreachable : messages.loadFailed,
          )}
        </Paragraph>
        <Button onClick={() => window.location.reload()}>
          {intl.formatMessage(messages.reload)}
        </Button>
      </Surface>
    </ErrorLandmark>
  );
}
