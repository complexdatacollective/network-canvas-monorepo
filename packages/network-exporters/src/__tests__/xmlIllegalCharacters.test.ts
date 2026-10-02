import {
  DOMParser,
  type Document,
  MIME_TYPE,
  XMLSerializer,
} from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewExportInput } from '../input';
import type { ExportOptions } from '../options';
import type { ExportWarning } from '../output';
import { runRecordedExport } from './exportHarness';

// Built from code points so that no control character sits in this source.
const control = String.fromCharCode(0x1);
const bell = String.fromCharCode(0x7);
const loneSurrogate = String.fromCharCode(0xd800);
const nonCharacter = String.fromCharCode(0xffff);

const graphmlAndCsv: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

const codebook: Codebook = {
  ego: {
    variables: { 'ego-note': { name: 'Ego note', type: 'text' } },
  },
  node: {
    person: {
      // A name with a character XML cannot hold, as protocol text can carry.
      name: `Per${control}son`,
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'p-nick': { name: 'Nickname', type: 'text' },
        'p-odd': { name: `Odd${control}name`, type: 'text' },
        'p-colour': {
          name: 'Colour',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
        },
      },
    },
  },
  edge: {
    knows: {
      name: 'Knows',
      color: 'edge-color-seq-1',
      variables: { 'e-note': { name: 'Edge note', type: 'text' } },
    },
  },
};

const badCaseId = `P${control}-7`;

const interviewWithBadCharacters: InterviewExportInput = {
  id: 'interview-bad',
  participantIdentifier: badCaseId,
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  network: {
    nodes: [
      {
        [entityPrimaryKeyProperty]: 'node-1',
        type: 'person',
        [entityAttributesProperty]: {
          'p-nick': `Al${bell}ice`,
          'p-odd': 'plain',
          'p-colour': ['red'],
          // Not in the codebook: an attribute that came with a roster.
          'roster-note': `from${nonCharacter}roster`,
        },
      },
      {
        [entityPrimaryKeyProperty]: 'node-2',
        type: 'person',
        [entityAttributesProperty]: { 'p-nick': `Bob${loneSurrogate}` },
      },
      {
        [entityPrimaryKeyProperty]: 'node-3',
        type: 'person',
        // Everything XML allows survives: other scripts, astral characters,
        // and the whitespace controls.
        [entityAttributesProperty]: { 'p-nick': '日本語 😀 Café\tx\ny' },
      },
    ],
    edges: [
      {
        [entityPrimaryKeyProperty]: 'edge-1',
        from: 'node-1',
        to: 'node-2',
        type: 'knows',
        [entityAttributesProperty]: { 'e-note': `${control}edge` },
      },
    ],
    ego: {
      [entityPrimaryKeyProperty]: 'ego-1',
      [entityAttributesProperty]: { 'ego-note': `before${control}after` },
    },
  },
};

const cleanInterview: InterviewExportInput = {
  id: 'interview-clean',
  participantIdentifier: 'P-8',
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  network: {
    nodes: [
      {
        [entityPrimaryKeyProperty]: 'node-4',
        type: 'person',
        [entityAttributesProperty]: { 'p-nick': 'Carol' },
      },
    ],
    edges: [],
    ego: {
      [entityPrimaryKeyProperty]: 'ego-2',
      [entityAttributesProperty]: { 'ego-note': 'fine' },
    },
  },
};

// xmldom's parser is lenient, but its serializer applies the XML `Char`
// production to every text node and attribute value when asked to require a
// well-formed document, so a round trip through both is a strict check that
// does not depend on the code under test.
const expectWellFormed = (xml: string) => {
  const document = new DOMParser().parseFromString(
    xml,
    MIME_TYPE.XML_APPLICATION,
  );
  // The root element: the XML declaration is written as a processing
  // instruction, which that check rejects for its reserved target.
  const root = document.documentElement;
  if (!root) throw new Error('The document has no root element');
  expect(() =>
    new XMLSerializer().serializeToString(root, { requireWellFormed: true }),
  ).not.toThrow();
  return document;
};

const dataValues = (document: Document, key: string) =>
  Array.from(document.getElementsByTagName('data'))
    .filter((data) => data.getAttribute('key') === key)
    .map((data) => data.textContent);

const fileFor = (files: Map<string, string>, id: string, extension: string) => {
  const found = [...files].find(
    ([name]) => name.includes(id) && name.endsWith(extension),
  );
  if (!found) throw new Error(`No ${extension} file for ${id}`);
  return found;
};

const runExport = (
  options: ExportOptions,
  interviews: InterviewExportInput[],
) =>
  runRecordedExport(options, interviews, {
    hash: 'protocol-1',
    name: `Protocol${control}`,
    codebook,
  });

describe('GraphML files for answers holding characters XML cannot store', () => {
  let files = new Map<string, string>();
  let warnings: ExportWarning[] = [];
  let document: Document;

  const answerWarnings = () =>
    warnings.filter((warning) => warning.kind === 'xml-illegal-characters');

  beforeAll(async () => {
    const run = await runExport(graphmlAndCsv, [
      interviewWithBadCharacters,
      cleanInterview,
    ]);
    files = run.files;
    warnings = run.result.warnings;
    document = expectWellFormed(fileFor(files, 'interview-bad', '.graphml')[1]);
  });

  it('writes a well-formed document that a strict reader accepts', () => {
    expect(document.getElementsByTagName('graphml')).toHaveLength(1);
    expectWellFormed(fileFor(files, 'interview-clean', '.graphml')[1]);
  });

  it('removes the characters from answers, and nothing else', () => {
    expect(dataValues(document, 'ego-note')).toEqual(['beforeafter']);
    expect(dataValues(document, 'p-nick')).toEqual([
      'Alice',
      'Bob',
      '日本語 😀 Café\tx\ny',
    ]);
    expect(dataValues(document, 'e-note')).toEqual(['edge']);
  });

  it('removes them from roster attributes, which have no codebook entry', () => {
    const [rosterKey] = Array.from(document.getElementsByTagName('key')).filter(
      (key) => key.getAttribute('attr.name') === 'roster-note',
    );
    const id = rosterKey?.getAttribute('id') ?? '';

    expect(id).not.toBe('');
    expect(dataValues(document, id)).toEqual(['fromroster']);
  });

  it('removes them from the case ID and the protocol name', () => {
    const graph = document.getElementsByTagName('graph')[0];

    expect(graph?.getAttribute('nc:caseId')).toBe('P-7');
    expect(graph?.getAttribute('nc:protocolName')).toBe('Protocol');
  });

  it('removes them from names the protocol authored', () => {
    const [oddKey] = Array.from(document.getElementsByTagName('key')).filter(
      (key) => key.getAttribute('id') === 'p-odd',
    );

    expect(oddKey?.getAttribute('attr.name')).toBe('Odd_name');
    expect(oddKey?.getElementsByTagName('desc')[0]?.textContent).toBe(
      'Oddname',
    );
    expect(dataValues(document, 'networkCanvasType')).toEqual([
      'Person',
      'Person',
      'Person',
      'Knows',
    ]);
  });

  it('still reads a categorical answer against its option', () => {
    const redKey = Array.from(document.getElementsByTagName('key')).find(
      (key) => key.getAttribute('attr.name') === 'Colour_red',
    );

    expect(dataValues(document, redKey?.getAttribute('id') ?? '')[0]).toBe(
      'true',
    );
  });

  it('reports which interview and which variables lost characters', () => {
    expect(answerWarnings()).toEqual([
      {
        kind: 'xml-illegal-characters',
        sessionId: 'interview-bad',
        caseId: badCaseId,
        variables: ['Ego note', 'Nickname', 'roster-note', 'Edge note'],
        caseIdChanged: true,
      },
    ]);
  });

  it('does not report an interview whose answers were already storable', () => {
    expect(answerWarnings().map((warning) => warning.sessionId)).not.toContain(
      'interview-clean',
    );
  });

  it('names a variable once however many answers lost characters', () => {
    const nicknames = answerWarnings().flatMap((warning) =>
      warning.variables.filter((name) => name === 'Nickname'),
    );

    expect(nicknames).toEqual(['Nickname']);
  });

  it("reports the protocol's own text that lost characters, once for the protocol", () => {
    expect(
      warnings.filter(
        (warning) => warning.kind === 'xml-illegal-characters-in-protocol',
      ),
    ).toEqual([
      {
        kind: 'xml-illegal-characters-in-protocol',
        protocolName: `Protocol${control}`,
        text: 'column-name',
        original: `Odd${control}name`,
      },
      {
        kind: 'xml-illegal-characters-in-protocol',
        protocolName: `Protocol${control}`,
        text: 'protocol-name',
        original: `Protocol${control}`,
      },
      {
        kind: 'xml-illegal-characters-in-protocol',
        protocolName: `Protocol${control}`,
        text: 'node-type-name',
        original: `Per${control}son`,
      },
    ]);
    expect(warnings).toHaveLength(4);
  });
});

describe('the CSV files of the same interview', () => {
  let withGraphML = new Map<string, string>();
  let csvOnly = new Map<string, string>();
  let csvOnlyWarnings: unknown[] = [];

  beforeAll(async () => {
    const both = await runExport(graphmlAndCsv, [interviewWithBadCharacters]);
    const csv = await runExport({ ...graphmlAndCsv, exportGraphML: false }, [
      interviewWithBadCharacters,
    ]);
    withGraphML = both.files;
    csvOnly = csv.files;
    csvOnlyWarnings = csv.result.warnings;
  });

  it('keep every answer exactly as given', () => {
    const [, attributes] = fileFor(withGraphML, 'interview-bad', 'Person.csv');
    const [, ego] = fileFor(withGraphML, 'interview-bad', '_ego.csv');

    expect(attributes).toContain(`Al${bell}ice`);
    expect(attributes).toContain(`from${nonCharacter}roster`);
    expect(ego).toContain(`before${control}after`);
    expect(ego).toContain(badCaseId);
  });

  it('are the same whether or not GraphML is exported', () => {
    // Not the ego file, which records the time of each export.
    for (const [name, text] of csvOnly) {
      if (name.includes('_ego')) continue;
      expect(withGraphML.get(name)).toBe(text);
    }
    expect([...csvOnly.keys()].some((name) => name.endsWith('.csv'))).toBe(
      true,
    );
  });

  it('raise no warning, since CSV can hold the characters', () => {
    expect(csvOnlyWarnings).toEqual([]);
  });
});
