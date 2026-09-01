import { Outlet, useRouterState } from '@tanstack/react-router';

import AppArea from '@codaco/fresco-ui/layout/AppArea';

/**
 * The editor area layout: the `<main id="main-content">` the editor renders
 * into, and no sidebar.
 *
 * This is the area for the editor's SHIPPED address,
 * `/teams/$teamId/protocols/$protocolId/drafts/$draftId`. The address §5.2
 * gives it — `/study/$studyId/editor` — exists, and `ProtocolOutlineArea` is
 * the sidebar it renders under; what has not happened yet is the re-parent
 * that moves this screen onto it.
 *
 * Until it does, the outline stays inside `Editor.tsx`, where it is one
 * labelled `<nav>` inside `<main>` rather than beside it, and this area
 * declares no navigation of its own. Declaring one that duplicated the outline
 * would put two navigation regions on the route, which is the failure §5.3
 * exists to prevent.
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
