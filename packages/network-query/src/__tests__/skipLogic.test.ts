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

import { isStageSkipped } from '../index';

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
