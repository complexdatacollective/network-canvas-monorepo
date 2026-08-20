import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { ProtocolPayload } from '../../contract/types';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import { getPlacedNodes, getUnplacedNodes } from '../canvas';

describe('Sociogram placement selectors', () => {
  it('classifies a node with no layout key as unplaced', () => {
    const layoutVariable = asEntityAttributeReference('layout');
    const protocolState: ProtocolPayload = {
      id: 'protocol',
      hash: 'hash',
      importedAt: '2026-08-12T00:00:00.000Z',
      assets: [],
      name: 'Test protocol',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              layout: { name: 'Layout', type: 'layout' },
            },
          },
        },
        edge: {},
        ego: { variables: {} },
      },
      stages: [
        {
          id: 'sociogram',
          type: 'Sociogram',
          label: 'Sociogram',
          background: { concentricCircles: 4 },
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt',
              text: 'Arrange people',
              layout: { layoutVariable },
            },
          ],
        },
      ] satisfies CurrentProtocol['stages'],
    };
    const missingLayoutNode: NcNode = {
      [entityPrimaryKeyProperty]: 'missing-layout',
      type: 'person',
      [entityAttributesProperty]: {},
    };
    const placedNode: NcNode = {
      [entityPrimaryKeyProperty]: 'placed',
      type: 'person',
      [entityAttributesProperty]: {
        layout: { x: 0.5, y: 0.5 },
      },
    };

    const store = configureStore({
      reducer: { session, protocol, ui },
      preloadedState: {
        session: {
          id: 'session',
          startTime: '2026-08-12T00:00:00.000Z',
          finishTime: null,
          exportTime: null,
          lastUpdated: '2026-08-12T00:00:00.000Z',
          promptIndex: 0,
          network: {
            ego: {
              [entityPrimaryKeyProperty]: 'ego',
              [entityAttributesProperty]: {},
            },
            nodes: [missingLayoutNode, placedNode],
            edges: [],
          },
        },
        protocol: protocolState,
      },
    });

    expect(
      getUnplacedNodes(store.getState(), 0).map(
        (node) => node[entityPrimaryKeyProperty],
      ),
    ).toEqual(['missing-layout']);
    expect(
      getPlacedNodes(store.getState(), 0).map(
        (node) => node[entityPrimaryKeyProperty],
      ),
    ).toEqual(['placed']);
  });
});
