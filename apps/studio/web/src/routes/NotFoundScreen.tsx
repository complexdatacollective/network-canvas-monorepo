import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ScreenMain from '../shell/ScreenMain.tsx';

const messages = defineMessages({
  heading: {
    id: 'studio.notFound.heading',
    defaultMessage: 'Page not available',
    description:
      'Heading of the screen shown for an address this instance does not serve.',
  },
  description: {
    id: 'studio.notFound.description',
    defaultMessage: 'This page is not available on this instance.',
    description:
      'Explanation on the not-found screen. One instance may be a managed one and another self-hosted, and each serves pages the other does not, so the sentence says "on this instance" rather than claiming the page does not exist at all.',
  },
});

/**
 * The root route's `notFoundComponent`: what a researcher sees at an address
 * this deployment does not serve.
 *
 * Two things reach it, and the same sentence is honest about both. A URL that
 * matches no route at all — a typo, or a link from a build that had one more
 * screen than this one. And a route the topology gate refused
 * (`lib/deployment.ts`): the page exists in the product, and not on the
 * instance the researcher is looking at.
 *
 * Mounted on the ROOT route deliberately, so a refusal anywhere in the tree
 * renders the whole screen rather than a hole inside chrome that still offers
 * navigation to the place that was just refused.
 *
 * It carries the route contract every screen does — its own `<h1>` is the
 * landing point, so focus arrives here and the destination is announced. A
 * refusal is the arrival where saying nothing is worst: without it the
 * researcher who navigated into one keeps focus on `<body>`, and their screen
 * reader is told the page changed and nothing more.
 */
export default function NotFoundScreen() {
  const intl = useAppIntl();

  return (
    <ScreenMain>
      <Surface maxWidth="xl" spacing="lg">
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph>{intl.formatMessage(messages.description)}</Paragraph>
      </Surface>
    </ScreenMain>
  );
}
