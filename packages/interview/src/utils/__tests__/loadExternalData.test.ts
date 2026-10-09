import { hash } from 'ohash';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type Codebook,
  isUsableExternalAttributeName,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import loadExternalData, {
  makeVariableUUIDReplacer,
} from '../loadExternalData';

const codebook: Codebook = {
  node: {
    person: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
    place: {
      name: 'Place',
      label: { en: 'Place' },
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {},
    },
  },
};

describe('makeVariableUUIDReplacer primary-key salt', () => {
  it('gives byte-identical rows distinct primary keys when salted by index', () => {
    const row: Partial<NcNode> = {
      [entityAttributesProperty]: { name: 'Alice', age: '30' },
    };

    const replacer = makeVariableUUIDReplacer(codebook, 'person');

    // Two byte-identical rows at different data-file positions.
    const first = replacer(row, 0);
    const second = replacer(row, 1);

    expect(first[entityPrimaryKeyProperty]).not.toBe(
      second[entityPrimaryKeyProperty],
    );
  });

  it('produces a stable primary key for the same row at the same index', () => {
    const row: Partial<NcNode> = {
      [entityAttributesProperty]: { name: 'Bob', age: '42' },
    };

    const replacer = makeVariableUUIDReplacer(codebook, 'person');

    const a = replacer(row, 3);
    const b = replacer(row, 3);

    expect(a[entityPrimaryKeyProperty]).toBe(b[entityPrimaryKeyProperty]);
  });

  it('prefixes the primary key with the stage subject type', () => {
    const row: Partial<NcNode> = {
      [entityAttributesProperty]: { name: 'Carol', age: '50' },
    };

    const replacer = makeVariableUUIDReplacer(codebook, 'person');

    const node = replacer(row, 0);

    expect(node[entityPrimaryKeyProperty]).toMatch(/^person_/);
  });

  it('gives the same row parsed under two subject types different primary keys', () => {
    const row: Partial<NcNode> = {
      [entityAttributesProperty]: { name: 'Dana', age: '29' },
    };

    // Same asset row, same index, parsed for two different node types (e.g.
    // one roster shared by a person stage and a place stage) — this is the
    // invariant the subject-type prefix exists to guarantee.
    const asPerson = makeVariableUUIDReplacer(codebook, 'person')(row, 0);
    const asPlace = makeVariableUUIDReplacer(codebook, 'place')(row, 0);

    expect(asPerson[entityPrimaryKeyProperty]).not.toBe(
      asPlace[entityPrimaryKeyProperty],
    );
  });
});

describe('loadExternalData CSV-vs-JSON selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses CSV when the filename has a .csv extension', async () => {
    const csvText = 'name,age\nAlice,30\nBob,42\n';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: () => Promise.resolve(csvText),
      json: () => Promise.reject(new Error('should not call json() for CSV')),
    } as unknown as Response);

    const { nodes } = await loadExternalData('classmates.csv', 'stub://url');

    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: '30',
    });
  });

  it('preserves CSV attribute names until codebook remapping', async () => {
    const csvText = 'Full Name,profile.name\nAlice,friend\n';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(csvText));

    const { nodes } = await loadExternalData('classmates.csv', 'stub://url');

    expect(nodes[0]?.[entityAttributesProperty]).toEqual({
      'Full Name': 'Alice',
      'profile.name': 'friend',
    });
  });

  it('parses JSON when the filename has a .json extension', async () => {
    const jsonPayload = {
      nodes: [{ [entityAttributesProperty]: { name: 'Carol' } }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: () => Promise.reject(new Error('should not call text() for JSON')),
      json: () => Promise.resolve(jsonPayload),
    } as unknown as Response);

    const { nodes } = await loadExternalData('classmates.json', 'stub://url');

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.[entityAttributesProperty]).toEqual({ name: 'Carol' });
  });

  it('preserves valid unknown JSON attributes and omits legacy nullish entries', async () => {
    const jsonPayload = {
      nodes: [
        {
          sourceId: 'legacy-1',
          [entityAttributesProperty]: {
            unknownScalar: 42,
            unknownCategorical: ['friend', 2, true],
            unknownLayout: { x: 10, y: 20 },
            legacyNull: null,
          },
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(jsonPayload)),
    );

    const { nodes } = await loadExternalData('classmates.json', 'stub://url');
    const [node] = nodes;

    if (!node) {
      throw new Error('Expected one parsed external node.');
    }

    expect(node).toEqual({
      sourceId: 'legacy-1',
      [entityAttributesProperty]: {
        unknownScalar: 42,
        unknownCategorical: ['friend', 2, true],
        unknownLayout: { x: 10, y: 20 },
      },
    });
    expect(
      makeVariableUUIDReplacer(codebook, 'person')(node, 0)[
        entityPrimaryKeyProperty
      ],
    ).toBe(`person_${hash({ node, index: 0 })}`);
  });

  it('omits legacy own-undefined JSON attribute entries', async () => {
    const jsonPayload = {
      nodes: [
        {
          [entityAttributesProperty]: {
            name: 'Carol',
            legacyUndefined: undefined,
          },
        },
      ],
    };
    const response = new Response();
    vi.spyOn(response, 'json').mockResolvedValue(jsonPayload);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const { nodes } = await loadExternalData('classmates.json', 'stub://url');

    expect(nodes[0]?.[entityAttributesProperty]).toEqual({ name: 'Carol' });
  });

  it('rejects a JSON node containing an invalid defined attribute value', async () => {
    const jsonPayload = {
      nodes: [
        {
          [entityAttributesProperty]: {
            name: 'Carol',
            profile: { unexpected: 'object' },
          },
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(jsonPayload)),
    );

    await expect(
      loadExternalData('classmates.json', 'stub://url'),
    ).rejects.toThrow();
  });
});

describe('loadExternalData column and attribute names', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const loadCsv = async (csvText: string) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(csvText));
    const { nodes } = await loadExternalData('roster.csv', 'stub://url');
    return nodes.map((node) => node[entityAttributesProperty]);
  };

  it('keeps a header containing dots as a single flat key', async () => {
    const [attributes] = await loadCsv('a.b,a.c,a\n1,2,3\n');

    expect(attributes).toEqual({ 'a.b': '1', 'a.c': '2', 'a': '3' });
  });

  it('keeps a header containing brackets as written', async () => {
    const [attributes] = await loadCsv('list[0],x[y]\n1,2\n');

    expect(attributes).toEqual({ 'list[0]': '1', 'x[y]': '2' });
  });

  it('keeps headers in any script, with spaces and punctuation, as written', async () => {
    const [attributes] = await loadCsv(
      '"Full name",年龄,"Who? (really)"\nAda,36,yes\n',
    );

    expect(attributes).toEqual({
      'Full name': 'Ada',
      '年龄': '36',
      'Who? (really)': 'yes',
    });
  });

  it('keeps the spelling of a header, without normalising it', async () => {
    const decomposed = 'Café';
    const [attributes] = await loadCsv(`${decomposed}\nespresso\n`);

    expect(Object.keys(attributes ?? {})).toEqual([decomposed]);
  });

  it('keeps a column named __proto__ as an attribute rather than as a prototype', async () => {
    const [attributes] = await loadCsv(
      '__proto__,constructor,name\none,two,Ada\n',
    );

    expect(attributes).toBeDefined();
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(Object.hasOwn(attributes ?? {}, '__proto__')).toBe(true);
    expect(
      Object.getOwnPropertyDescriptor(attributes, '__proto__')?.value,
    ).toBe('one');
    expect(attributes?.constructor).toBe('two');
    expect(attributes?.name).toBe('Ada');
  });

  it('names a blank header field<n> and does not read blank lines as rows', async () => {
    const attributes = await loadCsv('a,,c\n1,2,3\n\n4,5,6\n\n');

    expect(attributes).toEqual([
      { a: '1', field2: '2', c: '3' },
      { a: '4', field2: '5', c: '6' },
    ]);
  });

  it('keeps a JSON attribute named __proto__ as an attribute rather than as a prototype', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `{"nodes":[{"${entityAttributesProperty}":{"__proto__":"one","name":"Ada"}}]}`,
      ),
    );

    const { nodes } = await loadExternalData('roster.json', 'stub://url');
    const attributes = nodes[0]?.[entityAttributesProperty];

    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(attributes, '__proto__')?.value,
    ).toBe('one');
    expect(attributes?.name).toBe('Ada');
  });
});

describe('makeVariableUUIDReplacer column names', () => {
  const namedCodebook: Codebook = {
    node: {
      person: {
        name: 'Person',
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          'id-name': {
            name: 'Full name',
            label: 'Full name',
            type: 'text',
          },
          'id-age': { name: '年龄', label: '年龄', type: 'number' },
          'id-cafe': { name: 'Café', label: 'Café', type: 'text' },
          'id-dotted': { name: 'a.b', label: 'a.b', type: 'text' },
          'id-proto': {
            name: '__proto__',
            label: '__proto__',
            type: 'text',
          },
        },
      },
    },
  };

  const replace = (attributes: Record<string, string>) =>
    makeVariableUUIDReplacer(namedCodebook, 'person')(
      { [entityAttributesProperty]: attributes },
      0,
    )[entityAttributesProperty];

  it('maps a column to the variable whose name it matches, whatever the name contains', () => {
    expect(
      replace({ 'Full name': 'Ada', '年龄': '36', 'a.b': 'dotted' }),
    ).toEqual({
      'id-name': 'Ada',
      'id-age': '36',
      'id-dotted': 'dotted',
    });
  });

  it('matches a decomposed header to the NFC variable name without rewriting the value', () => {
    const decomposedValue = 'Café Central';

    const attributes = replace({ Café: decomposedValue });

    expect(Object.keys(attributes)).toEqual(['id-cafe']);
    expect(attributes['id-cafe']).toBe(decomposedValue);
  });

  it('does not read a dotted header as a path into the variable id it starts with', () => {
    const attributes = replace({ 'id-name.name': 'x' });

    expect(attributes).toEqual({ 'id-name.name': 'x' });
  });

  it('maps a column named __proto__ to the variable of that name', () => {
    const attributes = replace(Object.fromEntries([['__proto__', 'one']]));

    expect(attributes).toEqual({ 'id-proto': 'one' });
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
  });

  it('keeps an unmatched column named __proto__ or constructor as an attribute', () => {
    const { [entityAttributesProperty]: attributes } = makeVariableUUIDReplacer(
      codebook,
      'person',
    )(
      {
        [entityAttributesProperty]: Object.fromEntries([
          ['__proto__', 'one'],
          ['constructor', 'two'],
        ]),
      },
      0,
    );

    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    expect(
      Object.getOwnPropertyDescriptor(attributes, '__proto__')?.value,
    ).toBe('one');
    expect(attributes.constructor).toBe('two');
  });
});

// Architect and the protocol builder import a roster only when every heading
// passes isUsableExternalAttributeName. These follow a heading from that check
// to the variable the interview fills from it.
describe('a roster heading, from import to the variable it fills', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cafe = `Caf${String.fromCharCode(0xe9)}`;
  const cafeDecomposed = `Cafe${String.fromCharCode(0x301)}`;

  const cafeCodebook: Codebook = {
    node: {
      person: {
        name: 'Person',
        label: { en: 'Person' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          'id-cafe': { name: cafe, label: cafe, type: 'text' },
        },
      },
    },
  };

  const fill = async (csvText: string) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(csvText));
    const { nodes } = await loadExternalData('roster.csv', 'stub://url');
    return nodes.map(
      (node, index) =>
        makeVariableUUIDReplacer(cafeCodebook, 'person')(node, index)[
          entityAttributesProperty
        ],
    );
  };

  it('fills the variable from a heading spelled decomposed, which import accepts', async () => {
    expect(isUsableExternalAttributeName(cafeDecomposed)).toBe(true);

    expect(await fill(`${cafeDecomposed}\nespresso\n`)).toEqual([
      { 'id-cafe': 'espresso' },
    ]);
  });

  it('refuses headings that are one name written composed and decomposed, naming both', async () => {
    await expect(
      fill(`${cafe},${cafeDecomposed}\nespresso,latte\n`),
    ).rejects.toThrow(
      `The roster headings ${JSON.stringify(cafe)} and ${JSON.stringify(cafeDecomposed)} both resolve to the attribute "id-cafe".`,
    );
  });

  it('fills the variable from only the heading that matches its case', async () => {
    expect(
      await fill(`${cafe},${cafe.toLowerCase()}\nespresso,latte\n`),
    ).toEqual([{ 'id-cafe': 'espresso', [cafe.toLowerCase()]: 'latte' }]);
  });

  it('fills no variable from a quoted heading with a space at the end, which import refuses', async () => {
    expect(isUsableExternalAttributeName(`${cafe} `)).toBe(false);

    expect(await fill(`"${cafe} "\nespresso\n`)).toEqual([
      { [`${cafe} `]: 'espresso' },
    ]);
  });

  it('fills the variable from an unquoted heading with spaces round it, which every reader trims', async () => {
    expect(await fill(` ${cafe} \nespresso\n`)).toEqual([
      { 'id-cafe': 'espresso' },
    ]);
  });
});
