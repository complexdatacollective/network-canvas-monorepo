import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
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
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
    place: {
      name: 'Place',
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
});
