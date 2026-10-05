import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  stripManagedProperties,
  useArrayFieldItems,
} from './useArrayFieldItems';

/**
 * ArrayField hands its consumers items carrying the properties it manages
 * (`_internalId`, and `_draft` while an item is uncommitted). Consumers that
 * persist an item — Architect writes them into protocol JSON — have to take
 * those off first, and three of them were doing it with their own inline
 * destructure, each frozen on the managed keys that existed when it was
 * written.
 *
 * The list is now derived from `ManagedProperties` itself, and a key added
 * there without being listed is a compile error rather than a leak. This suite
 * pins the runtime half.
 */
describe('stripManagedProperties', () => {
  it('removes every property ArrayField manages', () => {
    expect(
      stripManagedProperties({
        _internalId: 'internal-1',
        _draft: true,
        label: 'Nickname',
        variable: 'var-1',
      }),
    ).toEqual({ label: 'Nickname', variable: 'var-1' });
  });

  it('keeps a consumer key that merely starts with an underscore', () => {
    expect(
      stripManagedProperties({ _internalId: 'internal-1', _private: 'keep' }),
    ).toEqual({ _private: 'keep' });
  });

  it('leaves an item that carries none of them untouched', () => {
    expect(stripManagedProperties({ label: 'Nickname' })).toEqual({
      label: 'Nickname',
    });
  });

  it('does not mutate the item it was given', () => {
    const item = { _internalId: 'internal-1', _draft: false, label: 'A' };

    stripManagedProperties(item);

    expect(item).toEqual({
      _internalId: 'internal-1',
      _draft: false,
      label: 'A',
    });
  });

  // Callers reach for this on an item that may not exist yet — the editor
  // session for a row that is being created.
  it('answers an empty object for a missing item', () => {
    expect(stripManagedProperties(undefined)).toEqual({});
  });
});

type Row = { label: string };

const labelsOf = (items: readonly (Row & { _internalId: string })[]) =>
  items.map((item) => item.label);

/**
 * Rows with no id of their own — an options list, an attribute list — are the
 * whole subject here. Their internal ids are what a pointer drag holds on to
 * between the pointer going down and coming up, and what every consumer
 * resolving an operation is handed them by; a value arriving in that window is
 * the one thing that can hand an id to a different row.
 */
describe('internal ids across a value the parent replaced', () => {
  it('gives the dragged row’s id to the row that arrived above it, or to that row', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: Row[] }) => useArrayFieldItems<Row>(value, onChange),
      {
        initialProps: {
          value: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
        },
      },
    );

    // The pointer goes down on the middle row. This id is the only hold the
    // drag has on it from here on.
    const draggedId = result.current.items[1]!._internalId;

    // A collaborator's insertion lands while the pointer is still down. An
    // immutable store rebuilds the whole array, so not one of these rows is an
    // object this list has seen before.
    rerender({
      value: [{ label: 'X' }, { label: 'A' }, { label: 'B' }, { label: 'C' }],
    });

    expect(
      result.current.items.find((item) => item._internalId === draggedId),
    ).toMatchObject({ label: 'B' });

    // The pointer comes up. `ArrayField` finds the id it has been tracking in
    // the list as it now stands, and reports the move by the row it names.
    const items = result.current.items;
    const preview = [...items];
    const [moved] = preview.splice(
      items.findIndex((item) => item._internalId === draggedId),
      1,
    );
    preview.unshift(moved!);
    act(() => {
      result.current.setItems(preview, { type: 'move', from: 1, to: 0 });
    });

    // Reusing ids by position would have handed `draggedId` to the row that
    // took the middle place — the arrival pushed everything along by one — and
    // the consumer would be told to move a row the researcher never touched.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![1]).toMatchObject({
      type: 'move',
      item: { label: 'B' },
    });
  });

  it('keeps a row’s id when a keystroke replaces it in place', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: Row[] }) => useArrayFieldItems<Row>(value),
      { initialProps: { value: [{ label: 'a' }, { label: 'ab' }] } },
    );
    const [first, second] = result.current.items.map(
      (item) => item._internalId,
    );

    // The researcher finishes typing in the first row, which now reads exactly
    // like the second. Identity is inferred from content here, so this is the
    // case where content alone would move the caret: the edited row must keep
    // its own id rather than adopt the twin's.
    rerender({ value: [{ label: 'ab' }, { label: 'ab' }] });

    expect(result.current.items.map((item) => item._internalId)).toEqual([
      first,
      second,
    ]);
  });

  it('keeps each row’s id when the parent reorders them', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: Row[] }) => useArrayFieldItems<Row>(value),
      { initialProps: { value: [{ label: 'A' }, { label: 'B' }] } },
    );
    const idOf = (label: string) =>
      result.current.items.find((item) => item.label === label)!._internalId;
    const [idA, idB] = [idOf('A'), idOf('B')];

    rerender({ value: [{ label: 'B' }, { label: 'A' }] });

    expect(idOf('A')).toBe(idA);
    expect(idOf('B')).toBe(idB);
  });
});

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A row carrying, in a key this hook never reads, which row it IS. The three
 * tests above each name one arrival; this is what lets a sweep of arrivals be
 * judged without naming any of them.
 */
type TaggedRow = Record<string, unknown> & { _probe: string; label: string };

/** A fresh object graph, the way an immutable form store hands one back. */
const rebuilt = (rows: readonly TaggedRow[]): TaggedRow[] =>
  rows.map((row) => ({ ...row }));

type ArrivingEdit =
  | { kind: 'insert'; at: number }
  | { kind: 'remove'; at: number }
  | { kind: 'move'; from: number; to: number }
  | { kind: 'retitle'; at: number };

const applyEdit = (
  rows: TaggedRow[],
  edit: ArrivingEdit,
  mint: () => string,
): TaggedRow[] => {
  const next = [...rows];
  if (edit.kind === 'insert') {
    const tag = mint();
    next.splice(edit.at, 0, { _probe: tag, label: `label-${tag}` });
    return next;
  }
  if (edit.kind === 'remove') {
    next.splice(edit.at, 1);
    return next;
  }
  if (edit.kind === 'move') {
    const [moved] = next.splice(edit.from, 1);
    if (moved === undefined) return next;
    next.splice(edit.to, 0, moved);
    return next;
  }
  const row = next[edit.at];
  if (row === undefined) return next;
  next[edit.at] = { ...row, label: `${row.label}-${mint()}` };
  return next;
};

/**
 * What is left over once identity is inferred as well as it can be.
 *
 * A row with no id of its own has only its content, so a same-length arrival
 * that removed row N and inserted a different row N is the same list of rows,
 * in the same order, as one that merely rewrote row N — which is a keystroke,
 * and must keep its id. The two cannot be told apart, and this is how often
 * these 240 sequences ask. It is a ceiling, not a target: a change that lowers
 * it is an improvement, and this number should come down with it.
 */
const AMBIGUOUS_ARRIVALS = 26;

/**
 * The two promises above, asked of arrivals nobody chose.
 *
 * Each sequence tags every row with the row it is, applies one or two edits per
 * arrival — a collaborator who renamed a row and added another, an undo of two
 * commands, a save — and then asks only what the hook undertakes: that no id is
 * handed out twice, and that an id which survives an arrival still names the
 * same row.
 */
describe('internal ids over arrivals nobody chose', () => {
  it('hands no id to two rows, and moves none between rows of a list that resized', () => {
    const duplicated: string[] = [];
    const crossed: string[] = [];
    const crossedWhileResizing: string[] = [];

    for (let seed = 1; seed <= 240; seed += 1) {
      const random = mulberry32(seed);
      let minted = 0;
      const mint = () => `${seed}-${(minted += 1)}`;

      let rows: TaggedRow[] = Array.from(
        { length: 2 + Math.floor(random() * 4) },
        () => {
          const tag = mint();
          return { _probe: tag, label: `label-${tag}` };
        },
      );

      const { result, rerender } = renderHook(
        ({ value }: { value: TaggedRow[] }) =>
          useArrayFieldItems<TaggedRow>(value),
        { initialProps: { value: rebuilt(rows) } },
      );

      let rowNamedBy = new Map(
        result.current.items.map((item) => [item._internalId, item._probe]),
      );
      let sizeBefore = result.current.items.length;

      for (let arrival = 0; arrival < 6; arrival += 1) {
        const editCount = 1 + Math.floor(random() * 2);
        for (let edit = 0; edit < editCount; edit += 1) {
          if (rows.length === 0) {
            rows = applyEdit(rows, { kind: 'insert', at: 0 }, mint);
            continue;
          }
          const pick = random();
          const at = Math.floor(random() * rows.length);
          rows = applyEdit(
            rows,
            pick < 0.3
              ? { kind: 'insert', at }
              : pick < 0.5
                ? { kind: 'remove', at }
                : pick < 0.75
                  ? {
                      kind: 'move',
                      from: at,
                      to: Math.floor(random() * rows.length),
                    }
                  : { kind: 'retitle', at },
            mint,
          );
        }

        act(() => {
          rerender({ value: rebuilt(rows) });
        });
        const items = result.current.items;

        const seen = new Set<string>();
        for (const item of items) {
          if (seen.has(item._internalId)) {
            duplicated.push(
              `seed ${seed} arrival ${arrival}: id ${item._internalId} on two rows`,
            );
          }
          seen.add(item._internalId);
        }

        for (const item of items) {
          const named = rowNamedBy.get(item._internalId);
          if (named === undefined || named === item._probe) continue;
          const report = `seed ${seed} arrival ${arrival}: an id named row ${named}, now names row ${item._probe}`;
          crossed.push(report);
          // The product failure: a row inserted above an edited one takes the
          // edited row's id, so an open editor follows the id onto a row the
          // researcher never opened. A resized list is exactly that shape.
          if (items.length !== sizeBefore) crossedWhileResizing.push(report);
        }

        rowNamedBy = new Map(
          items.map((item) => [item._internalId, item._probe]),
        );
        sizeBefore = items.length;
      }
    }

    expect({
      duplicated: duplicated.slice(0, 3),
      crossedWhileResizing: crossedWhileResizing.slice(0, 3),
    }).toEqual({ duplicated: [], crossedWhileResizing: [] });
    // And what is left is the same-length ambiguity above, and nothing more:
    // anything past the ceiling is printed here as the crossing it is.
    expect(crossed.slice(AMBIGUOUS_ARRIVALS)).toEqual([]);
  });
});

/**
 * A consumer that commits somewhere other than its own `value` — a stage
 * document, in Architect's protocol builder — can refuse a write without the
 * value it hands this list ever changing. Every mutation is drawn out of this
 * hook's own state before the consumer is told about it, so its answer is the
 * only thing that can take a refused edit back off the screen.
 */
describe('a consumer that answers an operation with false', () => {
  it('puts the rows back to the value it was handed', () => {
    const onChange = vi.fn(() => false);
    const value: Row[] = [{ label: 'A' }];
    const { result } = renderHook(() =>
      useArrayFieldItems<Row>(value, onChange),
    );

    act(() => {
      result.current.addItem({ label: 'B' });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(labelsOf(result.current.items)).toEqual(['A']);
  });

  it('leaves them alone when the consumer takes the operation', () => {
    // The same add, answered the ordinary way. Without this the test above
    // passes just as well against a list that throws every add away.
    const onChange = vi.fn();
    const value: Row[] = [{ label: 'A' }];
    const { result } = renderHook(() =>
      useArrayFieldItems<Row>(value, onChange),
    );

    act(() => {
      result.current.addItem({ label: 'B' });
    });

    expect(labelsOf(result.current.items)).toEqual(['A', 'B']);
  });
});
