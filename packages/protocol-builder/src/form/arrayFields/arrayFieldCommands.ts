import type { ArrayFieldOperation } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { type Command, canonicalize } from '@codaco/studio-sync/apply';

export type ArrayRow = Record<string, unknown>;

/** Answers a row's own stable id, when the row carries one. */
export type ArrayRowIdentity<T extends ArrayRow> = (
  item: T,
) => string | undefined;

const isRecord = (value: unknown): value is ArrayRow =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readRows = (value: unknown): ArrayRow[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const sameList = (left: readonly unknown[], right: readonly unknown[]) =>
  canonicalize(left) === canonicalize(right);

/**
 * Where a row the editor was showing lives in the array the session holds NOW.
 *
 * The whole point of this module. An `ArrayFieldOperation` addresses rows by
 * position in the value the list RENDERED, and that value is a revision behind
 * the moment anything else moves the array — a collaborator inserting a row, an
 * undo, a save that outlived its dialog. Replaying the rendered index onto the
 * current array is what relabels a different row.
 *
 * Resolution, in order:
 *
 * 1. The row's own id, when it has one. Authoritative: an id survives every
 *    reorder and insertion, so nothing else needs to be true for it to be
 *    right.
 * 2. Otherwise, the position — but only while the two lists are still the same
 *    list. Position is the only thing that tells two identical rows apart (an
 *    options list may legitimately hold two blank rows), so it is preferred
 *    over content whenever it is trustworthy at all.
 * 3. Otherwise, content, and only when exactly one row matches. Two rows with
 *    the same content and no ids are genuinely indistinguishable; picking
 *    either would be a guess, and a guess here writes onto the wrong row.
 *
 * `undefined` means the row cannot be found, and the caller must issue NO
 * command rather than one addressed at whatever now occupies that index.
 */
export function resolveRowIndex<T extends ArrayRow>(
  current: readonly unknown[],
  rendered: readonly T[],
  index: number,
  getId?: ArrayRowIdentity<T>,
): number | undefined {
  const row = rendered[index];
  if (row === undefined) return undefined;

  const id = getId?.(row);
  if (id !== undefined) {
    const byId = current.findIndex(
      (candidate) => isRecord(candidate) && getId?.(candidate as T) === id,
    );
    return byId === -1 ? undefined : byId;
  }

  if (sameList(current, rendered)) {
    return index < current.length ? index : undefined;
  }

  const content = canonicalize(row);
  const matches = current.reduce<number[]>(
    (found, candidate, candidateIndex) => {
      if (canonicalize(candidate) === content) found.push(candidateIndex);
      return found;
    },
    [],
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Where a new row goes in the array the session holds now.
 *
 * Unlike the other operations this one can never be refused — the row does not
 * exist yet, so there is no wrong row to land on — but it still has to land in
 * the right PLACE. An append (which is what every list here does) stays an
 * append; an insert before a known row stays before that row.
 */
export function resolveInsertIndex<T extends ArrayRow>(
  current: readonly unknown[],
  rendered: readonly T[],
  index: number,
  getId?: ArrayRowIdentity<T>,
): number {
  if (index >= rendered.length) return current.length;
  const successor = resolveRowIndex(current, rendered, index, getId);
  return successor ?? Math.min(index, current.length);
}

/**
 * The move, expressed against the array the session holds now.
 *
 * The destination is anchored on the row the moved one will FOLLOW, rather
 * than on a number, because a number means something different in a list that
 * has since gained or lost rows. `undefined` refuses the move.
 */
export function resolveMove<T extends ArrayRow>(
  current: readonly unknown[],
  rendered: readonly T[],
  from: number,
  to: number,
  getId?: ArrayRowIdentity<T>,
): Readonly<{ from: number; to: number }> | undefined {
  const currentFrom = resolveRowIndex(current, rendered, from, getId);
  if (currentFrom === undefined) return undefined;
  if (sameList(current, rendered)) {
    return to >= 0 && to < current.length ? { from, to } : undefined;
  }

  const reordered = [...rendered];
  const [moved] = reordered.splice(from, 1);
  if (moved === undefined) return undefined;
  reordered.splice(to, 0, moved);

  const remaining = [...current];
  remaining.splice(currentFrom, 1);
  const anchorIndex = (neighbour: T | undefined) =>
    neighbour === undefined
      ? undefined
      : resolveRowIndex(remaining, [neighbour] as readonly T[], 0, getId);

  // The row the moved one will FOLLOW says where it goes; when it is moving to
  // the very top of the rows the editor could see, the row it will PRECEDE
  // says instead. Anchoring on a neighbour rather than on a number is what
  // keeps "put this at the top of my list" from meaning "above a row that
  // arrived from somewhere else and that I never saw".
  const predecessor = anchorIndex(reordered[to - 1]);
  if (predecessor !== undefined)
    return { from: currentFrom, to: predecessor + 1 };

  const successor = anchorIndex(reordered[to + 1]);
  if (successor !== undefined) return { from: currentFrom, to: successor };

  return remaining.length === 0 ? { from: currentFrom, to: 0 } : undefined;
}

/**
 * One committed list mutation, as commands against the stage document.
 *
 * A replace is a whole-key `set` rather than a remove-then-insert pair,
 * because the command vocabulary addresses a document KEY and cannot reach
 * inside a row: two commands would be two history entries for one edit, and a
 * list that briefly did not contain the row being edited. The replacement
 * array is rebuilt from what the session holds now, so a row that arrived from
 * elsewhere survives the write.
 */
export function commandsForOperation<T extends ArrayRow>(
  key: string,
  current: readonly unknown[],
  rendered: readonly T[],
  operation: ArrayFieldOperation<T>,
  getId?: ArrayRowIdentity<T>,
): Command[] {
  if (operation.type === 'insert') {
    const index = resolveInsertIndex(current, rendered, operation.index, getId);
    return [{ op: 'insertItem', key, index, item: operation.item }];
  }

  if (operation.type === 'move') {
    const move = resolveMove(
      current,
      rendered,
      operation.from,
      operation.to,
      getId,
    );
    return move === undefined
      ? []
      : [{ op: 'moveItem', key, from: move.from, to: move.to }];
  }

  const index = resolveRowIndex(current, rendered, operation.index, getId);
  if (index === undefined) return [];
  if (operation.type === 'remove') {
    return [{ op: 'removeItem', key, index }];
  }

  const next = [...current];
  next[index] = operation.item;
  return [{ op: 'set', key, value: next }];
}

/**
 * Commits a row addressed by its OWN id rather than by a position — the save
 * that outlived the editing session it was made in.
 *
 * Returns no commands when that row has left the array: there is then nothing
 * to commit the edit to, and appending it would add a row the researcher
 * deleted. A row being ADDED is the exception, because it was never in the
 * array to begin with.
 */
export function commandsForDetachedRow<T extends ArrayRow>(
  key: string,
  current: readonly unknown[],
  row: T,
  id: string | undefined,
  isNewRow: boolean,
  getId?: ArrayRowIdentity<T>,
): Command[] {
  const index =
    id === undefined
      ? -1
      : current.findIndex(
          (candidate) => isRecord(candidate) && getId?.(candidate as T) === id,
        );
  if (index !== -1) {
    const next = [...current];
    next[index] = row;
    return [{ op: 'set', key, value: next }];
  }
  return isNewRow
    ? [{ op: 'insertItem', key, index: current.length, item: row }]
    : [];
}
