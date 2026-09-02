import { Outlet, useRouterState } from '@tanstack/react-router';

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
export default function ProtocolOutlineArea({ studyId }: { studyId: string }) {
  const pathname = useRouterState({
    // The COMMITTED location, which is `resolvedLocation`: `location` is the
    // PENDING one, set to the destination before the transaction runs.
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Protocol outline',
        openLabel: 'Open protocol outline',
        closeLabel: 'Close protocol outline',
        content: <ManifestNav entries={editorDestinations(studyId)} />,
      }}
    >
      <AreaMain>
        <Outlet />
      </AreaMain>
    </AppArea>
  );
}
