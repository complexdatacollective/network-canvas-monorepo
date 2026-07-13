import type { SkipLogic } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import getQuery from './query';

/**
 * Evaluate whether a stage should be skipped for the current network.
 *
 * `SKIP` hides the stage when its filter matches, while `SHOW` hides it when
 * the filter does not match.
 */
export const isStageSkipped = (
  skipLogic: SkipLogic,
  network: NcNetwork,
): boolean => {
  const matches = getQuery(skipLogic.filter)(network);

  return skipLogic.action === 'SKIP' ? matches : !matches;
};
