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

// Three ego variables a protocol written before the locale column existed can
// have: two near misses, and the exact name the column is printed under.
const codebook: Codebook = {
  ego: {
    variables: {
      'ego-camel': { name: 'interviewLocale', type: 'text' },
      'ego-snake': { name: 'INTERVIEW_LOCALE', type: 'text' },
      'ego-printed': { name: 'networkCanvasInterviewLocale', type: 'text' },
    },
  },
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { 'p-nick': { name: 'Nickname', type: 'text' } },
    },
  },
};

const sessions = [
  { id: 'interview-es', locale: 'es' },
  { id: 'interview-pt', locale: 'pt-BR' },
  { id: 'interview-ar', locale: 'ar-EG' },
  { id: 'interview-und', locale: 'und' },
  { id: 'interview-none', locale: null },
] as const;

const interview = (
  id: string,
  locale: string | null,
): InterviewExportInput => ({
  id,
  participantIdentifier: `case-${id}`,
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  locale,
  network: {
    nodes: [
      {
        [entityPrimaryKeyProperty]: `${id}-node`,
        type: 'person',
        [entityAttributesProperty]: { 'p-nick': `nick ${id}` },
      },
    ],
    edges: [],
    ego: {
      [entityPrimaryKeyProperty]: `${id}-ego`,
      [entityAttributesProperty]: {
        'ego-camel': `camel ${id}`,
        'ego-snake': `snake ${id}`,
        'ego-printed': `printed ${id}`,
      },
    },
  },
});

const exportSessions = (locale: (own: string | null) => string | null) =>
  runRecordedExport(
    options,
    sessions.map(({ id, locale: own }) => interview(id, locale(own))),
    { hash: 'protocol-1', name: 'Locale', codebook },
  );

const fileFor = (files: Map<string, string>, id: string, ending: string) => {
  const found = [...files].find(
    ([name]) => name.includes(id) && name.endsWith(ending),
  );
  if (!found) throw new Error(`No ${ending} file for ${id}`);
  return found[1];
};

// The ego file's header, and its one row as a map from header to cell.
const egoRecord = (files: Map<string, string>, id: string) => {
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

const graphFor = (files: Map<string, string>, id: string): Document =>
  new DOMParser().parseFromString(
    fileFor(files, id, '.graphml'),
    MIME_TYPE.XML_APPLICATION,
  );

describe('an export of sessions held in different interview languages', () => {
  let files = new Map<string, string>();
  let warnings: ExportWarning[] = [];

  beforeAll(async () => {
    const run = await exportSessions((own) => own);
    files = run.files;
    warnings = run.result.warnings;
  });

  it('writes each session’s own locale to its ego file', () => {
    for (const { id, locale } of sessions) {
      expect(
        egoRecord(files, id).cells.get('networkCanvasInterviewLocale'),
      ).toBe(locale ?? '');
    }
  });

  it('writes the locale after the other session columns and before the variable columns', () => {
    expect(egoRecord(files, 'interview-es').headers).toEqual([
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
      'interviewLocale',
      'INTERVIEW_LOCALE',
      'networkCanvasInterviewLocale_2',
    ]);
  });

  it('keeps the answers to variables named like the locale in their own columns', () => {
    for (const { id } of sessions) {
      const { cells } = egoRecord(files, id);
      expect(cells.get('interviewLocale')).toBe(`camel ${id}`);
      expect(cells.get('INTERVIEW_LOCALE')).toBe(`snake ${id}`);
    }
  });

  it('renames a variable with the column’s printed name, and reports it once', () => {
    for (const { id } of sessions) {
      expect(
        egoRecord(files, id).cells.get('networkCanvasInterviewLocale_2'),
      ).toBe(`printed ${id}`);
    }
    expect(warnings).toEqual([
      {
        kind: 'column-renamed',
        protocolName: 'Locale',
        format: 'csv',
        entity: 'ego',
        variable: 'networkCanvasInterviewLocale',
        column: 'networkCanvasInterviewLocale',
        renamedTo: 'networkCanvasInterviewLocale_2',
      },
    ]);
  });

  it('writes the locale to each GraphML graph, and leaves it out when there is none', () => {
    for (const { id, locale } of sessions) {
      const graph = graphFor(files, id).getElementsByTagName('graph')[0];
      if (locale === null) {
        expect(graph?.hasAttribute('nc:interviewLocale')).toBe(false);
      } else {
        expect(graph?.getAttribute('nc:interviewLocale')).toBe(locale);
      }
    }
  });

  it('keeps variables named like the locale as ordinary GraphML attributes', () => {
    const document = graphFor(files, 'interview-es');
    const keys = Array.from(document.getElementsByTagName('key'));
    const attrNameOf = (id: string) =>
      keys
        .find((key) => key.getAttribute('id') === id)
        ?.getAttribute('attr.name');
    const dataOf = (id: string) =>
      Array.from(document.getElementsByTagName('data'))
        .filter((data) => data.getAttribute('key') === id)
        .map((data) => data.textContent);

    expect(attrNameOf('ego-camel')).toBe('interviewLocale');
    expect(attrNameOf('ego-snake')).toBe('INTERVIEW_LOCALE');
    expect(attrNameOf('ego-printed')).toBe('networkCanvasInterviewLocale');
    expect(dataOf('ego-printed')).toEqual(['printed interview-es']);
  });
});

describe('the language an interview was held in', () => {
  const analysisShape = (files: Map<string, string>) => ({
    csvHeaders: [...files]
      .filter(([name]) => name.endsWith('.csv'))
      .map(([name, content]) => [name, content.split('\r\n')[0]])
      .toSorted(([a], [b]) => String(a).localeCompare(String(b))),
    graphmlKeys: [...files]
      .filter(([name]) => name.endsWith('.graphml'))
      .map(([name, content]) => [
        name,
        Array.from(
          new DOMParser()
            .parseFromString(content, MIME_TYPE.XML_APPLICATION)
            .getElementsByTagName('key'),
        ).map((key) => [key.getAttribute('id'), key.getAttribute('attr.name')]),
      ])
      .toSorted(([a], [b]) => String(a).localeCompare(String(b))),
  });

  it('does not change the headers or keys the analysis schema is built from', async () => {
    const spanish = await exportSessions(() => 'es');
    const arabic = await exportSessions(() => 'ar-EG');
    const unreported = await exportSessions(() => null);

    const shape = analysisShape(spanish.files);
    expect(shape.csvHeaders.length).toBeGreaterThan(0);
    expect(shape.graphmlKeys.length).toBeGreaterThan(0);
    expect(analysisShape(arabic.files)).toEqual(shape);
    expect(analysisShape(unreported.files)).toEqual(shape);
  });
});
