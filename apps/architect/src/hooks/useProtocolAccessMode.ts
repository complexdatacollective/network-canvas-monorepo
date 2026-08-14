import { useLocation } from 'wouter';

import { useAppSelector } from '~/ducks/hooks';
import { getProtocolOpenElsewhere } from '~/ducks/modules/app';
import { getProtocol } from '~/selectors/protocol';

import { isStageEditorPath } from './useProtocolNavGuard';

/**
 * Whether this tab may edit the protocol behind the current `/protocol` route.
 *
 * - `no-protocol`: there is no protocol in the editing buffer. Nothing on a
 *   `/protocol` route can be written, because every reducer under
 *   `activeProtocol` no-ops against a null present. The route must not render.
 * - `editable`: this tab holds the cross-tab editor lock. Normal editing.
 * - `read-only`: the protocol is open in another tab, which owns the saved
 *   copy. This tab may show the protocol but must not offer editing.
 * - `held-stage-editor`: this tab lost the lock while it was in the stage
 *   editor (e.g. a bfcache restore re-claimed the protocol and a peer answered
 *   "held"). The stage draft is not part of the protocol and exists only here,
 *   so the editor stays mounted rather than being replaced underneath it — the
 *   banner explains that changes cannot be saved while the other tab is open,
 *   and offers the two real ways out: close the other tab, or discard. Keyed on
 *   the route, not on whether the draft is currently dirty: a dirty check flips
 *   back to clean the moment the user undoes to the committed values, which
 *   would tear the editor away mid-edit.
 */
export type ProtocolAccessMode =
  | 'no-protocol'
  | 'editable'
  | 'read-only'
  | 'held-stage-editor';

export const useProtocolAccessMode = (): ProtocolAccessMode => {
  const [location] = useLocation();
  const hasProtocol = useAppSelector((state) => getProtocol(state) !== null);
  const openElsewhere = useAppSelector(getProtocolOpenElsewhere);

  if (!hasProtocol) return 'no-protocol';
  if (!openElsewhere) return 'editable';
  // Only the stage editor holds work that lives outside the protocol itself.
  // Everywhere else an accepted edit is already in the canonical row, so there
  // is nothing to lose by switching to the read-only view.
  if (isStageEditorPath(location)) return 'held-stage-editor';
  return 'read-only';
};
