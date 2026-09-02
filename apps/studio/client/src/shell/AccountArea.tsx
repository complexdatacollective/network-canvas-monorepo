import { Outlet, useRouterState } from '@tanstack/react-router';

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
export default function AccountArea() {
  const pathname = useRouterState({
    // The COMMITTED location, which is `resolvedLocation`: `location` is the
    // PENDING one, set to the destination before the transaction runs.
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Account',
        openLabel: 'Open account navigation',
        closeLabel: 'Close account navigation',
        content: <ManifestNav entries={accountDestinations()} />,
      }}
    >
      <AreaMain>
        <Outlet />
      </AreaMain>
    </AppArea>
  );
}
