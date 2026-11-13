import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import { toWorkerNetwork, toWorkerNode } from '../workerEntities';

const codebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      shape: { default: 'circle' },
      color: 'node-color-seq-1',
      variables: {
        nameId: { name: 'name', type: 'text' },
        ageId: { name: 'age', type: 'number' },
        secretId: { name: 'secret', type: 'text', encrypted: true },
      },
    },
  },
  edge: {
    friend: {
      name: 'Friend',
      color: 'edge-color-seq-1',
      variables: { closeId: { name: 'closeness', type: 'number' } },
    },
  },
  ego: { variables: { egoAgeId: { name: 'age', type: 'number' } } },
};

const person = (id: string, attributes: NcNode['attributes']): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: 'person',
  [entityAttributesProperty]: attributes,
});

describe('toWorkerNode', () => {
  it('names attributes by variable and adds the identifying properties', () => {
    expect(
      toWorkerNode(person('a', { nameId: 'Ada', ageId: 36 }), codebook),
    ).toEqual({
      networkCanvasId: 'a',
      networkCanvasType: 'Person',
      name: 'Ada',
      age: 36,
    });
  });

  it('keeps an attribute the codebook does not define under its own key', () => {
    expect(
      toWorkerNode(person('a', { nickname: 'Ace' }), codebook),
    ).toMatchObject({
      nickname: 'Ace',
    });
  });

  it('leaves out encrypted attributes', () => {
    const node: NcNode = {
      ...person('a', { nameId: 'Ada', secretId: [1, 2, 3], otherId: [4] }),
      [entitySecureAttributesMeta]: { otherId: { iv: [1], salt: [2] } },
    };

    expect(toWorkerNode(node, codebook)).toEqual({
      networkCanvasId: 'a',
      networkCanvasType: 'Person',
      name: 'Ada',
    });
  });

  it('falls back to the type id when the codebook does not define the type', () => {
    expect(
      toWorkerNode({ ...person('a', {}), type: 'unknown' }, codebook),
    ).toEqual({ networkCanvasId: 'a', networkCanvasType: 'unknown' });
  });

  it('lets an attribute take precedence over an identifying property', () => {
    const custom: Codebook = {
      node: {
        person: {
          name: 'Person',
          shape: { default: 'circle' },
          color: 'node-color-seq-1',
          variables: { typeId: { name: 'networkCanvasType', type: 'text' } },
        },
      },
    };

    expect(toWorkerNode(person('a', { typeId: 'mine' }), custom)).toEqual({
      networkCanvasId: 'a',
      networkCanvasType: 'mine',
    });
  });
});

describe('toWorkerNetwork', () => {
  it('converts nodes, edges and ego', () => {
    const network: NcNetwork = {
      nodes: [person('a', { nameId: 'Ada' }), person('b', { nameId: 'Bo' })],
      edges: [
        {
          [entityPrimaryKeyProperty]: 'e',
          type: 'friend',
          from: 'a',
          to: 'b',
          [entityAttributesProperty]: { closeId: 3 },
        },
      ],
      ego: {
        [entityPrimaryKeyProperty]: 'ego',
        [entityAttributesProperty]: { egoAgeId: 40 },
      },
    };

    expect(toWorkerNetwork(network, codebook)).toEqual({
      nodes: [
        { networkCanvasId: 'a', networkCanvasType: 'Person', name: 'Ada' },
        { networkCanvasId: 'b', networkCanvasType: 'Person', name: 'Bo' },
      ],
      edges: [
        {
          networkCanvasId: 'e',
          networkCanvasType: 'Friend',
          from: 'a',
          to: 'b',
          closeness: 3,
        },
      ],
      ego: { networkCanvasId: 'ego', age: 40 },
    });
  });
});
