import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type SkipLogic,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import {
  buildStageAvailabilityMap,
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '../index';

const matchingNetwork: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'ego',
    [entityAttributesProperty]: { agrees: true },
  },
  nodes: [],
  edges: [],
};

const nonMatchingNetwork: NcNetwork = {
  ...matchingNetwork,
  ego: {
    ...matchingNetwork.ego,
    [entityAttributesProperty]: { agrees: false },
  },
};

const filter: SkipLogic['filter'] = {
  rules: [
    {
      id: 'agrees-rule',
      type: 'ego',
      options: {
        attribute: asEntityAttributeReference('agrees'),
        operator: 'EXACTLY',
        value: true,
      },
    },
  ],
};

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

describe('isStageSkipped', () => {
  it('skips a SKIP stage when its filter matches', () => {
    expect(isStageSkipped({ action: 'SKIP', filter }, matchingNetwork)).toBe(
      true,
    );
  });

  it('keeps a SKIP stage when its filter does not match', () => {
    expect(isStageSkipped({ action: 'SKIP', filter }, nonMatchingNetwork)).toBe(
      false,
    );
  });

  it('keeps a SHOW stage when its filter matches', () => {
    expect(isStageSkipped({ action: 'SHOW', filter }, matchingNetwork)).toBe(
      false,
    );
  });

  it('skips a SHOW stage when its filter does not match', () => {
    expect(isStageSkipped({ action: 'SHOW', filter }, nonMatchingNetwork)).toBe(
      true,
    );
  });
});

describe('resolveSkipLogicDestinationIndex', () => {
  const stages = [{ id: 'intro' }, { id: 'consent' }, { id: 'debrief' }];

  it('resolves an immediate next stage', () => {
    expect(
      resolveSkipLogicDestinationIndex(
        { type: 'stage', stageId: 'consent' },
        stages,
        0,
      ),
    ).toBe(1);
  });

  it('resolves a later stage', () => {
    expect(
      resolveSkipLogicDestinationIndex(
        { type: 'stage', stageId: 'debrief' },
        stages,
        0,
      ),
    ).toBe(2);
  });

  it('resolves finish to the one-past-the-end index', () => {
    expect(
      resolveSkipLogicDestinationIndex({ type: 'finish' }, stages, 1),
    ).toBe(3);
  });

  it.each([
    ['a missing target', { type: 'stage', stageId: 'missing' }, 0],
    ['the owning stage', { type: 'stage', stageId: 'consent' }, 1],
    ['a backward target', { type: 'stage', stageId: 'intro' }, 1],
    ['an invalid owning index', { type: 'finish' }, 3],
  ] as const)('rejects %s', (_label, destination, owningStageIndex) => {
    expect(
      resolveSkipLogicDestinationIndex(destination, stages, owningStageIndex),
    ).toBeUndefined();
  });
});

describe('buildStageAvailabilityMap', () => {
  it('does not activate a destination while its owning stage remains visible', () => {
    const destination = { type: 'stage' as const, stageId: 's3' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0'),
        stage('s1', {
          action: 'SHOW',
          filter: { join: 'AND', rules: [] },
          destination,
        }),
        stage('s2'),
        stage('s3'),
        stage('finish'),
      ],
      network,
    );

    expect(availability).toEqual({
      0: { kind: 'available' },
      1: { kind: 'available' },
      2: { kind: 'available' },
      3: { kind: 'available' },
      4: { kind: 'available' },
    });
  });

  it('preserves legacy one-screen skip behavior without a destination', () => {
    const availability = buildStageAvailabilityMap(
      [stage('s0'), stage('s1', alwaysSkipped()), stage('s2'), stage('finish')],
      network,
    );

    expect(availability).toEqual({
      0: { kind: 'available' },
      1: { kind: 'local-skip' },
      2: { kind: 'available' },
      3: { kind: 'available' },
    });
  });

  it('marks the screens before a stage destination as bypassed', () => {
    const destination = { type: 'stage' as const, stageId: 's4' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0'),
        stage('s1', alwaysSkipped(destination)),
        stage('s2'),
        stage('s3'),
        stage('s4'),
        stage('finish'),
      ],
      network,
    );

    expect(availability[1]).toEqual({
      kind: 'local-skip',
      destination,
    });
    expect(availability[2]).toEqual({
      kind: 'bypassed',
      by: { stageId: 's1', stageIndex: 1, destination },
    });
    expect(availability[3]).toEqual(availability[2]);
    expect(availability[4]).toEqual({ kind: 'available' });
  });

  it('maps a finish destination to the synthetic final screen', () => {
    const destination = { type: 'finish' as const };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0', alwaysSkipped(destination)),
        stage('s1'),
        stage('s2'),
        stage('finish'),
      ],
      network,
    );

    expect(availability[0]).toEqual({
      kind: 'local-skip',
      destination,
    });
    expect(availability[1]?.kind).toBe('bypassed');
    expect(availability[2]?.kind).toBe('bypassed');
    expect(availability[3]).toEqual({ kind: 'available' });
  });

  it('does not activate skip rules on screens bypassed by an earlier jump', () => {
    const firstDestination = { type: 'stage' as const, stageId: 's3' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0', alwaysSkipped(firstDestination)),
        stage('s1', alwaysSkipped({ type: 'finish' })),
        stage('s2'),
        stage('s3'),
        stage('finish'),
      ],
      network,
    );

    expect(availability[1]).toEqual({
      kind: 'bypassed',
      by: {
        stageId: 's0',
        stageIndex: 0,
        destination: firstDestination,
      },
    });
    expect(availability[3]).toEqual({ kind: 'available' });
  });

  it('evaluates a hidden destination and continues along its route', () => {
    const firstDestination = { type: 'stage' as const, stageId: 's2' };
    const chainedDestination = { type: 'stage' as const, stageId: 's4' };
    const availability = buildStageAvailabilityMap(
      [
        stage('s0', alwaysSkipped(firstDestination)),
        stage('s1'),
        stage('s2', alwaysSkipped(chainedDestination)),
        stage('s3'),
        stage('s4'),
        stage('finish'),
      ],
      network,
    );

    expect(availability[1]?.kind).toBe('bypassed');
    expect(availability[2]).toEqual({
      kind: 'local-skip',
      destination: chainedDestination,
    });
    expect(availability[3]).toEqual({
      kind: 'bypassed',
      by: {
        stageId: 's2',
        stageIndex: 2,
        destination: chainedDestination,
      },
    });
    expect(availability[4]).toEqual({ kind: 'available' });
  });

  it('ignores invalid non-forward destinations defensively', () => {
    const availability = buildStageAvailabilityMap(
      [
        stage('s0'),
        stage('s1', alwaysSkipped({ type: 'stage', stageId: 'missing-stage' })),
        stage('finish'),
      ],
      network,
    );

    expect(availability[1]?.kind).toBe('local-skip');
    expect(availability[2]).toEqual({ kind: 'available' });
  });
});
