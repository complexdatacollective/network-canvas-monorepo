import { Outlet, useRouterState } from '@tanstack/react-router';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import AppArea from '@codaco/fresco-ui/layout/AppArea';

import AreaMain from './AreaMain.tsx';
import ManifestNav from './ManifestNav.tsx';
import { accountDestinations } from './navigationManifest.ts';

/**
 * The account area layout: the account sidebar and the `<main>` it labels
 * (§5.3, §5.5).
 *
 * Everything here belongs to the researcher rather than to a team or a study,
 * which is why it is a platform-level area and carries no identifier in its
 * path: there is only ever one account being administered, and it is the one
 * signed in. Its destinations come from `navigationManifest.ts`, the same list
 * the everything bar searches.
 */

const messages = defineMessages({
  navLabel: {
    id: 'studio.shell.accountNavLabel',
    defaultMessage: 'Account',
    description:
      "Accessible name of the account area's sidebar navigation region.",
  },
  navOpen: {
    id: 'studio.shell.accountNavOpen',
    defaultMessage: 'Open account navigation',
    description:
      'Accessible name of the control that opens the account sidebar drawer on narrow viewports.',
  },
  navClose: {
    id: 'studio.shell.accountNavClose',
    defaultMessage: 'Close account navigation',
    description:
      'Accessible name of the control that closes the account sidebar drawer on narrow viewports.',
  },
});

export default function AccountArea() {
  const intl = useAppIntl();
  const pathname = useRouterState({
    // The COMMITTED location, which is `resolvedLocation`: `location` is the
    // PENDING one, set to the destination before the transaction runs.
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: intl.formatMessage(messages.navLabel),
        openLabel: intl.formatMessage(messages.navOpen),
        closeLabel: intl.formatMessage(messages.navClose),
        content: <ManifestNav entries={accountDestinations()} />,
      }}
    >
      <AreaMain>
        <Outlet />
      </AreaMain>
    </AppArea>
  );
}
