import { getInterviewProgress } from '@codaco/interview';
import { isCurrentProtocol, type StoredProtocol } from '~/lib/db/types';

/**
 * The "of Y" in a data view row's "Step X of Y": how many steps the
 * interview of this protocol has, counted the way the engine that runs it
 * counts them.
 *
 * A schema 9 interview runs in this app's engine, so its count is the
 * engine's own (`getInterviewProgress`). A schema 8 interview runs in
 * Interviewer 8, whose engine appends a finish stage of its own after the
 * protocol's stages, so its count is `stages.length + 1` (Interviewer 8's
 * `getInterviewProgress`), and a finished one's `currentStep` is
 * `stages.length`.
 */
export function protocolTotalSteps(protocol: StoredProtocol): number {
  if (isCurrentProtocol(protocol)) {
    return getInterviewProgress(protocol.protocol.stages, 0).totalSteps;
  }
  return protocol.protocol.stages.length + 1;
}
