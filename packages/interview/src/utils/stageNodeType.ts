import { invariant } from 'es-toolkit';

import {
  getSingleStageNodeType,
  type Stage,
} from '@codaco/protocol-validation';

/**
 * The node type of a stage that runs exactly one. Validation caps these
 * stages at one type, so a stage reaching an interface without one is a bug.
 */
export const requireSingleStageNodeType = (stage: Stage): string => {
  const nodeType = getSingleStageNodeType(stage);
  invariant(nodeType, `${stage.type} stage must run exactly one node type`);
  return nodeType;
};
