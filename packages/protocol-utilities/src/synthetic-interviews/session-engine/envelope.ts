import type { SessionPayload } from '@codaco/shared-consts';

import type { SyntheticSessionAction } from './actions';
import type { SessionClock } from './clock';
import type { SessionDraft } from './engine';

export type SyntheticInterviewResult = {
  /**
   * The session exactly as the Interviewer app stores one: the folded
   * reducer shape plus the envelope fields its host stamps. `finishTime` is
   * filled for completed sessions (what `markSessionFinished` would have
   * written), null for drop-outs and stop-at runs; `exportTime` is always
   * null; `promptIndex` is the folded value; `stageMetadata` is present only
   * when some stage wrote an entry.
   */
  session: SessionPayload;
  /** The resume position: next unreached stage, or stages.length when done. */
  currentStep: number;
  droppedOut: boolean;
  /** Present when the run asked for a trace (`captureTrace`). */
  trace?: readonly SyntheticSessionAction[];
};

export const finaliseSession = ({
  id,
  draft,
  clock,
  finished,
  currentStep,
  droppedOut,
  trace,
}: {
  id: string;
  draft: SessionDraft;
  clock: SessionClock;
  finished: boolean;
  currentStep: number;
  droppedOut: boolean;
  trace: readonly SyntheticSessionAction[] | null;
}): SyntheticInterviewResult => {
  const session: SessionPayload = {
    id,
    startTime: clock.startTime,
    finishTime: finished ? clock.finishInstant() : null,
    exportTime: null,
    lastUpdated: draft.lastUpdated,
    network: draft.network,
    promptIndex: draft.promptIndex,
    ...(Object.keys(draft.stageMetadata).length > 0
      ? { stageMetadata: draft.stageMetadata }
      : {}),
  };

  return {
    session,
    currentStep,
    droppedOut,
    ...(trace ? { trace } : {}),
  };
};
