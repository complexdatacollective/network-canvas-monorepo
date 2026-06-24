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
