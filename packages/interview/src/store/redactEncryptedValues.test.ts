import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { createEncryptedValueRedaction } from './redactEncryptedValues';

const variables: Record<string, Variable> = {
  name: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  age: { name: 'age', label: 'age', type: 'number', component: 'Number' },
};

const redaction = createEncryptedValueRedaction({
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
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
          attributePatch: { set: { name: 'Alice', age: 40 }, unset: [] },
        },
      },
    };

    expect(redaction.action(action)).toEqual({
      type: 'NETWORK/UPDATE_NODE/pending',
      meta: {
        arg: {
          nodeId: 'node-1',
          attributePatch: { set: { name: '[encrypted]', age: 40 }, unset: [] },
        },
      },
    });
  });

  it('leaves the action it copies as it was', () => {
    const attributeData = { name: 'Alice', age: 40 };
    const action = {
      type: 'NETWORK/ADD_NODE/pending',
      meta: { attributeData },
    };

    redaction.action(action);

    expect(action.meta.attributeData).toBe(attributeData);
    expect(attributeData).toEqual({ name: 'Alice', age: 40 });
  });

  it('returns an action holding no encrypted value unchanged, and unfrozen', () => {
    const action = { type: 'ui/setFormIsReady', payload: { age: 40 } };

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
              type: 'person',
              [entityAttributesProperty]: { name: [1, 2, 3], age: 40 },
              [entitySecureAttributesMeta]: { name: { iv: [4, 5, 6] } },
            },
            {
              [entityPrimaryKeyProperty]: 'node-2',
              type: 'person',
              [entityAttributesProperty]: { name: 'Bob', age: null },
            },
            {
              [entityPrimaryKeyProperty]: 'node-3',
              type: 'person',
              [entityAttributesProperty]: { name: null },
            },
          ],
        },
      },
      protocol: { codebook: { node: { person: { variables } } } },
    };

    const redacted = redaction.state(state);

    expect(redacted.session.network.nodes).toEqual([
      {
        [entityPrimaryKeyProperty]: 'node-1',
        type: 'person',
        [entityAttributesProperty]: { name: '[encrypted]', age: 40 },
        [entitySecureAttributesMeta]: { name: { iv: [4, 5, 6] } },
      },
      {
        [entityPrimaryKeyProperty]: 'node-2',
        type: 'person',
        [entityAttributesProperty]: { name: '[encrypted]', age: null },
      },
      {
        [entityPrimaryKeyProperty]: 'node-3',
        type: 'person',
        [entityAttributesProperty]: { name: null },
      },
    ]);
    expect(redacted.protocol).toBe(state.protocol);
    expect(state.session.network.nodes[1]?.[entityAttributesProperty]).toEqual({
      name: 'Bob',
      age: null,
    });
  });
});
