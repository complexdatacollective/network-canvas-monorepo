import { describe, expect, it } from 'vitest';

import type { InterviewExportInput } from '@codaco/network-exporters/input';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { runPipelineWithData } from '../exportPipelineRunner';

const exportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

// Names that would have become the same file name, or none at all.
const nodeTypeNames = {
  upper: 'Close Friend',
  lower: 'close friend',
  punctuationA: 'close-friend',
  punctuationB: 'close.friend',
  joined: 'closefriend',
  cjk: '友人',
  otherCjk: '家族',
  empty: '???',
};

const codebook: Codebook = {
  node: Object.fromEntries(
    Object.entries(nodeTypeNames).map(([id, name]) => [
      id,
      {
        name,
        label: { en: name },
        color: 'node-color-seq-1' as const,
        shape: { default: 'circle' as const },
      },
    ]),
  ),
  edge: {},
};

const session: InterviewExportInput = {
  id: 'session-1',
  participantIdentifier: 'participant',
  startTime: new Date(0),
  finishTime: new Date(1000),
  protocolHash: 'hash-1',
  locale: null,
  network: {
    nodes: Object.keys(nodeTypeNames).map((type) => ({
      [entityPrimaryKeyProperty]: `node-${type}`,
      type,
      [entityAttributesProperty]: {},
    })),
    edges: [],
    ego: {
      [entityPrimaryKeyProperty]: 'ego-1',
      [entityAttributesProperty]: {},
    },
  },
};

describe('runPipelineWithData with entity types whose names collide as file names', () => {
  it('exports one distinct file per type into the zip', async () => {
    const run = await runPipelineWithData({
      data: {
        sessions: [session],
        protocols: {
          'hash-1': { hash: 'hash-1', name: 'Protocol', codebook },
        },
      },
      options: exportOptions,
    });

    const names = run.result.successfulExports.map(({ name }) => name);

    expect(run.result.status).toBe('success');
    expect(run.blob).not.toBeNull();
    // graphml + ego + one attribute list per node type; the edge list has
    // nothing to hold, so it is a single file.
    expect(names).toHaveLength(1 + 1 + Object.keys(nodeTypeNames).length + 1);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(
      names.length,
    );
    expect(names).toContain('participant_session-1_attributeList_友人.csv');
    expect(names).toContain(
      'participant_session-1_attributeList_close-friend.csv',
    );
    expect(names).toContain(
      'participant_session-1_attributeList_close.friend.csv',
    );
  });
});
