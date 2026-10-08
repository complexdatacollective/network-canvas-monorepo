import { DOMParser, MIME_TYPE } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Codebook, FinishOutcome } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { parseCsvRecord } from '../formatters/__tests__/namesFixture';
import type { InterviewExportInput } from '../input';
import type { ExportOptions } from '../options';
import type { ExportWarning } from '../output';
import { runRecordedExport } from './exportHarness';

const options: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

// Ego variables a protocol written before the outcome column existed can have:
// the internal name, which stays an ordinary column, and the printed name.
const codebook: Codebook = {
  ego: {
    variables: {
      'ego-internal': {
        name: 'finishOutcome',
        label: 'Finish outcome',
        type: 'text',
      },
      'ego-printed': {
        name: 'networkCanvasFinishOutcome',
        label: 'Network canvas finish outcome',
        type: 'text',
      },
    },
  },
  node: {},
};

const sessions: readonly {
  id: string;
  finishOutcome: FinishOutcome | null;
}[] = [
  { id: 'interview-completed', finishOutcome: 'completed' },
  { id: 'interview-ineligible', finishOutcome: 'ineligible' },
  { id: 'interview-terminated', finishOutcome: 'terminated' },
  { id: 'interview-unrecorded', finishOutcome: null },
];

const interview = (
  id: string,
  finishOutcome: FinishOutcome | null,
): InterviewExportInput => ({
  id,
  participantIdentifier: `case-${id}`,
  startTime: new Date('2025-01-01'),
  finishTime: finishOutcome ? new Date('2025-01-02') : null,
  protocolHash: 'protocol-1',
  locale: 'en',
  finishOutcome,
  network: {
    nodes: [],
    edges: [],
    ego: {
      [entityPrimaryKeyProperty]: `${id}-ego`,
      [entityAttributesProperty]: {
        'ego-internal': `internal ${id}`,
        'ego-printed': `printed ${id}`,
      },
    },
  },
});

const fileFor = (files: Map<string, string>, id: string, ending: string) => {
  const found = [...files].find(
    ([name]) => name.includes(id) && name.endsWith(ending),
  );
  if (!found) throw new Error(`No ${ending} file for ${id}`);
  return found[1];
};

const egoCells = (files: Map<string, string>, id: string) => {
  const [headerRow = '', row = ''] = fileFor(files, id, '_ego.csv')
    .split('\r\n')
    .filter(Boolean);
  const headers = parseCsvRecord(headerRow);
  const cells = parseCsvRecord(row);
  return {
    headers,
    cells: new Map(headers.map((header, index) => [header, cells[index]])),
  };
};

const graphFor = (files: Map<string, string>, id: string) =>
  new DOMParser()
    .parseFromString(fileFor(files, id, '.graphml'), MIME_TYPE.XML_APPLICATION)
    .getElementsByTagName('graph')[0];

describe('an export of sessions that ended in different ways', () => {
  let files = new Map<string, string>();
  let warnings: ExportWarning[] = [];

  beforeAll(async () => {
    const run = await runRecordedExport(
      options,
      sessions.map(({ id, finishOutcome }) => interview(id, finishOutcome)),
      { hash: 'protocol-1', name: 'Outcome', codebook },
    );
    files = run.files;
    warnings = run.result.warnings;
  });

  it('writes each session’s outcome to its ego file, and leaves it empty when none was recorded', () => {
    for (const { id, finishOutcome } of sessions) {
      expect(egoCells(files, id).cells.get('networkCanvasFinishOutcome')).toBe(
        finishOutcome ?? '',
      );
    }
  });

  it('writes the outcome after the interview language, before the variable columns', () => {
    expect(egoCells(files, 'interview-completed').headers).toEqual([
      'networkCanvasEgoUUID',
      'networkCanvasCaseID',
      'networkCanvasSessionID',
      'networkCanvasProtocolName',
      'sessionStart',
      'sessionFinish',
      'sessionExported',
      'APP_VERSION',
      'COMMIT_HASH',
      'networkCanvasInterviewLocale',
      'networkCanvasFinishOutcome',
      'finishOutcome',
      'networkCanvasFinishOutcome_2',
    ]);
  });

  it('keeps a variable named like the outcome, and renames one with its printed name', () => {
    for (const { id } of sessions) {
      const { cells } = egoCells(files, id);
      expect(cells.get('finishOutcome')).toBe(`internal ${id}`);
      expect(cells.get('networkCanvasFinishOutcome_2')).toBe(`printed ${id}`);
    }
    expect(warnings).toEqual([
      {
        kind: 'column-renamed',
        protocolName: 'Outcome',
        format: 'csv',
        entity: 'ego',
        variable: 'networkCanvasFinishOutcome',
        column: 'networkCanvasFinishOutcome',
        renamedTo: 'networkCanvasFinishOutcome_2',
      },
    ]);
  });

  it('writes the outcome to each GraphML graph, and leaves it out when none was recorded', () => {
    for (const { id, finishOutcome } of sessions) {
      const graph = graphFor(files, id);
      if (finishOutcome === null) {
        expect(graph?.hasAttribute('nc:finishOutcome')).toBe(false);
      } else {
        expect(graph?.getAttribute('nc:finishOutcome')).toBe(finishOutcome);
      }
    }
  });
});
