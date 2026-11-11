import { describe, expect, it } from 'vitest';

import {
  applyOperations,
  fixFits,
  snapshotAt,
  type StoredOperation,
  writtenHolds,
} from '../fixEngine';
import { formatPath, parsePath, readPath } from '../fixPath';
import { op } from './fixtures';

const doc = () => ({
  'stages': [
    { id: 'a', label: 'A', prompts: [{ id: 'p1', text: 'one' }] },
    { id: 'b/c', label: 'B' },
  ],
  'codebook': {
    node: {
      person: {
        name: 'Person',
        variables: { v1: { name: 'one' }, v2: { name: 'two' } },
        options: ['x', 'y', 'z'],
      },
    },
  },
  'odd~key': 1,
});

const apply = (root: unknown, operations: StoredOperation[]) => {
  const result = applyOperations(root, operations);
  if (!result.ok) throw new Error(`failed: ${JSON.stringify(result.failure)}`);
  return result;
};

describe('paths', () => {
  it('parses RFC 6901 escapes and formats them back', () => {
    expect(parsePath('/stages/b~1c/label')).toEqual(['stages', 'b/c', 'label']);
    expect(parsePath('/odd~0key')).toEqual(['odd~key']);
    expect(formatPath(['stages', 'b/c', 'odd~key'])).toBe(
      '/stages/b~1c/odd~0key',
    );
  });

  it('refuses what is not a pointer, a bad escape, or a prototype key', () => {
    expect(parsePath('stages')).toBeNull();
    expect(parsePath('/a~2b')).toBeNull();
    expect(parsePath('/__proto__/x')).toBeNull();
    expect(parsePath('/codebook/constructor')).toBeNull();
  });

  it('addresses array members by id where they have ids, and by index only where they have none', () => {
    expect(readPath(doc(), ['stages', 'b/c', 'label'])).toEqual({
      found: true,
      value: 'B',
    });
    expect(readPath(doc(), ['stages', '0', 'label'])).toEqual({
      found: false,
    });
    expect(
      readPath(doc(), ['codebook', 'node', 'person', 'options', '1']),
    ).toEqual({ found: true, value: 'y' });
    expect(
      readPath(doc(), ['codebook', 'node', 'person', 'options', '01']),
    ).toEqual({ found: false });
    expect(readPath(doc(), ['codebook', 'toString'])).toEqual({ found: false });
  });
});

describe('applyOperations', () => {
  it('sets a value without changing the original, and its inverse restores it', () => {
    const original = doc();
    const frozen = structuredClone(original);
    const result = apply(original, [
      op('set', '/stages/a/prompts/p1/text', 'better'),
    ]);
    expect(original).toEqual(frozen);
    expect(
      readPath(result.result, ['stages', 'a', 'prompts', 'p1', 'text']),
    ).toEqual({ found: true, value: 'better' });
    expect(result.targets).toEqual([
      { op: 'set', present: true, value: 'one' },
    ]);
    expect(apply(result.result, result.inverse).result).toEqual(original);
  });

  it('adds a missing key with set, and its inverse removes it', () => {
    const original = doc();
    const result = apply(original, [op('set', '/stages/b~1c/title', 'T')]);
    expect(result.targets).toEqual([
      { op: 'set', present: false, value: null },
    ]);
    expect(result.inverse).toEqual([
      { op: 'remove', path: '/stages/b~1c/title', value: null },
    ]);
    expect(apply(result.result, result.inverse).result).toEqual(original);
  });

  it('removes an object key and puts it back in its place on undo', () => {
    const original = doc();
    const result = apply(original, [
      op('remove', '/codebook/node/person/variables/v1'),
    ]);
    const restored = apply(result.result, result.inverse).result as ReturnType<
      typeof doc
    >;
    expect(Object.keys(restored.codebook.node.person.variables)).toEqual([
      'v1',
      'v2',
    ]);
    expect(restored).toEqual(original);
  });

  it('removes and inserts array members by id, before an anchor or at the end', () => {
    const original = doc();
    const removed = apply(original, [op('remove', '/stages/a')]);
    expect(removed.inverse).toEqual([
      {
        op: 'insert',
        path: '/stages/b~1c',
        value: JSON.stringify(original.stages[0]),
      },
    ]);
    expect(apply(removed.result, removed.inverse).result).toEqual(original);

    const inserted = apply(original, [
      op('insert', '/stages/b~1c', { id: 'new', label: 'N' }),
      op('insert', '/stages/-', { id: 'last', label: 'L' }),
    ]);
    const ids = (inserted.result as ReturnType<typeof doc>).stages.map(
      (stage) => stage.id,
    );
    expect(ids).toEqual(['a', 'new', 'b/c', 'last']);
    expect(apply(inserted.result, inserted.inverse).result).toEqual(original);
  });

  it('removes the last array member and inverts with an append', () => {
    const original = doc();
    const result = apply(original, [
      op('remove', '/codebook/node/person/options/2'),
    ]);
    expect(result.inverse[0]?.path).toBe('/codebook/node/person/options/-');
    expect(apply(result.result, result.inverse).result).toEqual(original);
  });

  it('applies operations in order, later ones seeing earlier ones', () => {
    const original = doc();
    const result = apply(original, [
      op('insert', '/stages/-', { id: 'new', label: 'N' }),
      op('set', '/stages/new/label', 'Renamed'),
      op('remove', '/codebook/node/person/options/0'),
      op('remove', '/codebook/node/person/options/0'),
    ]);
    const after = result.result as ReturnType<typeof doc>;
    expect(after.stages.at(-1)).toEqual({ id: 'new', label: 'Renamed' });
    expect(after.codebook.node.person.options).toEqual(['z']);
    expect(apply(result.result, result.inverse).result).toEqual(original);
  });

  it.each([
    [
      'a path that is not found',
      op('set', '/stages/zzz/label', 'x'),
      'path_not_found',
    ],
    ['a missing parent', op('set', '/nothing/here', 'x'), 'path_not_found'],
    [
      'a removed key that is absent',
      op('remove', '/stages/a/title'),
      'path_not_found',
    ],
    [
      'an unknown anchor',
      op('insert', '/stages/zzz', { id: 'n' }),
      'path_not_found',
    ],
    [
      'value that is not JSON',
      { op: 'set', path: '/stages/a/label', value: '{oops' },
      'bad_value',
    ],
    [
      'a null value for set',
      { op: 'set', path: '/stages/a/label', value: null },
      'bad_value',
    ],
    [
      'an id-array member without an id',
      op('insert', '/stages/-', { label: 'x' }),
      'bad_value',
    ],
    [
      'a duplicate id on insert',
      op('insert', '/stages/-', { id: 'a' }),
      'duplicate_id',
    ],
    [
      'a duplicate id on replace',
      op('set', '/stages/b~1c', { id: 'a' }),
      'duplicate_id',
    ],
    [
      'insert into an object',
      op('insert', '/codebook/node/-', 1),
      'wrong_container',
    ],
    [
      'a path through a string',
      op('set', '/stages/a/label/x', 1),
      'wrong_container',
    ],
    ['an edit to an addressing id', op('set', '/stages/a/id', 'z'), 'bad_path'],
    ['a prototype key', op('set', '/__proto__/polluted', true), 'bad_path'],
  ] satisfies [string, StoredOperation, string][])(
    'fails, without throwing, on %s',
    (_name, operation, kind) => {
      const result = applyOperations(doc(), [
        op('set', '/stages/a/label', 'ok'),
        operation,
      ]);
      expect(result).toEqual({ ok: false, failure: { kind, operation: 1 } });
    },
  );

  it('never pollutes Object.prototype', () => {
    applyOperations(doc(), [op('set', '/__proto__/polluted', true)]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('fixFits', () => {
  const operations = [op('set', '/stages/a/label', 'Better')];

  it('fits while every target holds what was reviewed', () => {
    const { targets } = apply(doc(), operations);
    const unrelated = apply(doc(), [
      op('set', '/stages/b~1c/label', 'Other'),
    ]).result;
    expect(fixFits(doc(), operations, targets)).toBe(true);
    expect(fixFits(unrelated, operations, targets)).toBe(true);
  });

  it('no longer fits once the researcher changed a target', () => {
    const { targets } = apply(doc(), operations);
    const edited = apply(doc(), [op('set', '/stages/a/label', 'Mine')]).result;
    expect(fixFits(edited, operations, targets)).toBe(false);
  });

  it('no longer fits once an absent key has been added, or a target deleted', () => {
    const adding = [op('set', '/stages/a/title', 'T')];
    const { targets } = apply(doc(), adding);
    const added = apply(doc(), [op('set', '/stages/a/title', 'Mine')]).result;
    expect(fixFits(added, adding, targets)).toBe(false);
    const deleted = apply(doc(), [op('remove', '/stages/a')]).result;
    expect(fixFits(deleted, adding, targets)).toBe(false);
  });

  it('does not fit once applied', () => {
    const { targets, result } = apply(doc(), operations);
    expect(fixFits(result, operations, targets)).toBe(false);
  });

  it('does not fit an index-array removal once members moved', () => {
    const removing = [op('remove', '/codebook/node/person/options/1')];
    const { targets } = apply(doc(), removing);
    const shifted = apply(doc(), [
      op('remove', '/codebook/node/person/options/0'),
    ]).result;
    expect(fixFits(shifted, removing, targets)).toBe(false);
  });
});

/** What a fix wrote, read from where each operation left its change. */
const writtenBy = (root: unknown, operations: StoredOperation[]) => {
  const applied = apply(root, operations);
  return {
    ...applied,
    written: applied.placed.map((path) => snapshotAt(applied.result, path)),
  };
};

describe('writtenHolds', () => {
  it('holds once applied, and not after the inverse', () => {
    const { result, inverse, written } = writtenBy(doc(), [
      op('set', '/stages/a/label', 'Better'),
      op('remove', '/codebook/node/person/variables/v2'),
      op('insert', '/stages/-', { id: 'n', label: 'N' }),
      op('remove', '/codebook/node/person/options/0'),
      op('insert', '/codebook/node/person/options/-', 'w'),
    ]);
    expect(writtenHolds(doc(), written)).toBe(false);
    expect(writtenHolds(result, written)).toBe(true);
    expect(writtenHolds(apply(result, inverse).result, written)).toBe(false);
  });

  it('stops holding when the researcher overwrites what the fix wrote', () => {
    const { result, written } = writtenBy(doc(), [
      op('set', '/stages/a/label', 'Better'),
    ]);
    const rewritten = apply(result, [
      op('set', '/stages/a/label', 'Mine'),
    ]).result;
    expect(writtenHolds(rewritten, written)).toBe(false);
  });

  it('stops holding when the researcher edits a member the fix inserted', () => {
    const { result, written } = writtenBy(doc(), [
      op('insert', '/stages/-', { id: 'n', label: 'N' }),
    ]);
    const edited = apply(result, [op('set', '/stages/n/label', 'Mine')]).result;
    expect(writtenHolds(edited, written)).toBe(false);
  });

  it('stops holding when the researcher re-creates what the fix removed', () => {
    const { result, written } = writtenBy(doc(), [
      op('remove', '/codebook/node/person/variables/v2'),
    ]);
    const recreated = apply(result, [
      op('set', '/codebook/node/person/variables/v2', { name: 'again' }),
    ]).result;
    expect(writtenHolds(recreated, written)).toBe(false);
  });

  it('reads what a later operation left, where two touch one place', () => {
    const { result, written } = writtenBy(doc(), [
      op('set', '/stages/a/label', 'First'),
      op('remove', '/stages/a'),
    ]);
    expect(writtenHolds(result, written)).toBe(true);
  });

  it('never holds for a fix with no edits', () => {
    expect(writtenHolds(doc(), [])).toBe(false);
    expect(fixFits(doc(), [], [])).toBe(false);
  });
});

describe('arrays that mix members with and without ids', () => {
  // A form's `fields` can hold both; its members are addressed by id.
  const mixed = () => ({
    fields: [
      { id: '1', prompt: 'id one' },
      { prompt: 'no id' },
      { id: '0', prompt: 'id zero' },
    ],
  });

  it('reads a segment only as an id', () => {
    expect(readPath(mixed(), ['fields', '0', 'prompt'])).toEqual({
      found: true,
      value: 'id zero',
    });
    expect(readPath(mixed(), ['fields', '1', 'prompt'])).toEqual({
      found: true,
      value: 'id one',
    });
    // No member has id 2, and an index never addresses a member here.
    expect(readPath(mixed(), ['fields', '2', 'prompt'])).toEqual({
      found: false,
    });
  });

  it('inserts and edits members with ids and inverts cleanly', () => {
    const original = mixed();
    const operations = [
      op('insert', '/fields/0', { id: 'new', prompt: 'with id' }),
      op('set', '/fields/1/prompt', 'replaced'),
      op('remove', '/fields/0'),
    ];
    const result = writtenBy(original, operations);
    expect(
      (result.result as ReturnType<typeof mixed>).fields.map((f) => f.prompt),
    ).toEqual(['replaced', 'no id', 'with id']);
    expect(apply(result.result, result.inverse).result).toEqual(original);
    expect(writtenHolds(result.result, result.written)).toBe(true);
    expect(writtenHolds(original, result.written)).toBe(false);
  });

  it('refuses to add a member that no path could reach again', () => {
    expect(
      applyOperations(mixed(), [op('insert', '/fields/-', { prompt: 'x' })]),
    ).toEqual({ ok: false, failure: { kind: 'ambiguous_path', operation: 0 } });
  });

  it('refuses a duplicate id even where some members have none', () => {
    expect(
      applyOperations(mixed(), [op('insert', '/fields/-', { id: '1' })]),
    ).toEqual({ ok: false, failure: { kind: 'duplicate_id', operation: 0 } });
  });
});
