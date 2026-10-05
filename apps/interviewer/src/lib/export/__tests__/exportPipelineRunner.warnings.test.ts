import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { InterviewExportInput } from '@codaco/network-exporters/input';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type { Codebook } from '@codaco/protocol-validation';

import { runPipelineWithData } from '../exportPipelineRunner';

// Built from a code point so that no control character sits in this source.
const control = String.fromCharCode(0x1);

const exportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 0,
    screenLayoutWidth: 0,
  },
  appVersion: 'test',
  commitHash: 'interviewer',
};

const codebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        nickname: { name: 'Nickname', label: { en: 'Nickname' }, type: 'text' },
      },
    },
  },
};

const session: InterviewExportInput = {
  id: 'session-1',
  participantIdentifier: 'P-7',
  startTime: new Date(0),
  finishTime: null,
  network: {
    nodes: [
      {
        _uid: 'node-1',
        type: 'person',
        attributes: { nickname: `Al${control}ice` },
      },
    ],
    edges: [],
    ego: { _uid: 'ego-1', attributes: {} },
  },
  protocolHash: 'hash-1',
  locale: null,
};

describe('runPipelineWithData with an answer GraphML cannot store', () => {
  it('returns the warning, strips the character from GraphML only, and keeps it in CSV', async () => {
    const run = await runPipelineWithData({
      data: {
        sessions: [session],
        protocols: {
          'hash-1': { hash: 'hash-1', name: 'Protocol', codebook },
        },
      },
      options: exportOptions,
    });

    expect(run.result.warnings).toEqual([
      {
        kind: 'xml-illegal-characters',
        sessionId: 'session-1',
        caseId: 'P-7',
        variables: ['Nickname'],
        caseIdChanged: false,
      },
    ]);

    if (!run.blob) throw new Error('The export produced no archive');
    const archive = await JSZip.loadAsync(await run.blob.arrayBuffer());
    const read = async (extension: string) => {
      const entry = Object.values(archive.files).find((file) =>
        file.name.endsWith(extension),
      );
      return entry?.async('string');
    };
    const graphml = await read('.graphml');
    const csv = await read('Person.csv');

    expect(graphml).toContain('Alice');
    expect(graphml).not.toContain(control);
    expect(csv).toContain(`Al${control}ice`);
  });
});
