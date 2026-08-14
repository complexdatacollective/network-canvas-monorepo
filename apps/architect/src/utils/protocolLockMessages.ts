import type { ProtocolLockState } from '~/ducks/modules/app';

/**
 * Why a commit raised in this tab was refused, or `null` when it may proceed.
 *
 * Two surfaces refuse for exactly the same reason and must not drift apart in
 * how they say so: the stage editor's own Finished Editing, and a nested
 * editor whose Finish would write the canonical protocol. Only the way out of
 * `reclaim-blocked` differs — the stage editor has a three-action choice
 * waiting on it, while a nested editor is itself the thing that has to be
 * resolved first — so that is the one sentence keyed by surface.
 *
 * One whole sentence per case, never assembled from fragments, so all of it can
 * be localised.
 */
const RECLAIM_BLOCKED_MESSAGES = {
  'stage':
    'These changes cannot be saved over the version the other tab saved. Choose whether to keep them or discard them first.',
  'nested-editor':
    'These changes cannot be saved over the version the other tab saved. Cancel this editor to continue, and you will be asked to confirm before anything in it is discarded.',
} as const;

const OPEN_ELSEWHERE_MESSAGE =
  'This protocol is open in another tab, which holds the saved copy. Close the other tab to save these changes here.';

export const refusedCommitMessage = (
  lockState: ProtocolLockState,
  surface: keyof typeof RECLAIM_BLOCKED_MESSAGES,
): string | null => {
  if (lockState === 'owned') return null;
  return lockState === 'reclaim-blocked'
    ? RECLAIM_BLOCKED_MESSAGES[surface]
    : OPEN_ELSEWHERE_MESSAGE;
};
