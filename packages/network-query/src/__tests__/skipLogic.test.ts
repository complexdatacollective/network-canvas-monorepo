import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  createProtocolObjectId,
  type SkipLogic,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { isStageSkipped, resolveSkipLogicDestinationIndex } from '../index.ts';

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
      id: createProtocolObjectId(),
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

/**
 * A rule that the participant's attribute exists asks whether it has been
 * answered. Interviews saved before a form unset a cleared answer stored the
 * typed-then-deleted text as '', and that is no answer either.
 */
describe('skip logic on whether an attribute has been answered', () => {
  const egoWith = (
    attributes: NcNetwork['ego'][typeof entityAttributesProperty],
  ): NcNetwork => ({
    ego: {
      [entityPrimaryKeyProperty]: 'ego',
      [entityAttributesProperty]: attributes,
    },
    nodes: [],
    edges: [],
  });
  const showIfNicknameExists: SkipLogic = {
    action: 'SHOW',
    filter: {
      rules: [
        {
          id: createProtocolObjectId(),
          type: 'ego',
          options: {
            attribute: asEntityAttributeReference('nickname'),
            operator: 'EXISTS',
          },
        },
      ],
    },
  };

  it.each([
    ['a cleared text answer', { nickname: '' }],
    ['an answer of only spaces', { nickname: '   ' }],
    ['no answer', {}],
  ])('skips the stage for %s', (_label, attributes) => {
    expect(isStageSkipped(showIfNicknameExists, egoWith(attributes))).toBe(
      true,
    );
  });

  it('shows the stage for an answer', () => {
    expect(
      isStageSkipped(showIfNicknameExists, egoWith({ nickname: 'Sam' })),
    ).toBe(false);
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

  it('resolves finish to the one-past-the-end index when no finish stage follows', () => {
    expect(
      resolveSkipLogicDestinationIndex({ type: 'finish' }, stages, 1),
    ).toBe(3);
  });

  it('resolves finish to the first finish stage after the owning stage', () => {
    const withFinish = [
      ...stages,
      { id: 'thanks', type: 'FinishSession' },
      { id: 'later', type: 'FinishSession' },
    ];
    expect(
      resolveSkipLogicDestinationIndex({ type: 'finish' }, withFinish, 1),
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
