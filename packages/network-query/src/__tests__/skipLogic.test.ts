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

import { isStageSkipped, resolveSkipLogicDestinationIndex } from '../index';

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
