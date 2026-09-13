import { describe, expect, it } from 'vitest';

import { createInitialNetwork } from '../../../contract/network';
import type { StageTimingExit } from '../../../contract/types';
import sessionReducer, {
  recordStageTiming,
  type SessionState,
} from '../session';

const exit = (stageIndex: number): StageTimingExit => ({
  stageIndex,
  stageType: 'Information',
  promptIndex: 0,
  promptCount: 1,
  durationMs: 1,
  exitDirection: 'forward',
});

describe('stage timing history', () => {
  it('retains at most 10,000 recent exits and keeps the total consistent', () => {
    const initial: SessionState = {
      id: 'session-1',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      network: createInitialNetwork(),
      stageTiming: {
        stageExits: Array.from({ length: 10_000 }, (_, index) => exit(index)),
        promptExits: Array.from({ length: 10_000 }, (_, index) => exit(index)),
        totalDurationMs: 10_000,
      },
    };

    const next = sessionReducer(
      initial,
      recordStageTiming({ stageExit: exit(10_000), promptExit: exit(10_000) }),
    );

    expect(next.stageTiming?.stageExits).toHaveLength(10_000);
    expect(next.stageTiming?.promptExits).toHaveLength(10_000);
    expect(next.stageTiming?.stageExits[0]?.stageIndex).toBe(1);
    expect(next.stageTiming?.promptExits?.[0]?.stageIndex).toBe(1);
    expect(next.stageTiming?.totalDurationMs).toBe(10_000);
  });
});
