import { Outlet, useRouterState } from '@tanstack/react-router';

import AppArea from '@codaco/fresco-ui/layout/AppArea';

/**
 * The editor area layout: the `<main id="main-content">` the editor renders
 * into, and no sidebar.
 *
 * The editor's navigation region is the protocol outline, and §5.3 makes it
 * this area's sidebar — but that arrives with the re-parent onto
 * `/study/$studyId/editor`, which this slice does not do. Until then the
 * outline stays inside `Editor.tsx`, where it is one labelled `<nav>` inside
 * `<main>` rather than beside it, and this area declares no navigation of its
 * own. Declaring one that duplicated the outline would put two navigation
 * regions on the route, which is the failure §5.3 exists to prevent.
 *
 * What the area is here for regardless is the landmark: exactly one
 * `<main id="main-content">` per rendered route, owned by an area layout,
 * targeted by the skip link `AppFrame` renders. The editor's three mutually
 * exclusive branches each declared their own before this.
 */
export default function EditorArea() {
  return (
    <AppArea
      location={useRouterState({ select: (state) => state.location.pathname })}
    >
      <Outlet />
    </AppArea>
  );
}
