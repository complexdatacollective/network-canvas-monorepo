import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  edgeExportIDProperty,
  egoProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  ncSourceUUID,
  ncTargetUUID,
  protocolName,
} from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../../../__tests__/testIds';
import type { SessionWithResequencedIDs } from '../../../input';
import { edgeListRows } from '../edgeList';
import { mockCodebook, mockExportOptions } from './mockObjects';

describe('edgeListRows', () => {
  it('yields header followed by one row per edge', () => {
    const network = {
      sessionVariables: { [protocolName]: 'Protocol' },
      nodes: [],
      edges: [
        {
          [edgeExportIDProperty]: 1,
          [egoProperty]: 'ego-1',
          [entityPrimaryKeyProperty]: 'edge-1',
          [ncSourceUUID]: 'n1',
          [ncTargetUUID]: 'n2',
          from: 1,
          to: 2,
          type: testTypeId('mock-edge-type'),
          [entityAttributesProperty]: {
            [testVariableId('relationship-uuid')]: ['partner'],
          },
        },
      ],
    };

    const rows = Array.from(
      edgeListRows(
        network as unknown as SessionWithResequencedIDs,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );

    // processEntityVariables expands the categorical attribute into one
    // boolean column per option.
    expect(rows).toEqual([
      'edgeID,from,to,networkCanvasEgoUUID,networkCanvasUUID,networkCanvasSourceUUID,networkCanvasTargetUUID,RelationshipType_parent,RelationshipType_partner,RelationshipType_friend\r\n',
      '1,1,2,ego-1,edge-1,n1,n2,false,true,false\r\n',
    ]);
  });

  it('a directed type writes one row per edge, source to target, with no new column', () => {
    const edgeType = testTypeId('mock-edge-type');
    const definition = mockCodebook.edge?.[edgeType];
    if (!definition) throw new Error('Missing edge type');
    const directedCodebook: Codebook = {
      ...mockCodebook,
      edge: {
        ...mockCodebook.edge,
        [edgeType]: { ...definition, directed: true },
      },
    };
    const edge = (id: number, from: number, to: number) => ({
      [edgeExportIDProperty]: id,
      [egoProperty]: 'ego-1',
      [entityPrimaryKeyProperty]: `edge-${id}`,
      [ncSourceUUID]: `n${from}`,
      [ncTargetUUID]: `n${to}`,
      from,
      to,
      type: edgeType,
      [entityAttributesProperty]: {},
    });
    // A reciprocal pair: each direction is its own edge.
    const network = {
      sessionVariables: { [protocolName]: 'Protocol' },
      nodes: [],
      edges: [edge(1, 1, 2), edge(2, 2, 1)],
    } as unknown as SessionWithResequencedIDs;
    const rowsFor = (codebook: Codebook) =>
      Array.from(
        edgeListRows(network, codebook, mockExportOptions, () => undefined),
      );

    const directedRows = rowsFor(directedCodebook);

    expect(directedRows).toEqual(rowsFor(mockCodebook));
    expect(directedRows).toEqual([
      'edgeID,from,to,networkCanvasEgoUUID,networkCanvasUUID,networkCanvasSourceUUID,networkCanvasTargetUUID,RelationshipType_parent,RelationshipType_partner,RelationshipType_friend\r\n',
      '1,1,2,ego-1,edge-1,n1,n2,,,\r\n',
      '2,2,1,ego-1,edge-2,n2,n1,,,\r\n',
    ]);
  });

  it('yields only the header for an empty edge set', () => {
    const network = {
      sessionVariables: { [protocolName]: 'Protocol' },
      nodes: [],
      edges: [],
    };
    const rows = Array.from(
      edgeListRows(
        network as unknown as SessionWithResequencedIDs,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it('includes declared columns that are unanswered by every edge', () => {
    const network = {
      sessionVariables: { [protocolName]: 'Protocol' },
      nodes: [],
      edges: [
        {
          [edgeExportIDProperty]: 1,
          [egoProperty]: 'ego-1',
          [entityPrimaryKeyProperty]: 'edge-1',
          [ncSourceUUID]: 'n1',
          [ncTargetUUID]: 'n2',
          from: '1',
          to: '2',
          type: testTypeId('mock-edge-type'),
          [entityAttributesProperty]: {},
        },
      ],
    };

    const rows = Array.from(
      edgeListRows(
        network as unknown as SessionWithResequencedIDs,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );

    expect(rows[0]).toContain('RelationshipType_parent');
    expect(rows[0]).toContain('RelationshipType_partner');
    expect(rows[0]).toContain('RelationshipType_friend');
  });
});
