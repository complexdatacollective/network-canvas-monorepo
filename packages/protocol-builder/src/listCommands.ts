import {
  applyCommand,
  canonicalize,
  type Command,
  type CommandTarget,
  type SectionDoc,
  targetPath,
} from '@codaco/studio-sync/apply';

import {
  type ArrayRow,
  resolveInsertIndex,
  resolveMove,
  resolveRowIndex,
  rowIdentity,
} from './form/arrayFields/arrayFieldCommands.ts';

/**
 * How deep a command may address.
 *
 * The wire refuses a longer path (`@codaco/studio-rpc`'s `CommandTargetSchema`
 * bounds it at sixteen segments so the commit work a command describes stays
 * predictable), so a diff that walked deeper would emit a command the server
 * rejects. Anything below that depth is written as a `set` of the value at the
 * sixteenth segment instead, which is what the diff did at every depth before
 * nested addressing existed.
 */
export const MAX_COMMAND_PATH_SEGMENTS = 16;

export const isDictionary = (value: unknown): value is SectionDoc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A list as the row resolvers read one.
 *
 * They are written in terms of records because that is what a row of an editor
 * list is, and they only ever hand an entry to `canonicalize` or to the id
 * reader — both of which take anything — so a list holding something else is
 * resolved by content and position exactly as it should be.
 */
const asRows = (list: readonly unknown[]): readonly ArrayRow[] =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  list as readonly ArrayRow[];

/** The list a command addresses, or `null` when that place holds something else. */
function listAt(doc: SectionDoc, target: CommandTarget): unknown[] | null {
  let cursor: unknown = doc;
  for (const segment of targetPath(target)) {
    if (!isDictionary(cursor)) return null;
    cursor = cursor[segment];
  }
  // Absent reads as empty, the way the apply engine's own list operations read
  // it: inserting the first row of a list the document does not keep yet is an
  // insert into nothing, not a failure.
  if (cursor === undefined) return [];
  return Array.isArray(cursor) ? [...cursor] : null;
}

type ListOperation =
  | Readonly<{ op: 'insertItem'; index: number; item: unknown }>
  | Readonly<{ op: 'removeItem'; index: number }>
  | Readonly<{ op: 'moveItem'; from: number; to: number }>;

function applyListOperation(
  list: readonly unknown[],
  operation: ListOperation,
): unknown[] {
  const next = [...list];
  if (operation.op === 'insertItem') {
    next.splice(operation.index, 0, operation.item);
    return next;
  }
  if (operation.op === 'removeItem') {
    next.splice(operation.index, 1);
    return next;
  }
  const [moved] = next.splice(operation.from, 1);
  next.splice(operation.to, 0, moved);
  return next;
}

/** The first position at which two lists disagree, by content. */
function firstDifference(
  before: readonly unknown[],
  after: readonly unknown[],
): number {
  const shared = Math.min(before.length, after.length);
  for (let index = 0; index < shared; index += 1) {
    if (canonicalize(before[index]) !== canonicalize(after[index]))
      return index;
  }
  return shared;
}

/** The last position at which two lists of the same length disagree. */
function lastDifference(
  before: readonly unknown[],
  after: readonly unknown[],
): number {
  for (let index = before.length - 1; index >= 0; index -= 1) {
    if (canonicalize(before[index]) !== canonicalize(after[index]))
      return index;
  }
  return -1;
}

/**
 * The one row operation that turns `before` into `after`, or `null`.
 *
 * Proposed from where the two lists first disagree and then VERIFIED by
 * performing it: a proposal that does not reproduce `after` exactly is
 * discarded rather than emitted, so nothing structural is ever claimed about a
 * change the command vocabulary cannot actually express — two rows added at
 * once, or a row whose contents were rewritten in place, which the vocabulary
 * cannot reach inside.
 */
function singleRowOperation(
  before: readonly unknown[],
  after: readonly unknown[],
): ListOperation | null {
  const reproduces = (operation: ListOperation) =>
    canonicalize(applyListOperation(before, operation)) === canonicalize(after);

  if (after.length === before.length + 1) {
    const index = firstDifference(before, after);
    const insert: ListOperation = {
      op: 'insertItem',
      index,
      item: after[index],
    };
    return reproduces(insert) ? insert : null;
  }

  if (before.length === after.length + 1) {
    const remove: ListOperation = {
      op: 'removeItem',
      index: firstDifference(before, after),
    };
    return reproduces(remove) ? remove : null;
  }

  if (before.length !== after.length) return null;
  const from = firstDifference(before, after);
  const to = lastDifference(before, after);
  if (from >= before.length || to < 0) return null;
  // A move is the row at one end of the disturbed span arriving at the other,
  // and only those two readings can be right: everything between them shifted
  // by exactly one place, which is what a move does and nothing else does.
  for (const move of [
    { op: 'moveItem', from, to } as const,
    { op: 'moveItem', from: to, to: from } as const,
  ]) {
    if (reproduces(move)) return move;
  }
  return null;
}

/**
 * A list's change, as the command that describes it.
 *
 * One inserted, removed or moved row is said structurally, so a collaborator's
 * client can replay it onto a list that has since changed and so this session
 * can rebase it onto a base that has. Anything else is a whole-list `set`,
 * which is the honest answer when the vocabulary cannot say what happened.
 */
export function commandForListChange(
  key: CommandTarget,
  before: readonly unknown[],
  after: readonly unknown[],
): Command {
  const operation = singleRowOperation(before, after);
  if (operation === null) {
    return { op: 'set', key, value: structuredClone(after) };
  }
  if (operation.op === 'insertItem') {
    return {
      op: 'insertItem',
      key,
      index: operation.index,
      item: structuredClone(operation.item),
    };
  }
  if (operation.op === 'removeItem') {
    return { op: 'removeItem', key, index: operation.index };
  }
  return { op: 'moveItem', key, from: operation.from, to: operation.to };
}

/**
 * Where a row of `before` is in `list` now.
 *
 * Its own id when it has one, then its content when that content appears
 * exactly once, and only then its position — the same cascade `resolveRowIndex`
 * resolves a rendered index with, for the same reason: an id survives every
 * reorder, identical rows are genuinely indistinguishable, and a position is
 * the only thing that tells two of those apart. `-1` means the row is not
 * there at all.
 *
 * Not that function, because a merge asks a different question of the same
 * cascade. `resolveRowIndex` refuses a row it cannot tell from another, which
 * is right when the answer decides which row a command edits; here it would
 * read as "the row is gone", and a merge that took that literally would DELETE
 * a row over an ambiguity. So position is the last word rather than a refusal,
 * and being genuinely absent is answered separately from being unresolvable.
 */
function findRow(
  list: readonly unknown[],
  row: unknown,
  index: number,
): number {
  const id = rowIdentity(row);
  if (id !== undefined) {
    return list.findIndex((candidate) => rowIdentity(candidate) === id);
  }
  const content = canonicalize(row);
  const matches = list.reduce<number[]>((found, candidate, candidateIndex) => {
    if (canonicalize(candidate) === content) found.push(candidateIndex);
    return found;
  }, []);
  if (matches.length === 1) return matches[0]!;
  return matches.includes(index) ? index : -1;
}

/**
 * A whole-list `set` made against `before`, merged with the list a new base
 * holds.
 *
 * A `set` is what a list editor commits when it rewrites one row — the
 * vocabulary cannot reach inside a row, so the whole list is written — and
 * replaying that value onto a base that has moved writes a collaborator's rows
 * back out of existence. Row by row instead, against the list the edit was
 * made on as the common ancestor:
 *
 * - a row the edit left exactly as it found it follows the ARRIVAL, so
 *   somebody else's rewrite of it stands;
 * - a row the edit changed keeps the researcher's version;
 * - a row the edit removed goes, and a row the arrival added appears;
 * - a row the edit added is put back where the edit put it, after whichever
 *   row it followed there.
 *
 * The arrival's order stands, because the edit that produced a `set` is about
 * a row's contents rather than about where the rows are — a reorder is a
 * `moveItem`, which is rebased rather than merged.
 */
function mergeListArrival(
  before: readonly unknown[],
  arrival: readonly unknown[],
  next: readonly unknown[],
): unknown[] {
  // Where each ancestor row ended up on each side. An id-less row in a list the
  // edit did not resize is matched by POSITION: such an edit rewrote one row in
  // place, and its rewritten content is exactly what content matching cannot
  // find.
  const localOf = before.map((row, index) =>
    rowIdentity(row) === undefined && next.length === before.length
      ? index
      : findRow(next, row, index),
  );
  const remoteOf = before.map((row, index) => findRow(arrival, row, index));

  const merged: unknown[] = [];
  arrival.forEach((row, index) => {
    const ancestor = remoteOf.indexOf(index);
    if (ancestor === -1) {
      merged.push(row);
      return;
    }
    const local = localOf[ancestor];
    if (local === undefined || local === -1) return;
    const localRow = next[local];
    merged.push(
      canonicalize(localRow) === canonicalize(before[ancestor])
        ? row
        : localRow,
    );
  });

  next.forEach((row, index) => {
    if (localOf.includes(index)) return;
    const predecessor = index === 0 ? undefined : next[index - 1];
    const after =
      predecessor === undefined ? -1 : findRow(merged, predecessor, index - 1);
    merged.splice(
      after === -1 ? Math.min(index, merged.length) : after + 1,
      0,
      row,
    );
  });

  return merged;
}

/**
 * One command, re-expressed against a document whose list has moved.
 *
 * `null` refuses the command outright, which is the only right answer when the
 * row it named has left the list: applying it to whatever has moved into that
 * position would remove or reorder a row the researcher never touched.
 */
function rebaseCommand(
  basis: SectionDoc,
  current: SectionDoc,
  command: Command,
): Command | null {
  // A `set` of anything but a list, and an `unset`, say what they say wherever
  // they land: neither addresses a row.
  if (command.op === 'unset') return command;
  const written = command.op === 'set' ? command.value : undefined;
  if (command.op === 'set' && !Array.isArray(written)) return command;

  const before = listAt(basis, command.key);
  const arrival = listAt(current, command.key);
  if (before === null || arrival === null) return command;
  // Nothing moved under this command, so it means exactly what it meant — and
  // the command object itself is kept, so a batch that needs no rebasing stays
  // byte-identical on the wire and in the command log.
  if (canonicalize(before) === canonicalize(arrival)) return command;

  if (command.op === 'set') {
    if (!Array.isArray(written)) return command;
    const value = mergeListArrival(before, arrival, written);
    return canonicalize(value) === canonicalize(written)
      ? command
      : { ...command, value };
  }

  if (command.op === 'insertItem') {
    const index = resolveInsertIndex(
      arrival,
      asRows(before),
      command.index,
      rowIdentity,
    );
    return index === command.index ? command : { ...command, index };
  }

  if (command.op === 'removeItem') {
    const index = resolveRowIndex(
      arrival,
      asRows(before),
      command.index,
      rowIdentity,
    );
    if (index === undefined) return null;
    return index === command.index ? command : { ...command, index };
  }

  const move = resolveMove(
    arrival,
    asRows(before),
    command.from,
    command.to,
    rowIdentity,
  );
  if (move === undefined) return null;
  return move.from === command.from && move.to === command.to
    ? command
    : { ...command, ...move };
}

/**
 * A batch of commands, re-expressed against a base that has moved beneath it.
 *
 * A batch describes an EDIT to the document it was made on, not a set of
 * values to write onto whatever arrives next. An index in it is a position in
 * the list the researcher was looking at, and a whole-list `set` in it is the
 * list they were looking at with one row rewritten — so replaying either
 * literally onto a base a collaborator has since added a row to lands the edit
 * on the wrong row, or throws their row away.
 *
 * `basis` is the document the batch was applied to, which is what says what
 * each command MEANT; `current` is the document it is being replayed onto. The
 * commands are walked in order against both, so a batch that touches one list
 * twice resolves its second command against the list its first one produced.
 *
 * The batch is returned unchanged — the same array, holding the same command
 * objects — when nothing it addresses has moved.
 */
export function rebaseCommands(
  basis: SectionDoc,
  current: SectionDoc,
  commands: readonly Command[],
): readonly Command[] {
  let basisDocument = basis;
  let currentDocument = current;
  const rebased: Command[] = [];
  let moved = false;

  for (const command of commands) {
    const next = rebaseCommand(basisDocument, currentDocument, command);
    if (next !== command) moved = true;
    if (next !== null) {
      rebased.push(next);
      currentDocument = applyCommand(currentDocument, next);
    }
    // Against the ORIGINAL command, because the basis is the ground the batch
    // was written on and the next command in it was written against what this
    // one left there.
    basisDocument = applyCommand(basisDocument, command);
  }

  return moved ? rebased : commands;
}
