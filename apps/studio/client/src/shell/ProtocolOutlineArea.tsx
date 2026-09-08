import { Outlet, useRouterState } from '@tanstack/react-router';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import AppArea from '@codaco/fresco-ui/layout/AppArea';

import AreaMain from './AreaMain.tsx';
import ManifestNav from './ManifestNav.tsx';
import { editorDestinations } from './navigationManifest.ts';

/**
 * The protocol editor's area layout: the outline and the `<main>` it labels
 * (§5.3, §5.5).
 *
 * This region REPLACES the study sidebar rather than sitting beside it, which
 * is what makes the editor the full-attention screen it has to be. The
 * mechanism is the route tree, not this component: it and `StudyArea` are
 * sibling children of the component-less `studyRoute`, so exactly one of them
 * is ever matched.
 *
 * Its destinations — including the "Back to study" row the outline opens with —
 * are declared in `navigationManifest.ts`, which is also what the everything
 * bar's `go-to` provider searches.
 */
const messages = defineMessages({
  navLabel: {
    id: 'studio.shell.protocolOutlineNavLabel',
    defaultMessage: 'Protocol outline',
    description:
      "Accessible name of the protocol editor's outline navigation region.",
  },
  navOpen: {
    id: 'studio.shell.protocolOutlineNavOpen',
    defaultMessage: 'Open protocol outline',
    description:
      'Accessible name of the control that opens the protocol outline drawer on narrow viewports.',
  },
  navClose: {
    id: 'studio.shell.protocolOutlineNavClose',
    defaultMessage: 'Close protocol outline',
    description:
      'Accessible name of the control that closes the protocol outline drawer on narrow viewports.',
  },
});

export default function ProtocolOutlineArea({ studyId }: { studyId: string }) {
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
        content: <ManifestNav entries={editorDestinations(studyId)} />,
      }}
    >
      <AreaMain>
        <Outlet />
      </AreaMain>
    </AppArea>
  );
}
