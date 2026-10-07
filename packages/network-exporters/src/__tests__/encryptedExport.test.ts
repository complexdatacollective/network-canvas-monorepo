import {
  DOMParser,
  type Document,
  type Element,
  MIME_TYPE,
} from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEncryptionHeader,
  ncUUIDProperty,
} from '@codaco/shared-consts';

import { parseCsvRecord } from '../formatters/__tests__/namesFixture';
import type { InterviewExportInput } from '../input';
import type { ExportOptions } from '../options';
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

const codebook: Codebook = {
  ego: {
    variables: { 'e-note': { name: 'note', label: 'Note', type: 'text' } },
  },
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'p-name': {
          name: 'name',
          label: 'Name',
          type: 'text',
          encrypted: true,
        },
        'p-nickname': {
          name: 'nickname',
          label: 'Nickname',
          type: 'text',
          encrypted: true,
        },
        'p-city': { name: 'city', label: 'City', type: 'text' },
      },
    },
  },
  edge: {
    knows: {
      name: 'Knows',
      label: { en: 'Knows' },
      color: 'edge-color-seq-1',
      variables: {
        'k-since': { name: 'since', label: 'Since', type: 'text' },
      },
    },
  },
};

// Long and unlike each other, so that finding one of them written anywhere in
// a file can only mean the exporter wrote that value.
const nameCiphertext = [
  201, 17, 93, 4, 250, 66, 128, 7, 33, 180, 2, 99, 140, 60, 11, 222, 75, 38,
  147, 19, 205, 88, 164, 53,
];
const nicknameCiphertext = [
  134, 71, 9, 192, 244, 28, 117, 163, 85, 46, 231, 12, 109, 198, 57, 80, 175,
  23, 156, 62, 219, 40, 91, 133,
];
const valueIv = [15, 243, 77, 120, 6, 189, 52, 211, 34, 148, 99, 170];
const valueSalt = [
  44, 130, 213, 61, 8, 177, 25, 240, 96, 151, 72, 188, 3, 119, 232, 54,
];

const encryptionHeader: NcEncryptionHeader = {
  version: 1,
  method: 'AES-256-GCM',
  kdf: {
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600_000,
    salt: [
      168, 29, 241, 116, 83, 207, 14, 155, 70, 222, 37, 129, 193, 48, 104, 236,
    ],
  },
  check: {
    iv: [183, 56, 249, 21, 142, 97, 208, 63, 125, 30, 164, 245],
    data: [
      92, 167, 18, 234, 79, 146, 31, 203, 58, 121, 190, 5, 252, 67, 138, 24,
      179, 100, 215, 42,
    ],
  },
};

type ValueMetadata = { iv: number[]; salt?: number[] };

const secureAttributes = (
  metadata: ValueMetadata,
  ...variableIds: string[]
) => ({
  [entitySecureAttributesMeta]: Object.fromEntries(
    variableIds.map((variableId) => [variableId, metadata]),
  ),
});

const interview = (
  metadata: ValueMetadata,
  header?: NcEncryptionHeader,
): InterviewExportInput => ({
  id: 'interview-1',
  participantIdentifier: 'case-1',
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  locale: null,
  network: {
    ...(header ? { encryption: header } : {}),
    nodes: [
      {
        [entityPrimaryKeyProperty]: 'node-1',
        type: 'person',
        [entityAttributesProperty]: {
          'p-name': nameCiphertext,
          'p-city': 'Lisbon',
        },
        ...secureAttributes(metadata, 'p-name'),
      },
      {
        [entityPrimaryKeyProperty]: 'node-2',
        type: 'person',
        [entityAttributesProperty]: {
          'p-name': nameCiphertext,
          'p-nickname': nicknameCiphertext,
          'p-city': 'Porto',
        },
        ...secureAttributes(metadata, 'p-name', 'p-nickname'),
      },
    ],
    edges: [
      {
        [entityPrimaryKeyProperty]: 'edge-1',
        from: 'node-1',
        to: 'node-2',
        type: 'knows',
        [entityAttributesProperty]: { 'k-since': '2019' },
      },
    ],
    ego: {
      [entityPrimaryKeyProperty]: 'ego-1',
      [entityAttributesProperty]: { 'e-note': 'visible to the researcher' },
    },
  },
});

const fileEnding = (files: Map<string, string>, ending: string) => {
  const found = [...files].find(([name]) => name.endsWith(ending));
  if (!found) throw new Error(`No ${ending} file was written`);
  return found[1];
};

const csvRows = (csv: string) => {
  const [headerRow = '', ...rows] = csv.split('\r\n').filter(Boolean);
  const headers = parseCsvRecord(headerRow);
  return rows.map((row) => {
    const cells = parseCsvRecord(row);
    return new Map(headers.map((header, index) => [header, cells[index]]));
  });
};

const dataOf = (element: Element | undefined) =>
  new Map(
    Array.from(element?.getElementsByTagName('data') ?? []).map((datum) => [
      datum.getAttribute('key'),
      datum.textContent,
    ]),
  );

// Everything the header, a value's metadata and a stored ciphertext are made
// of, as each would be written if the exporter serialised it.
const secretsOf = (metadata: ValueMetadata, header?: NcEncryptionHeader) => [
  'encryption',
  'AES-256-GCM',
  'PBKDF2',
  'SHA-256',
  'iterations',
  '600000',
  entitySecureAttributesMeta,
  nameCiphertext.join(','),
  nicknameCiphertext.join(','),
  metadata.iv.join(','),
  ...(metadata.salt ? [metadata.salt.join(',')] : []),
  ...(header
    ? [
        header.kdf.salt.join(','),
        header.check.iv.join(','),
        header.check.data.join(','),
      ]
    : []),
];

describe.each([
  {
    label: 'a network with an encryption header and metadata without a salt',
    metadata: { iv: valueIv },
    header: encryptionHeader,
  },
  {
    label: 'a schema 8 network with metadata that has a salt and no header',
    metadata: { iv: valueIv, salt: valueSalt },
    header: undefined,
  },
])('an export of $label', ({ metadata, header }) => {
  let files = new Map<string, string>();
  let failedExports: unknown[] = [];
  let graphml: Document;

  beforeAll(async () => {
    const run = await runRecordedExport(
      options,
      [interview(metadata, header)],
      { hash: 'protocol-1', name: 'Secure protocol', codebook },
    );
    files = run.files;
    failedExports = run.result.failedExports;
    graphml = new DOMParser().parseFromString(
      fileEnding(files, '.graphml'),
      MIME_TYPE.XML_APPLICATION,
    );
  });

  it('succeeds without a failure for the session', () => {
    expect(failedExports).toEqual([]);
  });

  it('writes the marker in place of each encrypted value in the node list', () => {
    const rows = csvRows(fileEnding(files, 'Person.csv'));

    expect(rows.map((row) => row.get('name'))).toEqual([
      'ENCRYPTED',
      'ENCRYPTED',
    ]);
    expect(rows.map((row) => row.get('nickname'))).toEqual(['', 'ENCRYPTED']);
    expect(rows.map((row) => row.get('city'))).toEqual(['Lisbon', 'Porto']);
  });

  it('writes the marker in place of each encrypted value in the GraphML file', () => {
    const [first, second] = Array.from(graphml.getElementsByTagName('node'));
    const firstData = dataOf(first);
    const secondData = dataOf(second);

    expect(firstData.get('p-name')).toBe('ENCRYPTED');
    expect(secondData.get('p-name')).toBe('ENCRYPTED');
    expect(firstData.has('p-nickname')).toBe(false);
    expect(secondData.get('p-nickname')).toBe('ENCRYPTED');
    expect(firstData.get('p-city')).toBe('Lisbon');
    expect(secondData.get('p-city')).toBe('Porto');
  });

  it('labels a node with an encrypted name without its value', () => {
    const labels = Array.from(graphml.getElementsByTagName('node')).map(
      (node) => dataOf(node).get('label'),
    );

    expect(labels).toEqual(['Encrypted', 'Encrypted']);
  });

  it('still writes the values that are not encrypted', () => {
    expect(csvRows(fileEnding(files, '_ego.csv'))[0]?.get('note')).toBe(
      'visible to the researcher',
    );
    expect(csvRows(fileEnding(files, 'Knows.csv'))[0]?.get('since')).toBe(
      '2019',
    );
  });

  it('writes no ciphertext, metadata or encryption header to any file', () => {
    const everything = [...files.values()].join('\n');

    expect(
      secretsOf(metadata, header).filter((secret) =>
        everything.includes(secret),
      ),
    ).toEqual([]);
  });
});

// Variables the codebook does not mark encrypted, whose values each entity
// records as encrypted (as a protocol re-imported without its encryption
// would leave them), and a type whose name the codebook does mark encrypted.
const recordedCodebook: Codebook = {
  ego: {
    variables: { 'e-note': { name: 'note', label: 'Note', type: 'text' } },
  },
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'p-name': { name: 'name', label: 'Name', type: 'text' },
        'p-age': { name: 'age', label: 'Age', type: 'number' },
        'p-pets': {
          name: 'pets',
          label: 'Pets',
          type: 'categorical',
          options: [
            { label: { en: 'Cat' }, value: 'cat' },
            { label: { en: 'Dog' }, value: 'dog' },
          ],
        },
        'p-city': { name: 'city', label: 'City', type: 'text' },
      },
    },
    contact: {
      name: 'Contact',
      label: { en: 'Contact' },
      color: 'node-color-seq-2',
      shape: { default: 'circle' },
      variables: {
        'c-name': {
          name: 'name',
          label: 'Name',
          type: 'text',
          encrypted: true,
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
        'k-since': { name: 'since', label: 'Since', type: 'text' },
      },
    },
  },
};

const recordedInterview: InterviewExportInput = {
  id: 'interview-1',
  participantIdentifier: 'case-1',
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  locale: null,
  network: {
    encryption: encryptionHeader,
    nodes: [
      {
        [entityPrimaryKeyProperty]: 'person-1',
        type: 'person',
        [entityAttributesProperty]: {
          'p-name': nameCiphertext,
          'p-age': nameCiphertext,
          'p-pets': nameCiphertext,
          'p-city': 'Lisbon',
          'roster-note': nameCiphertext,
        },
        ...secureAttributes(
          { iv: valueIv },
          'p-name',
          'p-age',
          'p-pets',
          'roster-note',
        ),
      },
      {
        // Encrypted, and its record lost: still never written.
        [entityPrimaryKeyProperty]: 'contact-1',
        type: 'contact',
        [entityAttributesProperty]: { 'c-name': nicknameCiphertext },
      },
      {
        // Written in the clear, as a roster's names are.
        [entityPrimaryKeyProperty]: 'contact-2',
        type: 'contact',
        [entityAttributesProperty]: { 'c-name': 'Ana from the roster' },
      },
    ],
    edges: [
      {
        [entityPrimaryKeyProperty]: 'edge-1',
        from: 'person-1',
        to: 'contact-1',
        type: 'knows',
        [entityAttributesProperty]: { 'k-since': nameCiphertext },
        ...secureAttributes({ iv: valueIv }, 'k-since'),
      },
    ],
    ego: {
      [entityPrimaryKeyProperty]: 'ego-1',
      [entityAttributesProperty]: { 'e-note': nameCiphertext },
      ...secureAttributes({ iv: valueIv }, 'e-note'),
    },
  },
};

describe('an export of values whose storage, not the codebook, says they are encrypted', () => {
  let files = new Map<string, string>();
  let failedExports: unknown[] = [];
  let graphml: Document;

  beforeAll(async () => {
    const run = await runRecordedExport(options, [recordedInterview], {
      hash: 'protocol-1',
      name: 'Secure protocol',
      codebook: recordedCodebook,
    });
    files = run.files;
    failedExports = run.result.failedExports;
    graphml = new DOMParser().parseFromString(
      fileEnding(files, '.graphml'),
      MIME_TYPE.XML_APPLICATION,
    );
  });

  const graphmlKeys = () =>
    new Map(
      Array.from(graphml.getElementsByTagName('key')).map((key) => [
        key.getAttribute('id'),
        {
          name: key.getAttribute('attr.name'),
          type: key.getAttribute('attr.type'),
        },
      ]),
    );

  // Each datum of an element, by the column name of its key.
  const namedDataOf = (element: Element | undefined) => {
    const keys = graphmlKeys();
    return new Map(
      [...dataOf(element)].map(([key, value]) => [
        (key !== null && keys.get(key)?.name) || key,
        value,
      ]),
    );
  };

  const graphmlNode = (id: string) =>
    Array.from(graphml.getElementsByTagName('node')).find(
      (node) => dataOf(node).get(ncUUIDProperty) === id,
    );

  it('succeeds without a failure for the session', () => {
    expect(failedExports).toEqual([]);
  });

  it('writes the marker for every value an entity records as encrypted, in every CSV file', () => {
    const [person] = csvRows(fileEnding(files, 'Person.csv'));

    expect(
      ['name', 'age', 'pets_cat', 'pets_dog', 'roster-note'].map((column) =>
        person?.get(column),
      ),
    ).toEqual(Array.from({ length: 5 }, () => 'ENCRYPTED'));
    expect(person?.get('city')).toBe('Lisbon');
    expect(csvRows(fileEnding(files, 'Knows.csv'))[0]?.get('since')).toBe(
      'ENCRYPTED',
    );
    expect(csvRows(fileEnding(files, '_ego.csv'))[0]?.get('note')).toBe(
      'ENCRYPTED',
    );
  });

  it('writes the marker for every value an entity records as encrypted, in the GraphML file, under keys that hold text', () => {
    const person = namedDataOf(graphmlNode('person-1'));

    expect(
      ['name', 'age', 'pets_cat', 'pets_dog', 'roster-note'].map((column) =>
        person.get(column),
      ),
    ).toEqual(Array.from({ length: 5 }, () => 'ENCRYPTED'));
    expect(person.get('city')).toBe('Lisbon');
    expect(person.get('label')).toBe('Encrypted');
    expect(
      namedDataOf(graphml.getElementsByTagName('edge')[0]).get('since'),
    ).toBe('ENCRYPTED');

    const typeOf = (column: string) =>
      [...graphmlKeys().values()].find((key) => key.name === column)?.type;
    expect(['age', 'pets_cat', 'pets_dog'].map(typeOf)).toEqual([
      'string',
      'string',
      'string',
    ]);
  });

  it('writes the marker for an encrypted variable’s ciphertext that has lost its record', () => {
    expect(csvRows(fileEnding(files, 'Contact.csv'))[0]?.get('name')).toBe(
      'ENCRYPTED',
    );
    const contact = namedDataOf(graphmlNode('contact-1'));
    expect(contact.get('name')).toBe('ENCRYPTED');
    expect(contact.get('label')).toBe('Encrypted');
  });

  it('writes a value of an encrypted variable that was stored in the clear as it is stored, as the interview shows it', () => {
    expect(csvRows(fileEnding(files, 'Contact.csv'))[1]?.get('name')).toBe(
      'Ana from the roster',
    );
    const contact = namedDataOf(graphmlNode('contact-2'));
    expect(contact.get('name')).toBe('Ana from the roster');
    expect(contact.get('label')).toBe('Ana from the roster');
  });

  it('writes no ciphertext to any file', () => {
    const everything = [...files.values()].join('\n');

    expect(everything).not.toContain(nameCiphertext.join(','));
    expect(everything).not.toContain(nicknameCiphertext.join(','));
  });
});
