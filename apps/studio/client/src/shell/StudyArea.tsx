import { Outlet, useRouterState } from '@tanstack/react-router';

import AppArea from '@codaco/fresco-ui/layout/AppArea';

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
 * versions (§5.5) — and are absent because they come from `study.shell`, which
 * this slice does not fetch. A count is decoration for a number nobody has;
 * inventing one would be worse than the empty row.
 */
export default function StudyArea({ studyId }: { studyId: string }) {
  const pathname = useRouterState({
    // The COMMITTED location: a blocker may still cancel a pending one
    // (§6.5, §7.3).
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Study',
        openLabel: 'Open study navigation',
        closeLabel: 'Close study navigation',
        content: <ManifestNav entries={studyDestinations(studyId)} />,
      }}
    >
      <AreaMain>
        <Outlet />
      </AreaMain>
    </AppArea>
  );
}
