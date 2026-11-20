import type { ReactNode } from 'react';

import { hostBarsStyle } from '@codaco/protocol-builder/fields/assetBlocks/settingsPlacement';
import { ACTION_TOOLBAR_REACH_VARIABLE } from '~/utils/actionToolbarReach';
import { NAV_BAR_REACH_VARIABLE } from '~/utils/navHeight';

/**
 * What the stage editor's page scrolls in. The navigation bar at its top and
 * the action toolbar at its bottom stand over the page as it scrolls, so the
 * editor is told how much of the page each covers (as each measures it),
 * and what it shows over the page keeps clear of both.
 */
const STAGE_EDITOR_BARS = hostBarsStyle({
  top: `var(${NAV_BAR_REACH_VARIABLE})`,
  bottom: `var(${ACTION_TOOLBAR_REACH_VARIABLE})`,
});

export default function StageEditorScroller({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className="relative h-full overflow-y-auto pb-32"
      style={STAGE_EDITOR_BARS}
    >
      {children}
    </div>
  );
}
