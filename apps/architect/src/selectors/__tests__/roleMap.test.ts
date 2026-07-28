import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';

import { getVariableRoleMap, roleMapKey } from '../indexes';
import {
  getHasVariableRoleConflicts,
  getVariableRoleConflicts,
} from '../issues';

// Minimal RootState stub: only the slice the selectors touch.
const stateWith = (protocol: unknown): RootState =>
  ({
    activeProtocol: { present: protocol },
  }) as unknown as RootState;

const protocol = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'cat', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
  ],
};

describe('variable role map', () => {
  it('counts validated and unvalidated hits per subject-scoped variable', () => {
    const map = getVariableRoleMap(stateWith(protocol));
    const key = roleMapKey({ entity: 'node', type: 'person' }, 'cat');
    expect(map[key]).toEqual({ validated: 1, unvalidated: 1 });
  });

  it('exposes conflicts through issues selectors', () => {
    expect(getHasVariableRoleConflicts(stateWith(protocol))).toBe(true);
    const conflicts = getVariableRoleConflicts(stateWith(protocol));
    expect(conflicts[0]?.variableName).toBe('cat');
  });

  it('is empty for a conflict-free protocol', () => {
    const clean = { ...protocol, stages: [protocol.stages[0]] };
    expect(getHasVariableRoleConflicts(stateWith(clean))).toBe(false);
  });
});
