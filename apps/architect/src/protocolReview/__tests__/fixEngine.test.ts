import { describe, expect, it } from 'vitest';

import {
  applyOperations,
  fixFits,
  fixInEffect,
  markMoves,
  planFix,
  type StoredOperation,
  writtenHolds,
  writtenStands,
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

/** A fix planned with no normalisation: its result, inverse and what it wrote. */
const writtenBy = (root: unknown, operations: StoredOperation[]) => {
  const plan = planFix(root, operations, (raw) => raw);
  if (!plan.ok) throw new Error(`failed: ${plan.reason}`);
  return plan;
};

/** What a fix would leave, planned against the document that was reviewed. */
const expectedOf = (root: unknown, operations: StoredOperation[]) =>
  writtenBy(root, operations).written;

describe('an insert placed by position', () => {
  const inserting = [op('insert', '/codebook/node/person/options/1', 'new')];

  it('stops fitting once the member it was placed before is not the one reviewed', () => {
    const { targets } = apply(doc(), inserting);
    expect(fixFits(doc(), inserting, targets)).toBe(true);
    const renamed = apply(doc(), [
      op('set', '/codebook/node/person/options/1', 'edited'),
    ]).result;
    expect(fixFits(renamed, inserting, targets)).toBe(false);
    const reordered = apply(doc(), [
      op('remove', '/codebook/node/person/options/1'),
      op('insert', '/codebook/node/person/options/-', 'y'),
    ]).result;
    expect(fixFits(reordered, inserting, targets)).toBe(false);
  });

  it('records nothing for an insert placed by id or at the end', () => {
    expect(
      apply(doc(), [op('insert', '/stages/b~1c', { id: 'n', label: 'N' })])
        .targets,
    ).toEqual([{ op: 'insert' }]);
    expect(
      apply(doc(), [op('insert', '/codebook/node/person/options/-', 'w')])
        .targets,
    ).toEqual([{ op: 'insert' }]);
  });
});

describe('fixInEffect', () => {
  it('holds once the protocol already has what every edit writes, however it got there', () => {
    const operations = [
      op('remove', '/stages/b~1c'),
      op('set', '/stages/a/label', 'Better'),
      op('insert', '/stages/-', { id: 'new', label: 'New' }),
    ];
    const expected = expectedOf(doc(), operations);
    expect(fixInEffect(doc(), operations, expected)).toBe(false);
    const done = apply(doc(), [
      op('remove', '/stages/b~1c'),
      op('insert', '/stages/a', { id: 'new', label: 'New' }),
      op('set', '/stages/a/label', 'Better'),
    ]).result;
    expect(fixInEffect(done, operations, expected)).toBe(true);
  });

  it('does not hold while any edit would still change the protocol', () => {
    const operations = [
      op('remove', '/stages/b~1c'),
      op('set', '/stages/a/label', 'Better'),
    ];
    const removed = apply(doc(), [op('remove', '/stages/b~1c')]).result;
    expect(
      fixInEffect(removed, operations, expectedOf(doc(), operations)),
    ).toBe(false);
    expect(fixInEffect(removed, [], [])).toBe(false);
  });

  it('holds when applying the fix would change nothing, with nothing recorded to compare', () => {
    const operations = [op('set', '/stages/a/label', 'A')];
    expect(fixInEffect(doc(), operations, null)).toBe(true);
    expect(fixInEffect(doc(), [op('set', '/stages/a/label', 'B')], null)).toBe(
      false,
    );
  });

  it('is not taken from a removal by index that no longer resolves', () => {
    // The third option is still there; the list is only shorter.
    const removal = [op('remove', '/codebook/node/person/options/2')];
    const expected = expectedOf(doc(), removal);
    const shorter = apply(doc(), [
      op('remove', '/codebook/node/person/options/0'),
    ]).result;
    expect(
      readPath(shorter, ['codebook', 'node', 'person', 'options']),
    ).toEqual({ found: true, value: ['y', 'z'] });
    expect(fixInEffect(shorter, removal, expected)).toBe(false);
    expect(fixInEffect(shorter, removal, null)).toBe(false);
    // Removed by hand, it is.
    const removedByHand = apply(doc(), [
      op('remove', '/codebook/node/person/options/2'),
    ]).result;
    expect(fixInEffect(removedByHand, removal, expected)).toBe(true);
  });

  it('is not taken from a removal by index after another fix gives a member of the list an id', () => {
    const form = () => ({
      fields: [{ variable: 'a' }, { variable: 'flagged' }],
    });
    const removal = [op('remove', '/fields/1')];
    const { targets } = apply(form(), removal);
    const expected = expectedOf(form(), removal);
    const withNewField = apply(form(), [
      op('insert', '/fields/-', { id: 'new', variable: 'c' }),
    ]).result;
    // The list now holds a protocol object, so it is addressed by id alone:
    // no index reaches the question any more, and the removal cannot be made.
    expect(fixInEffect(withNewField, removal, expected)).toBe(false);
    expect(fixFits(withNewField, removal, targets)).toBe(false);
  });
});

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

describe('a fix that moves a member of an array', () => {
  const stage = (id: string) => ({ id, label: id.toUpperCase() });
  const ordered = (...ids: string[]) => ({ stages: ids.map(stage) });
  const idsOf = (root: unknown) =>
    (root as ReturnType<typeof ordered>).stages.map((s) => s.id);
  /** Moves stage `id` to just before `before`, or to the end. */
  const move = (id: string, before: string) => [
    op('remove', `/stages/${id}`),
    op('insert', `/stages/${before}`, stage(id)),
  ];

  it('stops holding once the move is undone', () => {
    const original = ordered('a', 'b', 'c');
    const { result, inverse, written } = writtenBy(original, move('a', 'c'));
    expect(idsOf(result)).toEqual(['b', 'a', 'c']);
    expect(writtenHolds(result, written)).toBe(true);
    expect(writtenHolds(original, written)).toBe(false);
    const undone = apply(result, inverse).result;
    expect(undone).toEqual(original);
    expect(writtenHolds(undone, written)).toBe(false);
  });

  it('stops holding when the researcher moves the member back', () => {
    const { result, written } = writtenBy(
      ordered('a', 'b', 'c'),
      move('a', 'c'),
    );
    const back = apply(result, move('a', 'b')).result;
    expect(idsOf(back)).toEqual(['a', 'b', 'c']);
    expect(writtenHolds(back, written)).toBe(false);
  });

  it('stops holding when a member it was moved past is moved back across it', () => {
    const { result, written } = writtenBy(
      ordered('a', 'b', 'c'),
      move('a', 'c'),
    );
    const across = apply(result, move('b', 'c')).result;
    expect(idsOf(across)).toEqual(['a', 'b', 'c']);
    expect(writtenHolds(across, written)).toBe(false);
  });

  it('holds through changes to the order that leave the move standing', () => {
    const { result, written } = writtenBy(
      ordered('a', 'b', 'c', 'd'),
      move('a', 'c'),
    );
    // c and d were never passed, so where they stand says nothing about it.
    const elsewhere = apply(result, [
      ...move('d', 'b'),
      op('insert', '/stages/-', stage('e')),
      op('remove', '/stages/c'),
    ]).result;
    expect(idsOf(elsewhere)).toEqual(['d', 'b', 'a', 'e']);
    expect(writtenHolds(elsewhere, written)).toBe(true);
    // With b gone there is nothing left for a to stand after.
    const without = apply(result, [op('remove', '/stages/b')]).result;
    expect(writtenHolds(without, written)).toBe(true);
  });

  it('sees a move towards the start, and a move that also rewrites the member', () => {
    const original = ordered('a', 'b', 'c');
    const { result, inverse, written } = writtenBy(original, [
      op('remove', '/stages/c'),
      op('insert', '/stages/a', { id: 'c', label: 'Rewritten' }),
    ]);
    expect(idsOf(result)).toEqual(['c', 'a', 'b']);
    expect(writtenHolds(result, written)).toBe(true);
    expect(writtenHolds(apply(result, inverse).result, written)).toBe(false);
    // The new wording kept, but back at the end: the order is undone.
    const reordered = apply(result, [
      op('remove', '/stages/c'),
      op('insert', '/stages/-', { id: 'c', label: 'Rewritten' }),
    ]).result;
    expect(writtenHolds(reordered, written)).toBe(false);
  });

  it('sees a move inside a nested array', () => {
    const original = {
      stages: [{ id: 's', prompts: [{ id: 'p1' }, { id: 'p2' }] }],
    };
    const { result, inverse, written } = writtenBy(original, [
      op('remove', '/stages/s/prompts/p1'),
      op('insert', '/stages/s/prompts/-', { id: 'p1' }),
    ]);
    expect(writtenHolds(result, written)).toBe(true);
    expect(writtenHolds(apply(result, inverse).result, written)).toBe(false);
  });
});

describe('a move the review wrote as a remove and an insert of an exact copy', () => {
  const doc3 = () => ({
    stages: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C', items: [{ id: 'i', text: 'one' }] },
    ],
  });
  const idsOf = (root: unknown) =>
    (root as ReturnType<typeof doc3>).stages.map((s) => s.id);
  const stageC = (root: unknown) =>
    (root as ReturnType<typeof doc3>).stages.find((s) => s.id === 'c');
  /** Moves stage c to the start, as the review writes it. */
  const moveC = () =>
    markMoves(doc3(), [
      op('remove', '/stages/c'),
      op('insert', '/stages/a', doc3().stages[2]),
    ]);

  it('is marked as a move, and an insert that rewrites the member is not', () => {
    expect(moveC().map((operation) => operation.moves)).toEqual([true, true]);
    const rewriting = markMoves(doc3(), [
      op('remove', '/stages/c'),
      op('insert', '/stages/a', { id: 'c', label: 'Rewritten' }),
    ]);
    expect(rewriting.map((operation) => operation.moves)).toEqual([
      undefined,
      undefined,
    ]);
    // Neither is a removal alone, an insert alone, or a copy put in another array.
    expect(
      markMoves(doc3(), [
        op('remove', '/stages/c/items/i'),
        op('insert', '/stages/-', { id: 'i', text: 'one' }),
      ]).some((operation) => operation.moves),
    ).toBe(false);
  });

  it('writes only where the member stands, so it holds through edits to what the member holds', () => {
    const { result, written } = writtenBy(doc3(), moveC());
    expect(idsOf(result)).toEqual(['c', 'a', 'b']);
    expect(written.every((snapshot) => 'before' in snapshot)).toBe(true);
    const edited = apply(result, [
      op('set', '/stages/c/label', 'Edited'),
    ]).result;
    expect(writtenHolds(edited, written)).toBe(true);
    expect(writtenStands(edited, written)).toBe(true);
    const back = apply(edited, [
      op('remove', '/stages/c'),
      op('insert', '/stages/-', stageC(edited)),
    ]).result;
    expect(writtenHolds(back, written)).toBe(false);
    expect(writtenStands(back, written)).toBe(false);
  });

  it('moves the member as it is now, not the copy the review was written with', () => {
    const operations = moveC();
    const { targets } = apply(doc3(), operations);
    const edited = apply(doc3(), [
      op('set', '/stages/c/label', 'Edited since the review'),
      op('insert', '/stages/c/items/-', { id: 'j', text: 'two' }),
    ]).result;
    // Still fits: a move does not depend on what the member holds.
    expect(fixFits(edited, operations, targets)).toBe(true);
    const moved = apply(edited, operations);
    expect(idsOf(moved.result)).toEqual(['c', 'a', 'b']);
    expect(stageC(moved.result)).toEqual(stageC(edited));
  });

  it('is undone as a move, keeping what the member has come to hold', () => {
    const { result, inverse, written } = writtenBy(doc3(), moveC());
    const edited = apply(result, [
      op('set', '/stages/c/label', 'Edited after the fix'),
    ]).result;
    expect(writtenHolds(edited, written)).toBe(true);
    const undone = apply(edited, inverse).result;
    expect(idsOf(undone)).toEqual(['a', 'b', 'c']);
    expect(stageC(undone)).toEqual(stageC(edited));
    expect(apply(result, inverse).result).toEqual(doc3());
  });

  it('is in effect once the member stands where the move would put it', () => {
    const operations = moveC();
    const expected = expectedOf(doc3(), operations);
    expect(fixInEffect(doc3(), operations, expected)).toBe(false);
    const byHand = apply(doc3(), [
      op('set', '/stages/c/label', 'Edited'),
      op('remove', '/stages/c'),
      op('insert', '/stages/a', { id: 'c', label: 'Edited' }),
    ]).result;
    expect(fixInEffect(byHand, operations, expected)).toBe(true);
  });

  it('refuses the second half when the first never ran', () => {
    const [, second] = moveC();
    expect(second && applyOperations(doc3(), [second]).ok).toBe(false);
  });
});

describe('writtenStands', () => {
  it('stands through edits to what the fix wrote, and not once it is as it was before', () => {
    const { result, inverse, written } = writtenBy(doc(), [
      op('set', '/stages/a/label', 'Better'),
    ]);
    expect(writtenStands(result, written)).toBe(true);
    const refined = apply(result, [
      op('set', '/stages/a/label', 'Better still'),
    ]).result;
    expect(writtenHolds(refined, written)).toBe(false);
    expect(writtenStands(refined, written)).toBe(true);
    expect(writtenStands(apply(result, inverse).result, written)).toBe(false);
    expect(writtenStands(doc(), written)).toBe(false);
  });

  it('stands through edits to a member the fix added, and not once the member is gone', () => {
    const { result, written } = writtenBy(doc(), [
      op('insert', '/stages/-', { id: 'n', label: '[PLACEHOLDER]' }),
    ]);
    const filledIn = apply(result, [
      op('set', '/stages/n/label', 'Helpline'),
    ]).result;
    expect(writtenStands(filledIn, written)).toBe(true);
    const deleted = apply(filledIn, [op('remove', '/stages/n')]).result;
    expect(writtenStands(deleted, written)).toBe(false);
  });

  it('does not stand once what the fix removed exists again, whatever it holds', () => {
    const { result, written } = writtenBy(doc(), [
      op('remove', '/codebook/node/person/variables/v2'),
    ]);
    expect(writtenStands(result, written)).toBe(true);
    const recreated = apply(result, [
      op('set', '/codebook/node/person/variables/v2', { name: 'again' }),
    ]).result;
    expect(writtenStands(recreated, written)).toBe(false);
  });

  it('in a list without ids, stands through other changes to the list until what it took out is back', () => {
    const { result, written } = writtenBy(doc(), [
      op('remove', '/codebook/node/person/options/0'),
    ]);
    const options = (root: unknown, operations: StoredOperation[]) =>
      apply(root, operations).result;
    // Another change to the same list: the removal still stands.
    const longer = options(result, [
      op('insert', '/codebook/node/person/options/-', 'w'),
    ]);
    expect(writtenHolds(longer, written)).toBe(false);
    expect(writtenStands(longer, written)).toBe(true);
    // What was removed is put back, among the other changes.
    const back = options(longer, [
      op('insert', '/codebook/node/person/options/0', 'x'),
    ]);
    expect(writtenStands(back, written)).toBe(false);
  });

  it('reads a snapshot taken before `was` was recorded as it always was read', () => {
    const { result, written } = writtenBy(doc(), [
      op('set', '/stages/a/label', 'Better'),
    ]);
    const older = written.map((snapshot) =>
      'before' in snapshot
        ? snapshot
        : {
            path: snapshot.path,
            present: snapshot.present,
            value: snapshot.value,
          },
    );
    const refined = apply(result, [
      op('set', '/stages/a/label', 'Mine'),
    ]).result;
    expect(writtenStands(result, older)).toBe(true);
    expect(writtenStands(refined, older)).toBe(false);
    expect(writtenStands(result, [])).toBe(false);
  });
});

describe('arrays that mix members with and without ids', () => {
  // A list that holds any member with an id is a list of protocol objects: its
  // members are reached by id alone, and a member without one has no path.
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
    // No member has id 2, and no index is read in a list of protocol objects.
    expect(readPath(mixed(), ['fields', '2', 'prompt'])).toEqual({
      found: false,
    });
    const withoutClash = {
      fields: [{ id: 'x', prompt: 'has id' }, { prompt: 'no id' }],
    };
    expect(readPath(withoutClash, ['fields', '1', 'prompt'])).toEqual({
      found: false,
    });
    expect(readPath(withoutClash, ['fields', '0', 'prompt'])).toEqual({
      found: false,
    });
  });

  it('stops reaching a member by its index once another member is given an id', () => {
    const before = { fields: [{ prompt: 'first' }, { prompt: 'second' }] };
    expect(readPath(before, ['fields', '1', 'prompt'])).toEqual({
      found: true,
      value: 'second',
    });
    const after = apply(before, [
      op('insert', '/fields/-', { id: 'new', prompt: 'third' }),
    ]).result;
    expect(readPath(after, ['fields', '1', 'prompt'])).toEqual({
      found: false,
    });
    expect(readPath(after, ['fields', 'new', 'prompt'])).toEqual({
      found: true,
      value: 'third',
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
    // Its index would be 2, which is another member's id.
    expect(
      applyOperations(
        { fields: [{ id: '2', prompt: 'id two' }, { prompt: 'no id' }] },
        [op('insert', '/fields/-', { prompt: 'x' })],
      ),
    ).toEqual({ ok: false, failure: { kind: 'ambiguous_path', operation: 0 } });
    // At an index that is nobody's id it is still out of reach.
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
