import { useLocation } from 'wouter';

import { useNestedEditorOpen } from '~/components/DialogForm/nestedDraftRegistry';
import { useAppSelector } from '~/ducks/hooks';
import { getProtocolOwnedHere } from '~/ducks/modules/app';
import { getProtocol } from '~/selectors/protocol';

import { isStageEditorPath } from './useProtocolNavGuard';

/**
 * Whether this tab may edit the protocol behind the current `/protocol` route.
 *
 * This is the CAPABILITY question — what may this tab do? The CAUSE lives in
 * `getProtocolLockState`, which distinguishes "another tab holds the lock" from
 * "the reclaim is blocked on an unresolved draft conflict". Both deny writing
 * in exactly the same way, so they collapse to the same mode here; only the
 * copy that explains the situation to the researcher branches on the cause.
 *
 * - `no-protocol`: there is no protocol in the editing buffer. Nothing on a
 *   `/protocol` route can be written, because every reducer under
 *   `activeProtocol` no-ops against a null present. The route must not render.
 * - `editable`: this tab holds the cross-tab editor lock. Normal editing.
 * - `read-only`: this tab does not own the saved copy. It may show the protocol
 *   but must not offer editing — including undo and redo, which mutate the
 *   protocol and would be reverted on screen without ever reaching disk.
 * - `held-stage-editor`: this tab does not own the saved copy but is in the
 *   stage editor (e.g. a bfcache restore re-claimed the protocol and a peer
 *   answered "held"). The stage draft is not part of the protocol and exists
 *   only here, so the editor stays mounted rather than being replaced
 *   underneath it — the banner explains that changes cannot be saved, and
 *   offers the real ways out. Keyed on the route, not on whether the draft is
 *   currently dirty: a dirty check flips back to clean the moment the user
 *   undoes to the committed values, which would tear the editor away mid-edit.
 * - `held-nested-editor`: the same situation somewhere else in the protocol —
 *   a variable, entity-type, resource or rule editor open over the Codebook or
 *   the timeline. Its draft lives in its own form store and reaches neither the
 *   protocol nor the stage draft (#1387), and it is rendered from the route
 *   tree, so swapping in the read-only view unmounts it without its own
 *   close confirmation ever running. Keyed on an editor being OPEN rather than
 *   dirty, for the same stability reason as above.
 */
export type ProtocolAccessMode =
  | 'no-protocol'
  | 'editable'
  | 'read-only'
  | 'held-stage-editor'
  | 'held-nested-editor';

export const useProtocolAccessMode = (): ProtocolAccessMode => {
  const [location] = useLocation();
  const hasProtocol = useAppSelector((state) => getProtocol(state) !== null);
  const ownedHere = useAppSelector(getProtocolOwnedHere);
  const nestedEditorOpen = useNestedEditorOpen();

  if (!hasProtocol) return 'no-protocol';
  if (ownedHere) return 'editable';
  // Two editors hold work that lives outside the protocol itself, and neither
  // may be replaced by the read-only view while it does. Everywhere else an
  // accepted edit is already in the canonical row, so there is nothing to lose
  // by switching.
  if (isStageEditorPath(location)) return 'held-stage-editor';
  if (nestedEditorOpen) return 'held-nested-editor';
  return 'read-only';
};
