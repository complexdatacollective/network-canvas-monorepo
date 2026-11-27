import { DOMParser, MIME_TYPE } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { parseCsvRecord } from '../formatters/__tests__/namesFixture';
import type { ExportCodebook, InterviewExportInput } from '../input';
import type { ExportOptions } from '../options';
import { runRecordedExport } from './exportHarness';
import { testTypeId, testVariableId } from './testIds';

const options: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

const layoutId = testVariableId('map');
const personType = testTypeId('person');

const codebook: Omit<ExportCodebook, 'layoutNodeTypes'> = {
  node: {
    [personType]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { [testVariableId('name')]: { name: 'name', type: 'text' } },
    },
  },
  layouts: { [layoutId]: { name: 'map' } },
};

// A participant skipped the stage that sets the layout: no node has a position.
const interview: InterviewExportInput = {
  id: 'interview-a',
  participantIdentifier: 'case-a',
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  finishOutcome: 'completed',
  network: {
    nodes: [
      {
        [entityPrimaryKeyProperty]: 'node-1',
        type: personType,
        [entityAttributesProperty]: { [testVariableId('name')]: 'Dee' },
      },
    ],
    edges: [],
    ego: {
      [entityPrimaryKeyProperty]: 'ego-1',
      [entityAttributesProperty]: {},
    },
  },
};

const fileEndingWith = (files: Map<string, string>, ending: string) => {
  const found = [...files].find(([name]) => name.endsWith(ending));
  if (!found) throw new Error(`No ${ending} file`);
  return found[1];
};

describe('an export of a layout no node holds a position in', () => {
  it('writes the columns and keys of the layout for the node types a stage places in it', async () => {
    const { files } = await runRecordedExport(options, [interview], {
      hash: 'protocol-1',
      name: 'Layouts',
      codebook,
      layoutNodeTypes: { [layoutId]: [personType] },
    });

    const [headerRow = ''] = fileEndingWith(files, 'Person.csv').split('\r\n');
    expect(parseCsvRecord(headerRow)).toEqual(
      expect.arrayContaining(['map_x', 'map_y']),
    );

    const keys = Array.from(
      new DOMParser()
        .parseFromString(
          fileEndingWith(files, '.graphml'),
          MIME_TYPE.XML_APPLICATION,
        )
        .getElementsByTagName('key'),
    );
    expect(
      keys
        .filter((key) => key.getAttribute('for') === 'node')
        .map((key) => key.getAttribute('attr.name')),
    ).toEqual(expect.arrayContaining(['map_X', 'map_Y']));
  });
});
