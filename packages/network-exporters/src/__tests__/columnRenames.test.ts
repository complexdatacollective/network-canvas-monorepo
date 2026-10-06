import { DOMParser, type Document, MIME_TYPE } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
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

// Names a protocol written before the editors refused them can still have:
// a built-in column's name, and a name another variable's column has.
const codebook: Codebook = {
  ego: {
    variables: {
      'ego-case': {
        name: 'networkCanvasCaseID',
        label: 'Network canvas case ID',
        type: 'text',
      },
    },
  },
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'p-id': { name: 'nodeID', label: 'Node ID', type: 'text' },
        'p-label': { name: 'label', label: 'Label', type: 'text' },
        'p-red': {
          name: 'Colour_red',
          label: 'Colour red',
          type: 'text',
        },
        'p-colour': {
          name: 'Colour',
          label: 'Colour',
          type: 'categorical',
          options: [
            { label: { en: 'Red' }, value: 'red' },
            { label: { en: 'Blue' }, value: 'blue' },
          ],
        },
      },
    },
  },
  edge: {
    knows: {
      name: 'Knows',
      label: { en: 'Knows' },
      color: 'edge-color-seq-1',
      variables: {
        'k-from': { name: 'from', label: 'From', type: 'text' },
      },
    },
  },
};

const interview = (id: string, suffix: string): InterviewExportInput => ({
  id,
  participantIdentifier: `case-${suffix}`,
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  locale: null,
  network: {
    nodes: [
      {
        [entityPrimaryKeyProperty]: `${id}-node-1`,
        type: 'person',
        [entityAttributesProperty]: {
          'p-id': `own id ${suffix}`,
          'p-label': `Label ${suffix}`,
          'p-red': `crimson ${suffix}`,
          'p-colour': ['blue'],
        },
      },
      {
        [entityPrimaryKeyProperty]: `${id}-node-2`,
        type: 'person',
        [entityAttributesProperty]: { 'p-colour': ['red'] },
      },
    ],
    edges: [
      {
        [entityPrimaryKeyProperty]: `${id}-edge-1`,
        from: `${id}-node-1`,
        to: `${id}-node-2`,
        type: 'knows',
        [entityAttributesProperty]: { 'k-from': `school ${suffix}` },
      },
    ],
    ego: {
      [entityPrimaryKeyProperty]: `${id}-ego`,
      [entityAttributesProperty]: { 'ego-case': `their case ${suffix}` },
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

// Each data row as a map from header to cell. No cell here holds a line break.
const csvRows = (csv: string) => {
  const [headerRow = '', ...rows] = csv.split('\r\n').filter(Boolean);
  const headers = parseCsvRecord(headerRow);
  return {
    headers,
    rows: rows.map((row) => {
      const cells = parseCsvRecord(row);
      return new Map(headers.map((header, index) => [header, cells[index]]));
    }),
  };
};

const renamed = (
  format: 'csv' | 'graphml',
  entity: 'ego' | 'node' | 'edge',
  variable: string,
  column: string,
  renamedTo: string,
): ExportWarning => ({
  kind: 'column-renamed',
  protocolName: 'Renames',
  format,
  entity,
  ...(entity === 'ego'
    ? {}
    : { entityTypeName: entity === 'node' ? 'Person' : 'Knows' }),
  variable,
  column,
  renamedTo,
});

describe('an export whose columns would share a name', () => {
  let files = new Map<string, string>();
  let warnings: ExportWarning[] = [];
  let graphml: Document;

  beforeAll(async () => {
    const run = await runRecordedExport(
      options,
      [interview('interview-a', 'a'), interview('interview-b', 'b')],
      { hash: 'protocol-1', name: 'Renames', codebook },
    );
    files = run.files;
    warnings = run.result.warnings;
    graphml = new DOMParser().parseFromString(
      fileFor(files, 'interview-a', '.graphml'),
      MIME_TYPE.XML_APPLICATION,
    );
  });

  it('writes every value of the node list under a column of its own', () => {
    const { headers, rows } = csvRows(
      fileFor(files, 'interview-a', 'Person.csv'),
    );

    expect(headers).toEqual([
      'nodeID',
      'networkCanvasEgoUUID',
      'networkCanvasUUID',
      'nodeID_2',
      'label',
      'Colour_red',
      'Colour_red_2',
      'Colour_blue',
    ]);
    expect(rows.map((row) => row.get('nodeID'))).toEqual(['1', '2']);
    expect(rows[0]?.get('nodeID_2')).toBe('own id a');
    expect(rows[0]?.get('Colour_red')).toBe('crimson a');
    expect(rows.map((row) => row.get('Colour_red_2'))).toEqual([
      'false',
      'true',
    ]);
    expect(rows.map((row) => row.get('Colour_blue'))).toEqual([
      'true',
      'false',
    ]);
  });

  it('writes the ego and edge values under columns of their own', () => {
    const ego = csvRows(fileFor(files, 'interview-a', '_ego.csv'));
    const edges = csvRows(fileFor(files, 'interview-a', 'Knows.csv'));

    expect(ego.rows[0]?.get('networkCanvasCaseID')).toBe('case-a');
    expect(ego.rows[0]?.get('networkCanvasCaseID_2')).toBe('their case a');
    expect(edges.rows[0]?.get('from')).toBe('1');
    expect(edges.rows[0]?.get('from_2')).toBe('school a');
  });

  it('writes every value of the GraphML file under a key of its own', () => {
    const keys = Array.from(graphml.getElementsByTagName('key'));
    const attrNameOf = (id: string) =>
      keys
        .find((key) => key.getAttribute('id') === id)
        ?.getAttribute('attr.name');
    const node = graphml.getElementsByTagName('node')[0];
    const data = new Map(
      Array.from(node?.getElementsByTagName('data') ?? []).map((datum) => [
        datum.getAttribute('key'),
        datum.textContent,
      ]),
    );

    expect(attrNameOf('label')).toBe('label');
    expect(attrNameOf('p-label')).toBe('label_2');
    expect(attrNameOf('p-red')).toBe('Colour_red');
    expect(data.get('p-label')).toBe('Label a');
    expect(data.get('p-red')).toBe('crimson a');

    const colourRed = keys.find(
      (key) => key.getAttribute('attr.name') === 'Colour_red_2',
    );
    expect(data.get(colourRed?.getAttribute('id') ?? '')).toBe('false');
  });

  it('reports each renamed column once, however many interviews it is in', () => {
    expect(
      warnings.filter((warning) => warning.kind === 'column-renamed'),
    ).toEqual(
      expect.arrayContaining([
        renamed('csv', 'node', 'nodeID', 'nodeID', 'nodeID_2'),
        renamed('csv', 'node', 'Colour', 'Colour_red', 'Colour_red_2'),
        renamed(
          'csv',
          'ego',
          'networkCanvasCaseID',
          'networkCanvasCaseID',
          'networkCanvasCaseID_2',
        ),
        renamed('csv', 'edge', 'from', 'from', 'from_2'),
        renamed('graphml', 'node', 'label', 'label', 'label_2'),
        renamed('graphml', 'node', 'Colour', 'Colour_red', 'Colour_red_2'),
      ]),
    );
    expect(warnings).toHaveLength(6);
  });
});
