import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { canonicalize } from '@codaco/studio-sync/apply';

import {
  edgeRow,
  egoColumns,
  type Network,
  networkFromRows,
  nodeRow,
  snapshotPayload,
} from '../mapping.ts';

const network: Network = {
  nodes: [
    {
      _uid: 'node-1',
      type: 'person',
      attributes: { name: 'Ada' },
      _secureAttributes: { name: { iv: [1], salt: [2] } },
      stageId: 'stage-1',
      promptIDs: ['prompt-1'],
    },
    { _uid: 'node-2', type: 'person', attributes: {} },
  ],
  edges: [
    {
      _uid: 'edge-1',
      type: 'knows',
      from: 'node-1',
      to: 'node-2',
      attributes: { strength: 3 },
    },
  ],
  ego: { _uid: 'ego-1', attributes: { age: 41 } },
};

describe('the network row mapping', () => {
  it('maps every entity field onto its column', () => {
    expect(nodeRow(network.nodes[0]!)).toEqual({
      nodeId: 'node-1',
      type: 'person',
      attributes: { name: 'Ada' },
      secureAttributes: { name: { iv: [1], salt: [2] } },
      stageId: 'stage-1',
      promptIds: ['prompt-1'],
    });
    expect(edgeRow(network.edges[0]!)).toEqual({
      edgeId: 'edge-1',
      type: 'knows',
      fromNode: 'node-1',
      toNode: 'node-2',
      attributes: { strength: 3 },
      secureAttributes: null,
    });
    expect(egoColumns(network.ego)).toEqual({
      egoUid: 'ego-1',
      egoAttributes: { age: 41 },
      egoSecureAttributes: null,
    });
  });

  it('reads rows back into the network it was given', () => {
    expect(
      networkFromRows({
        nodes: network.nodes.map(nodeRow),
        edges: network.edges.map(edgeRow),
        ego: egoColumns(network.ego),
      }),
    ).toEqual(network);
  });
});

describe('the snapshot payload', () => {
  it('is the canonical JSON of the network, stage metadata, position and finish, hashed', () => {
    const snapshot = snapshotPayload({
      network,
      stageMetadata: { 'stage-1': { step: 2 } },
      currentStep: 3,
      finishStageId: 'finish',
      finishOutcome: 'ineligible',
    });
    const expected = canonicalize({
      network,
      stageMetadata: { 'stage-1': { step: 2 } },
      currentStep: 3,
      finishStageId: 'finish',
      finishOutcome: 'ineligible',
    });
    expect(snapshot.payload).toBe(expected);
    expect(snapshot.payloadHash).toBe(
      createHash('sha256').update(expected).digest('hex'),
    );
  });

  it('does not depend on key order', () => {
    const reordered = snapshotPayload({
      finishOutcome: 'completed',
      finishStageId: 'finish',
      currentStep: 3,
      stageMetadata: {},
      network: { ego: network.ego, edges: network.edges, nodes: network.nodes },
    });
    expect(reordered).toEqual(
      snapshotPayload({
        network,
        stageMetadata: {},
        currentStep: 3,
        finishStageId: 'finish',
        finishOutcome: 'completed',
      }),
    );
  });
});
