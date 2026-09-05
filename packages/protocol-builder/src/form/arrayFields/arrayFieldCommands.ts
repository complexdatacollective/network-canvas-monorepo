import { isEqual } from 'es-toolkit/compat';

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

const NO_ROWS: readonly never[] = [];

/**
 * The rows the editor DREW, out of the value the list field was handed — and
 * the rule for a list that holds a HOLE.
 *
 * A hole is an entry that is not a row at all: `null`, `undefined`, a string
 * left behind by an import or a migration. It is a document row the editor
 * does not render, and everything below turns on that, because an
 * `ArrayFieldOperation` numbers rows by their position among the ones DRAWN
 * while every command it becomes carries a position in the DOCUMENT —
 * `insertItem(key, index)`, `removeItem(key, index)`,
 * `moveItem(key, from, to)`. The two are the same numbering only while the
 * document holds nothing but rows.
 *
 * So the rule is:
 *
 *   a position is never replayed as a document index. It names a row among
 *   the ones the editor drew, and that row is mapped to its own place in the
 *   document — through the WHOLE array, holes included — before any command
 *   is built. A list the editor drew no rows for can therefore only be
 *   appended to.
 *
 * `resolveRowIndex` is that mapping (by the row's own id, else by position
 * while the two lists are still one list, else by content); `resolveInsertIndex`
 * is it for an append, which is `current.length` — the end of the document,
 * not the end of the rows on screen.
 *
 * Which rows were drawn is fresco-ui's answer, not ours: `ArrayField` refuses
 * a value with ANY non-object entry and renders the empty list (`isItemList` —
 * `useArrayFieldItems` keys its internal ids on the row objects in a WeakMap,
 * where a primitive is not merely the wrong shape but an illegal key). That is
 * mirrored here rather than guessed at, because reading an operation's index
 * in a numbering the editor never used is the whole defect: for
 * `[null, { … }]` the editor draws nothing, so its Add reports index 0, and
 * replaying that lands the new row at the TOP of the document — in front of a
 * row the researcher could not even see.
 *
 * A hole is NOT repaired away the way a foreign value is (see `readArray` in
 * `useArrayFieldCommands`). That rule replaces a value because the command
 * would otherwise throw out of `asList`, and because nothing inside it is a
 * row any reader could render. Neither is true here: `insertItem` applies to a
 * holed list perfectly well, and the entries beside the hole are real rows the
 * researcher authored, which `readRows` still shows. Replacing the value with
 * the drawn rows would delete those — a salvage in reverse — and it would move
 * the indices the operation was resolved against, which is exactly what that
 * rule forbids. The hole stays where it is, and the edit is expressed against
 * the document as it stands.
 */
function renderedRows<T extends ArrayRow>(
  rendered: readonly T[],
): readonly T[] {
  return rendered.every((row) => typeof row === 'object' && row !== null)
    ? rendered
    : NO_ROWS;
}

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
 *
 * `rendered` is the rows the editor DREW — `renderedRows` above, applied once
 * at `commandsForOperation` — so a hole never reaches here. That is what lets
 * `getId` be asked about a row unguarded, and what keeps `sameList`'s position
 * shortcut honest: it may answer "the same list" only when the numbering the
 * operation came from and the document's own are the same numbering.
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
 * The edit a commit is making, re-seated on the row as it stands NOW.
 *
 * Rebuilding the replacement array from what the session holds is what lets a
 * row that arrived from elsewhere survive the write — but only as a ROW.
 * Dropping the edited row in whole discards an arrival that reached a
 * different property of that same row, because the values the edit was built
 * from are a revision behind: a list editor composes its replacement from the
 * row the form rendered, and a dialog composes its own before its pre-save
 * work has even run.
 *
 * So only what the edit actually DECIDED is applied over the row the session
 * holds: a key it left as it found it keeps whatever the row holds now, a key
 * it changed is changed, and a key it removed is removed. `base` is the row
 * the edit was computed from, which is the only thing that tells "left alone"
 * apart from "deliberately set back to what it was".
 *
 * The question is asked LEAF by leaf, not key by key. A dialog that edits one
 * leaf of a nested key — `edges.create` — makes the whole `edges` object
 * differ from the one it started with, so a key-level comparison reads the
 * untouched sibling `edges.display` as decided too, and writes the value the
 * dialog opened with straight back over whatever reached it meanwhile. Nesting
 * is where that arrives from in the first place: a stage document holds
 * capabilities as objects, and two collaborators can be inside the same one.
 *
 * A list is a leaf. Its rows have no identity here, so merging two versions of
 * one index by index would combine rows that are not the same row; a list the
 * edit changed is the edit's, and one it left alone is the row's.
 */
export function reseatEditedRow(
  base: unknown,
  edited: unknown,
  latest: unknown,
): unknown {
  if (!isRecord(base) || !isRecord(edited) || !isRecord(latest)) return edited;
  // Nothing reached the row while the edit was being made, so the edit already
  // describes the whole row and re-seating it could only lose information.
  if (isEqual(base, latest)) return edited;

  return reseatRecord(base, edited, latest);
}

function reseatRecord(
  base: ArrayRow,
  edited: ArrayRow,
  latest: ArrayRow,
): ArrayRow {
  const next: ArrayRow = { ...latest };
  for (const key of new Set([...Object.keys(base), ...Object.keys(edited)])) {
    const inEdited = Object.hasOwn(edited, key);
    if (
      inEdited === Object.hasOwn(base, key) &&
      isEqual(edited[key], base[key])
    ) {
      continue;
    }
    if (!inEdited) {
      Reflect.deleteProperty(next, key);
      continue;
    }
    const editedValue = edited[key];
    const baseValue = base[key];
    const latestValue = next[key];
    next[key] =
      isRecord(baseValue) && isRecord(editedValue) && isRecord(latestValue)
        ? reseatRecord(baseValue, editedValue, latestValue)
        : editedValue;
  }
  return next;
}

/**
 * One committed list mutation, as commands against the stage document.
 *
 * A replace is a whole-key `set` rather than a remove-then-insert pair,
 * because the command vocabulary addresses a document KEY and cannot reach
 * inside a row: two commands would be two history entries for one edit, and a
 * list that briefly did not contain the row being edited. The replacement
 * array is rebuilt from what the session holds now, and the replaced row is
 * re-seated on what the session holds for THAT row (see `reseatEditedRow`), so
 * a change that arrived from elsewhere survives the write whether it arrived
 * as a new row or as a new property of the row being replaced.
 *
 * `value` is what the list field was HANDED, which is not always what it drew:
 * the one place the drawn rows are settled is here, so every consumer of this
 * module resolves in the numbering its operation was made in. See
 * `renderedRows`.
 */
export function commandsForOperation<T extends ArrayRow>(
  key: string,
  current: readonly unknown[],
  value: readonly T[],
  operation: ArrayFieldOperation<T>,
  getId?: ArrayRowIdentity<T>,
): Command[] {
  const rendered = renderedRows(value);

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
  next[index] = reseatEditedRow(
    rendered[operation.index],
    operation.item,
    current[index],
  );
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
 *
 * `base` is the row the edit was computed from, and the edit is re-seated on
 * it exactly as a replace is — a save that outlived its editing session is the
 * longest window of all for something to have reached the row meanwhile.
 */
export function commandsForDetachedRow<T extends ArrayRow>(
  key: string,
  current: readonly unknown[],
  row: T,
  id: string | undefined,
  isNewRow: boolean,
  getId?: ArrayRowIdentity<T>,
  base?: ArrayRow,
): Command[] {
  const index =
    id === undefined
      ? -1
      : current.findIndex(
          (candidate) => isRecord(candidate) && getId?.(candidate as T) === id,
        );
  if (index !== -1) {
    const next = [...current];
    next[index] = reseatEditedRow(base, row, current[index]);
    return [{ op: 'set', key, value: next }];
  }
  return isNewRow
    ? [{ op: 'insertItem', key, index: current.length, item: row }]
    : [];
}
