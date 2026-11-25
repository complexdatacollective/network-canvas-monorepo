import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../__tests__/testIds';
import { createEncryptedValueRedaction } from './redactEncryptedValues';

const PERSON = testTypeId('person');
const NAME = testVariableId('name');
const AGE = testVariableId('age');

const variables: Record<string, Variable> = {
  [NAME]: {
    name: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [AGE]: { name: 'age', type: 'number', component: 'Number' },
};

const redaction = createEncryptedValueRedaction({
  node: {
    [PERSON]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables,
    },
  },
});

describe('redacting encrypted values for development tools', () => {
  it('hides the answers an action writes, wherever the action holds them', () => {
    const action = {
      type: 'NETWORK/UPDATE_NODE/pending',
      meta: {
        arg: {
          nodeId: 'node-1',
          attributePatch: { set: { [NAME]: 'Alice', [AGE]: 40 }, unset: [] },
        },
      },
    };

    expect(redaction.action(action)).toEqual({
      type: 'NETWORK/UPDATE_NODE/pending',
      meta: {
        arg: {
          nodeId: 'node-1',
          attributePatch: {
            set: { [NAME]: '[encrypted]', [AGE]: 40 },
            unset: [],
          },
        },
      },
    });
  });

  it('leaves the action it copies as it was', () => {
    const attributeData = { [NAME]: 'Alice', [AGE]: 40 };
    const action = {
      type: 'NETWORK/ADD_NODE/pending',
      meta: { attributeData },
    };

    redaction.action(action);

    expect(action.meta.attributeData).toBe(attributeData);
    expect(attributeData).toEqual({ [NAME]: 'Alice', [AGE]: 40 });
  });

  it('returns an action holding no encrypted value unchanged, and unfrozen', () => {
    const action = { type: 'ui/setFormIsReady', payload: { [AGE]: 40 } };

    expect(redaction.action(action)).toBe(action);
    expect(Object.isFrozen(action.payload)).toBe(false);
  });

  it('hides the values nodes hold and keeps what they record about them', () => {
    const state = {
      session: {
        network: {
          nodes: [
            {
              [entityPrimaryKeyProperty]: 'node-1',
              type: PERSON,
              [entityAttributesProperty]: { [NAME]: [1, 2, 3], [AGE]: 40 },
              [entitySecureAttributesMeta]: { [NAME]: { iv: [4, 5, 6] } },
            },
            {
              [entityPrimaryKeyProperty]: 'node-2',
              type: PERSON,
              [entityAttributesProperty]: { [NAME]: 'Bob', [AGE]: null },
            },
            {
              [entityPrimaryKeyProperty]: 'node-3',
              type: PERSON,
              [entityAttributesProperty]: { [NAME]: null },
            },
          ],
        },
      },
      protocol: { codebook: { node: { [PERSON]: { variables } } } },
    };

    const redacted = redaction.state(state);

    expect(redacted.session.network.nodes).toEqual([
      {
        [entityPrimaryKeyProperty]: 'node-1',
        type: PERSON,
        [entityAttributesProperty]: { [NAME]: '[encrypted]', [AGE]: 40 },
        [entitySecureAttributesMeta]: { [NAME]: { iv: [4, 5, 6] } },
      },
      {
        [entityPrimaryKeyProperty]: 'node-2',
        type: PERSON,
        [entityAttributesProperty]: { [NAME]: '[encrypted]', [AGE]: null },
      },
      {
        [entityPrimaryKeyProperty]: 'node-3',
        type: PERSON,
        [entityAttributesProperty]: { [NAME]: null },
      },
    ]);
    expect(redacted.protocol).toBe(state.protocol);
    expect(state.session.network.nodes[1]?.[entityAttributesProperty]).toEqual({
      [NAME]: 'Bob',
      [AGE]: null,
    });
  });
});
