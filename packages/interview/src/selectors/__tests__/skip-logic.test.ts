import { describe, expect, it } from 'vitest';

import type { SkipLogic } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import {
  getLastAvailableAuthoredStageIndex,
  resolveRecoveryStep,
} from '../skip-logic';

const network: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'ego',
    [entityAttributesProperty]: {},
  },
  nodes: [],
  edges: [],
};

const alwaysSkipped = (destination?: SkipLogic['destination']): SkipLogic => ({
  action: 'SKIP',
  filter: { join: 'AND', rules: [] },
  ...(destination ? { destination } : {}),
});

const stage = (id: string, skipLogic?: SkipLogic) => ({
  id,
  ...(skipLogic ? { skipLogic } : {}),
});

describe('getLastAvailableAuthoredStageIndex', () => {
  it('returns the final authored stage on a route without skips', () => {
    expect(
      getLastAvailableAuthoredStageIndex(
        [stage('s0'), stage('s1'), stage('s2')],
        network,
      ),
    ).toBe(2);
  });

  it('returns the last active stage before a targeted jump to finish', () => {
    expect(
      getLastAvailableAuthoredStageIndex(
        [
          stage('s0'),
          stage('s1', alwaysSkipped({ type: 'finish' })),
          stage('s2'),
          stage('s3'),
        ],
        network,
      ),
    ).toBe(0);
  });

  it('returns undefined when the active route has no authored stage', () => {
    expect(
      getLastAvailableAuthoredStageIndex(
        [
          stage('s0', alwaysSkipped({ type: 'finish' })),
          stage('s1'),
          stage('s2'),
        ],
        network,
      ),
    ).toBeUndefined();
  });
});

describe('resolveRecoveryStep', () => {
  it('advances when the entry screen is unavailable and there is no earlier available screen', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 0,
        currentAvailability: { kind: 'local-skip' },
        previousValidStageIndex: 0,
        nextValidStageIndex: 1,
      }),
    ).toBe(1);
  });

  it('returns to the earlier available screen when one exists', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 3,
        currentAvailability: { kind: 'local-skip' },
        previousValidStageIndex: 1,
        nextValidStageIndex: 4,
      }),
    ).toBe(1);
  });

  it('follows a local skip destination forward when an earlier stage exists', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 1,
        currentAvailability: {
          kind: 'local-skip',
          destination: { type: 'finish' },
        },
        previousValidStageIndex: 0,
        nextValidStageIndex: 4,
      }),
    ).toBe(4);
  });

  it('follows the active route forward from a bypassed stage', () => {
    expect(
      resolveRecoveryStep({
        currentStep: 2,
        currentAvailability: {
          kind: 'bypassed',
          by: {
            stageId: 's1',
            stageIndex: 1,
            destination: { type: 'stage', stageId: 's4' },
          },
        },
        previousValidStageIndex: 0,
        nextValidStageIndex: 4,
      }),
    ).toBe(4);
  });
});
