import { DOMParser, type Element, MIME_TYPE } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import type { Codebook, Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { FormattedSession } from '../../input';
import { partitionByType } from '../../session/partitionByType';
import { attributeListRows } from '../csv/attributeList';
import { edgeListRows } from '../csv/edgeList';
import { egoListRows } from '../csv/egoList';
import graphMLGenerator from '../graphml/createGraphML';
import {
  exportOptions,
  namesSession,
  parseCsvRecord,
  prepareSession,
} from './namesFixture';

// Names and ids that are keys of every object unless the object has no
// prototype. Ids may be any of these: `_` is allowed in an id.
const hazards = [
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  'valueOf',
];

const prototypeBefore = Object.getOwnPropertyNames(Object.prototype).sort();

// An object literal cannot hold an own `__proto__` key; this can.
const record = <Value>(entries: readonly (readonly [string, Value])[]) =>
  Object.fromEntries(entries);

const textVariable = (name: string) =>
  ({ name, label: name, type: 'text' }) satisfies Variable;

const hazardVariables = (nameOf: (id: string) => string) =>
  record(hazards.map((id) => [id, textVariable(nameOf(id))]));

const hazardValues = (ids: readonly string[]) =>
  record(ids.map((id) => [id, `value of ${id}`]));

const codebookFor = (nameOf: (id: string) => string): Codebook => ({
  ego: { variables: hazardVariables(nameOf) },
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: hazardVariables(nameOf),
    },
  },
  edge: {
    knows: {
      name: 'Knows',
      label: { en: 'Knows' },
      variables: hazardVariables(nameOf),
    },
  },
});

// The first entity has every attribute, the second has none.
const sessionFor = (ids: readonly string[]): FormattedSession => ({
  ...namesSession(),
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'node-a',
      type: 'person',
      [entityAttributesProperty]: hazardValues(ids),
    },
    {
      [entityPrimaryKeyProperty]: 'node-b',
      type: 'person',
      [entityAttributesProperty]: {},
    },
  ],
  edges: [
    {
      [entityPrimaryKeyProperty]: 'edge-a',
      from: 'node-a',
      to: 'node-b',
      type: 'knows',
      [entityAttributesProperty]: hazardValues(ids),
    },
    {
      [entityPrimaryKeyProperty]: 'edge-b',
      from: 'node-b',
      to: 'node-a',
      type: 'knows',
      [entityAttributesProperty]: {},
    },
  ],
  ego: {
    [entityPrimaryKeyProperty]: 'ego-1',
    [entityAttributesProperty]: hazardValues(ids),
  },
});

const rowsOf = (generator: Iterable<string>) =>
  [...generator].map(parseCsvRecord);

const expectCellsByHeader = (
  [headers = [], ...rows]: string[][],
  expected: readonly (readonly [header: string, cells: readonly string[]])[],
) => {
  for (const [header, cells] of expected) {
    const column = headers.indexOf(header);
    expect(column, `column ${header}`).toBeGreaterThanOrEqual(0);
    expect(
      rows.map((row) => row[column]),
      `cells of ${header}`,
    ).toEqual(cells);
  }
};

describe.each([
  ['names that differ from their ids', (id: string) => `${id} (name)`],
  ['names that are the ids', (id: string) => id],
])(
  'variables whose ids are Object.prototype keys, with %s',
  (_title, nameOf) => {
    const codebook = codebookFor(nameOf);
    const options = exportOptions(true);

    it('keeps every value of a node, and leaves the missing ones empty', () => {
      const network = prepareSession(sessionFor(hazards));

      expectCellsByHeader(
        rowsOf(attributeListRows(network, codebook, options, () => undefined)),
        hazards.map((id) => [nameOf(id), [`value of ${id}`, '']]),
      );
    });

    it('keeps every value of an edge, and leaves the missing ones empty', () => {
      const network = prepareSession(sessionFor(hazards));

      expectCellsByHeader(
        rowsOf(edgeListRows(network, codebook, options, () => undefined)),
        hazards.map((id) => [nameOf(id), [`value of ${id}`, '']]),
      );
    });

    it('keeps every value of the ego', () => {
      const network = prepareSession(sessionFor(hazards));

      expectCellsByHeader(
        rowsOf(egoListRows(network, codebook, options, () => undefined)),
        hazards.map((id) => [nameOf(id), [`value of ${id}`]]),
      );
    });

    it.each([
      ['node', attributeListRows, ['', '']],
      ['edge', edgeListRows, ['', '']],
      ['ego', egoListRows, ['']],
    ] as const)(
      'leaves a variable the %s has no value for empty, not the inherited member',
      (_entity, rows, emptyCells) => {
        const network = prepareSession(
          sessionFor(['constructor', 'toString', '__proto__']),
        );
        const written = rowsOf(
          rows(network, codebook, options, () => undefined),
        );

        expectCellsByHeader(written, [
          [nameOf('hasOwnProperty'), emptyCells],
          [nameOf('valueOf'), emptyCells],
        ]);
        expect(written.flat().join('|')).not.toMatch(/function|\[object/);
      },
    );

    it('writes a GraphML key and datum for each, and none for a missing value', async () => {
      const document = new DOMParser().parseFromString(
        await graphMLGenerator(
          prepareSession(sessionFor(hazards)),
          codebook,
          options,
          () => undefined,
        ),
        MIME_TYPE.XML_APPLICATION,
      );
      const keyIds = Array.from(document.getElementsByTagName('key')).map(
        (key) => key.getAttribute('id'),
      );
      const [firstNode, secondNode] = Array.from(
        document.getElementsByTagName('node'),
      );
      const dataOf = (node: Element | undefined) =>
        new Map(
          Array.from(node?.getElementsByTagName('data') ?? []).map(
            (data) => [data.getAttribute('key'), data.textContent] as const,
          ),
        );

      for (const id of hazards) {
        expect(keyIds).toContain(id);
        expect(dataOf(firstNode).get(id)).toBe(`value of ${id}`);
        expect(dataOf(secondNode).has(id)).toBe(false);
      }
    });

    it('does not change Object.prototype', () => {
      const network = prepareSession(sessionFor(hazards));
      rowsOf(attributeListRows(network, codebook, options, () => undefined));
      rowsOf(edgeListRows(network, codebook, options, () => undefined));
      rowsOf(egoListRows(network, codebook, options, () => undefined));

      expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(
        prototypeBefore,
      );
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    });
  },
);

describe('attributes the codebook does not declare, keyed by Object.prototype keys', () => {
  const codebook: Codebook = {
    node: {
      person: {
        name: 'Person',
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: { 'v-name': textVariable('Name') },
      },
    },
    edge: {},
  };
  const session: FormattedSession = {
    ...namesSession(),
    nodes: [
      {
        [entityPrimaryKeyProperty]: 'node-a',
        type: 'person',
        [entityAttributesProperty]: record([
          ['v-name', 'Dee'],
          ['constructor', 'left over'],
          ['toString', 'left over too'],
          ['__proto__', 'and this'],
        ]),
      },
    ],
    edges: [],
  };

  it('exports them under their own keys, as it does any other attribute', () => {
    expectCellsByHeader(
      rowsOf(
        attributeListRows(
          prepareSession(session),
          codebook,
          exportOptions(true),
          () => undefined,
        ),
      ),
      [
        ['Name', ['Dee']],
        ['constructor', ['left over']],
        ['toString', ['left over too']],
        ['__proto__', ['and this']],
      ],
    );
  });

  it('declares and writes them in GraphML', async () => {
    const document = new DOMParser().parseFromString(
      await graphMLGenerator(
        prepareSession(session),
        codebook,
        exportOptions(true),
        () => undefined,
      ),
      MIME_TYPE.XML_APPLICATION,
    );
    const keyIdByName = new Map(
      Array.from(document.getElementsByTagName('key')).map(
        (key) =>
          [key.getAttribute('attr.name'), key.getAttribute('id')] as const,
      ),
    );
    const data = new Map(
      Array.from(
        document
          .getElementsByTagName('node')[0]
          ?.getElementsByTagName('data') ?? [],
      ).map((datum) => [datum.getAttribute('key'), datum.textContent] as const),
    );

    expect(data.get(keyIdByName.get('constructor') ?? '')).toBe('left over');
    expect(data.get(keyIdByName.get('toString') ?? '')).toBe('left over too');
    expect(data.get(keyIdByName.get('__proto__') ?? '')).toBe('and this');
  });
});

describe('categorical variables named after Object.prototype keys', () => {
  it('writes the option columns and values', () => {
    const codebook: Codebook = {
      node: {
        person: {
          name: 'Person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: record(
            hazards.map((id) => [
              id,
              {
                name: id,
                label: id,
                type: 'categorical',
                options: [
                  { label: { en: 'A' }, value: 'constructor' },
                  { label: { en: 'B' }, value: '__proto__' },
                ],
              } satisfies Variable,
            ]),
          ),
        },
      },
    };
    const session: FormattedSession = {
      ...namesSession(),
      nodes: [
        {
          [entityPrimaryKeyProperty]: 'node-a',
          type: 'person',
          [entityAttributesProperty]: record(
            hazards.map((id) => [id, ['constructor']]),
          ),
        },
      ],
      edges: [],
    };

    expectCellsByHeader(
      rowsOf(
        attributeListRows(
          prepareSession(session),
          codebook,
          exportOptions(true),
          () => undefined,
        ),
      ),
      hazards.flatMap((id) => [
        [`${id}_constructor`, ['true']],
        [`${id}___proto__`, ['false']],
      ]),
    );
  });
});

describe('entity types whose ids are Object.prototype keys', () => {
  const nodeDefinition = (name: string) => ({
    name,
    label: { en: name },
    color: 'node-color-seq-1' as const,
    shape: { default: 'circle' as const },
    variables: { [`${name}-var`]: textVariable('Name') },
  });
  const codebook: Codebook = {
    node: record([
      ['constructor', nodeDefinition('Constructor type')],
      ['__proto__', nodeDefinition('Proto type')],
    ]),
    edge: {},
  };
  const session: FormattedSession = {
    ...namesSession(),
    nodes: ['constructor', '__proto__', 'toString'].map((type) => ({
      [entityPrimaryKeyProperty]: `node-${type}`,
      type,
      [entityAttributesProperty]: {},
    })),
    edges: [],
  };

  it("partitions by the type's name, and a type the codebook lacks has none", () => {
    const partitions = partitionByType(
      codebook,
      prepareSession(session),
      'attributeList',
    );

    expect(
      partitions.map(({ partitionEntity, partitionEntityId }) => [
        partitionEntityId,
        partitionEntity,
      ]),
    ).toEqual([
      ['constructor', 'Constructor type'],
      ['__proto__', 'Proto type'],
      ['toString', undefined],
    ]);
  });

  it('exports the nodes of each type', () => {
    const rows = rowsOf(
      attributeListRows(
        prepareSession(session),
        codebook,
        exportOptions(true),
        () => undefined,
      ),
    );

    expect(rows).toHaveLength(4);
  });
});
