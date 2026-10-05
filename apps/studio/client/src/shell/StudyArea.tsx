import { useQuery } from '@tanstack/react-query';
import { Outlet, useRouterState } from '@tanstack/react-router';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import AppArea from '@codaco/fresco-ui/layout/AppArea';

import { orpc } from '../lib/api.ts';
import AreaMain from './AreaMain.tsx';
import ManifestNav from './ManifestNav.tsx';
import { studyDestinations } from './navigationManifest.ts';

/**
 * The study area layout: the study sidebar and the `<main>` it labels (§5.3).
 *
 * The study is where a researcher works, so this is the sidebar they spend
 * their time in. Its destinations and their lifecycle grouping — design the
 * protocol, collect with it, then take the data out — are declared in
 * `navigationManifest.ts`, which is also what the everything bar's `go-to`
 * provider searches (everything-bar design §5.2).
 *
 * It is a sibling of the editor's area, not its parent — see `studyRoute` in
 * `router.tsx`. The editor's outline REPLACES this sidebar rather than
 * rendering beside it, which is only true while the two areas are siblings.
 *
 * Counts belong on the countable destinations — participants, waves, sessions,
 * versions (§5.5) — and this is the one place that fetches them, because it is
 * the one place that renders them. Until `studies.counts` answers, and if it
 * never does, `useQuery` holds `undefined` and every row renders without a
 * number: a count is decoration for a number nobody has, and inventing one —
 * a 0 for a study with forty participants in it — would be worse than the
 * plain row.
 */
const messages = defineMessages({
  navLabel: {
    id: 'studio.shell.studyNavLabel',
    defaultMessage: 'Study',
    description:
      "Accessible name of the study area's sidebar navigation region.",
  },
  navOpen: {
    id: 'studio.shell.studyNavOpen',
    defaultMessage: 'Open study navigation',
    description:
      'Accessible name of the control that opens the study sidebar drawer on narrow viewports.',
  },
  navClose: {
    id: 'studio.shell.studyNavClose',
    defaultMessage: 'Close study navigation',
    description:
      'Accessible name of the control that closes the study sidebar drawer on narrow viewports.',
  },
});

export default function StudyArea({ studyId }: { studyId: string }) {
  const intl = useAppIntl();
  const pathname = useRouterState({
    // The COMMITTED location: a blocker may still cancel a pending one
    // (§6.5, §7.3).
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  // A study route names no team (§6.3), and the question does not need one:
  // like `studies.get`, the procedure is addressed by the study alone and the
  // server resolves the team from the researcher's memberships, so the numbers
  // exist for exactly the studies they can open.
  const counts = useQuery(
    orpc.studies.counts.queryOptions({
      input: { studyId },
      // The client's own freshness applies, which for numbers that move while
      // a researcher works is what is wanted: the sidebar stays mounted for
      // the whole of a study visit, so nothing else would ever refresh them.
      // A failure is not retried — the row simply has no number, which is a
      // complete answer, and a retry loop behind a sidebar is not worth one.
      retry: false,
    }),
  );

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: intl.formatMessage(messages.navLabel),
        openLabel: intl.formatMessage(messages.navOpen),
        closeLabel: intl.formatMessage(messages.navClose),
        content: (
          <ManifestNav entries={studyDestinations(studyId, counts.data)} />
        ),
      }}
    >
      <AreaMain>
        <Outlet />
      </AreaMain>
    </AppArea>
  );
}
