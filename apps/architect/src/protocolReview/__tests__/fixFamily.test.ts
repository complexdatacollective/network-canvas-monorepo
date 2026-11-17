import { describe, expect, it } from 'vitest';

import type { FixOperation } from '@codaco/protocol-review-worker/contract';

import { applyOperations, planFix, writtenHolds } from '../fixEngine';
import { isJsonObject } from '../fixPath';
import { op } from './fixtures';

/**
 * Rule B over the family of operation sequences a fix can contain, not the
 * examples met so far. For every sequence, under no normalisation and under
 * one that rewrites a top-level key from the rest (as `withInterfaceText`
 * does):
 *
 * (i) applying the fix, storing it the way the store does (a removed
 *     top-level key left as `undefined`), then applying the inverse and
 *     normalising again gives back the starting document;
 * (ii) a later edit to anything the fix wrote or placed — each in turn —
 *      makes `writtenHolds` false, so Undo is refused; and an edit to
 *      something it did not write leaves it true, and Undo keeps that edit.
 */

const doc = () => ({
  description: 'About',
  stages: [
    { id: 'a', label: 'A', meta: { note: 'n' }, options: ['x', 'y'] },
    { id: 'b', label: 'B' },
  ],
  options: ['x', 'y', 'z'],
  codebook: { v1: { name: 'one', hint: 'h' }, v2: { name: 'two' } },
});

type Doc = Record<string, unknown>;

const normalizers: [string, (raw: unknown) => unknown][] = [
  ['no normalisation', (raw) => raw],
  [
    // Rewrites a top-level key from the rest, and drops it when it would be
    // empty, as `withInterfaceText` does with the interview's shared words.
    'a normalisation that derives a top-level key',
    (raw) => {
      if (!isJsonObject(raw) || !Array.isArray(raw.stages)) return raw;
      const { derived: _derived, ...rest } = raw;
      return raw.stages.length > 2
        ? { ...rest, derived: raw.stages.length }
        : rest;
    },
  ],
];

type Case = {
  name: string;
  operations: FixOperation[];
  /** Researcher edits, each to one thing the fix wrote or placed. */
  edits: FixOperation[];
  /** A researcher edit to something the fix did not touch. */
  untouched: FixOperation;
};

const CASES: Case[] = [
  {
    name: 'two inserts at one index, in an array without ids',
    operations: [
      op('insert', '/options/0', 'p'),
      op('insert', '/options/0', 'q'),
    ],
    edits: [op('set', '/options/0', 'Q'), op('set', '/options/1', 'P')],
    untouched: op('set', '/codebook/v2/name', 'other'),
  },
  {
    name: 'two inserts at one anchor, in an array with ids',
    operations: [
      op('insert', '/stages/a', { id: 'n1', label: 'N1' }),
      op('insert', '/stages/a', { id: 'n2', label: 'N2' }),
    ],
    edits: [
      op('set', '/stages/n1/label', 'mine'),
      op('set', '/stages/n2/label', 'mine'),
      op('remove', '/stages/n1'),
    ],
    untouched: op('set', '/stages/b/label', 'B2'),
  },
  {
    name: 'an insert, then a set inside the inserted member',
    operations: [
      op('insert', '/stages/-', { id: 'n', label: 'N' }),
      op('set', '/stages/n/label', 'M'),
    ],
    edits: [
      op('set', '/stages/n/label', 'mine'),
      op('set', '/stages/n/extra', 1),
    ],
    untouched: op('set', '/stages/a/label', 'A2'),
  },
  {
    name: 'a remove, then an insert, in an array with ids',
    operations: [
      op('remove', '/stages/a'),
      op('insert', '/stages/b', { id: 'a2', label: 'A2' }),
    ],
    edits: [
      op('insert', '/stages/-', { id: 'a', label: 'again' }),
      op('set', '/stages/a2/label', 'mine'),
    ],
    untouched: op('set', '/stages/b/label', 'B2'),
  },
  {
    name: 'a remove, then an insert, in an array without ids',
    operations: [op('remove', '/options/1'), op('insert', '/options/0', 'w')],
    edits: [op('set', '/options/0', 'W'), op('set', '/options/1', 'X')],
    untouched: op('set', '/codebook/v1/name', 'uno'),
  },
  {
    name: 'a set, then a remove of what contains it',
    operations: [
      op('set', '/codebook/v1/name', 'uno'),
      op('remove', '/codebook/v1'),
    ],
    edits: [op('set', '/codebook/v1', { name: 'back' })],
    untouched: op('set', '/codebook/v2/name', 'other'),
  },
  {
    name: 'the removal of an optional top-level key',
    operations: [op('remove', '/description')],
    edits: [op('set', '/description', 'New')],
    untouched: op('set', '/codebook/v2/name', 'other'),
  },
  {
    name: 'the removal of an optional nested key',
    operations: [op('remove', '/codebook/v1/hint')],
    edits: [op('set', '/codebook/v1/hint', 'mine')],
    untouched: op('set', '/codebook/v1/name', 'uno'),
  },
  {
    name: 'operations on two arrays at once',
    operations: [
      op('set', '/stages/a/options/1', 'Y'),
      op('insert', '/options/-', 'w'),
    ],
    edits: [
      op('set', '/stages/a/options/1', 'mine'),
      op('set', '/options/3', 'mine'),
    ],
    untouched: op('set', '/stages/b/label', 'B2'),
  },
  {
    name: 'a member replaced by one with another id',
    operations: [op('set', '/stages/a', { id: 'a3', label: 'A3' })],
    edits: [
      op('set', '/stages/a3/label', 'mine'),
      op('insert', '/stages/-', { id: 'a', label: 'again' }),
    ],
    untouched: op('set', '/stages/b/label', 'B2'),
  },
  {
    name: 'a set of an existing key and of a new one in one object',
    operations: [
      op('set', '/stages/a/meta/note', 'nn'),
      op('set', '/stages/a/meta/added', 1),
    ],
    edits: [
      op('set', '/stages/a/meta/note', 'mine'),
      op('remove', '/stages/a/meta/added'),
    ],
    untouched: op('set', '/stages/a/label', 'A2'),
  },
];

/** The document as the store would hold it: the merge leaves removed keys as `undefined`. */
const asStored = (from: Doc, to: unknown): Doc => {
  if (!isJsonObject(to)) throw new Error('not a document');
  const removed = Object.keys(from).filter((key) => !Object.hasOwn(to, key));
  return {
    ...from,
    ...Object.fromEntries(removed.map((key) => [key, undefined])),
    ...to,
  };
};

/** As JSON reads it, independent of the engine's own comparison. */
const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const edit = (root: unknown, operation: FixOperation) => {
  const result = applyOperations(root, [operation]);
  if (!result.ok) {
    throw new Error(`edit failed: ${operation.op} ${operation.path}`);
  }
  return result.result;
};

describe.each(normalizers)('rule B under %s', (_name, normalize) => {
  const start = (): Doc => {
    const normalized = normalize(doc());
    if (!isJsonObject(normalized)) throw new Error('setup');
    return normalized;
  };

  const applied = (operations: FixOperation[]) => {
    const plan = planFix(start(), operations, normalize);
    if (!plan.ok) throw new Error(`plan refused: ${plan.reason}`);
    return { plan, stored: asStored(start(), plan.result) };
  };

  it.each(CASES.map((c) => [c.name, c] as const))(
    '(i) the inverse gives back the start: %s',
    (_caseName, { operations }) => {
      const { plan, stored } = applied(operations);
      expect(writtenHolds(stored, plan.written)).toBe(true);
      const undo = planFix(stored, plan.inverse, normalize);
      if (!undo.ok) throw new Error(`undo refused: ${undo.reason}`);
      expect(asJson(undo.result)).toEqual(asJson(start()));
    },
  );

  it.each(
    CASES.flatMap((c) =>
      c.edits.map(
        (change) =>
          [`${c.name}; then ${change.op} ${change.path}`, c, change] as const,
      ),
    ),
  )(
    '(ii) Undo is refused after an edit to what it wrote: %s',
    (_label, c, change) => {
      const { plan, stored } = applied(c.operations);
      const edited = normalize(edit(stored, change));
      expect(writtenHolds(edited, plan.written)).toBe(false);
    },
  );

  it.each(CASES.map((c) => [c.name, c] as const))(
    '(ii) Undo still holds, and keeps the edit, after an edit elsewhere: %s',
    (_caseName, { operations, untouched }) => {
      const { plan, stored } = applied(operations);
      const edited = normalize(edit(stored, untouched));
      expect(writtenHolds(edited, plan.written)).toBe(true);
      const undo = planFix(edited, plan.inverse, normalize);
      if (!undo.ok) throw new Error(`undo refused: ${undo.reason}`);
      expect(asJson(undo.result)).toEqual(
        asJson(normalize(edit(start(), untouched))),
      );
    },
  );
});
