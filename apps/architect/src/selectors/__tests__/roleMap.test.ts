import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';

import {
  getVariableRoleMap,
  getVariableRoleMapOutsideStage,
  roleMapKey,
} from '../indexes';
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

  it('can exclude every persisted hit owned by the stage being edited', () => {
    const key = roleMapKey({ entity: 'node', type: 'person' }, 'cat');

    expect(getVariableRoleMapOutsideStage(stateWith(protocol), 0)[key]).toEqual(
      {
        validated: 0,
        unvalidated: 1,
      },
    );
    expect(getVariableRoleMapOutsideStage(stateWith(protocol), 1)[key]).toEqual(
      {
        validated: 1,
        unvalidated: 0,
      },
    );
  });

  it('keeps colon-containing type and variable ids in distinct entries', () => {
    const colonProtocol = {
      ...protocol,
      codebook: {
        node: {
          'person:alias': {
            name: 'Person alias',
            color: 'c',
            variables: {
              flagged: { name: 'Flagged', type: 'boolean' },
            },
          },
          'person': {
            name: 'Person',
            color: 'c',
            variables: {
              'alias:flagged': {
                name: 'Alias flagged',
                type: 'categorical',
                options: [{ label: 'A', value: 'a' }],
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
          subject: { entity: 'node', type: 'person:alias' },
          introductionPanel: { title: 'T', text: 'X' },
          form: { fields: [{ variable: 'flagged', prompt: 'P' }] },
        },
        {
          id: 's2',
          type: 'CategoricalBin',
          label: 'B',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'p1', text: 'T', variable: 'alias:flagged' }],
        },
      ],
    };
    const map = getVariableRoleMap(stateWith(colonProtocol));
    const validatedKey = roleMapKey(
      { entity: 'node', type: 'person:alias' },
      'flagged',
    );
    const unvalidatedKey = roleMapKey(
      { entity: 'node', type: 'person' },
      'alias:flagged',
    );

    expect(validatedKey).not.toBe(unvalidatedKey);
    expect(map[validatedKey]).toEqual({ validated: 1, unvalidated: 0 });
    expect(map[unvalidatedKey]).toEqual({ validated: 0, unvalidated: 1 });
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
