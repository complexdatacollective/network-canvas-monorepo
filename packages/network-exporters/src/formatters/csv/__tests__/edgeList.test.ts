import { describe, expect, it } from 'vitest';

import {
  edgeExportIDProperty,
  egoProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  ncSourceUUID,
  ncTargetUUID,
  protocolName,
} from '@codaco/shared-consts';

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
          type: 'mock-edge-type',
          [entityAttributesProperty]: { 'relationship-uuid': ['partner'] },
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
          type: 'mock-edge-type',
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
