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

/**
 * The list a command addresses, or `null` when that place holds something else.
 *
 * Absent reads as empty at EVERY depth, the way the apply engine's own list
 * operations read it: `readAt` answers `undefined` the moment a container on
 * the way is missing, and `asList` turns that into `[]`. Inserting the first
 * row of a list the document does not keep yet is an insert into nothing
 * rather than a failure, and so is a NESTED list whose container the arrival
 * has just dropped — "one researcher adds a block while another switches the
 * introduction screen off" is exactly that, because `PageContentSection` binds
 * its list at `introScreen.items` and gives the switch the container above it.
 *
 * Reading a missing container as "not a list, do not rebase" instead let the
 * pending row command through un-rebased, to an apply that DID read the place
 * as an empty list and refused the command's index: `ApplyError` escaping
 * `acknowledge`, which the Studio client turns into lost edit access.
 *
 * A segment that is PRESENT and is not a dictionary is the other answer. The
 * apply engine throws on it too, and there is nothing here to rebase against.
 */
function listAt(doc: SectionDoc, target: CommandTarget): unknown[] | null {
  let cursor: unknown = doc;
  for (const segment of targetPath(target)) {
    if (cursor === undefined) return [];
    if (!isDictionary(cursor)) return null;
    cursor = cursor[segment];
  }
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
 * A copy of `row` in `list`, or `-1` when the list holds none.
 *
 * Its own id when it has one — authoritative, and its absence means the row is
 * gone. Otherwise its content, at its own position when that position still
 * holds it and anywhere in the list when it does not: an id-less row's identity
 * IS its content, so every copy of it is the row.
 *
 * Any copy will do, because the only thing asked of the answer is where a
 * re-inserted row goes — after the row it followed locally — and two copies of
 * one row name the same place. That is the only question in this file a single
 * row can answer. Everything that turns on WHICH ancestor row a position holds
 * asks {@link matchRows} instead.
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
  if (
    index >= 0 &&
    index < list.length &&
    canonicalize(list[index]) === content
  )
    return index;
  return list.findIndex((candidate) => canonicalize(candidate) === content);
}

/**
 * Where every row of `before` ended up in `list`, as a ONE-TO-ONE map.
 *
 * `-1` for a row that is not there any more; otherwise a position, and no
 * position twice. That last part is the whole reason this is a single pass
 * over the ancestor rather than `findRow` asked once per row: a list may
 * legitimately hold the same id-less row twice — a form asking one question
 * twice, an options list with two blank rows — and an id-less row's identity IS
 * its content, so two such rows are two rows nothing tells apart. Resolved
 * independently, both would answer with the SAME candidate and one copy on each
 * side would be left over: the arrival's spare read as a row nobody had seen,
 * the local spare as a row the researcher had just added, and the merge emitted
 * both. Two rows in, three rows out.
 *
 * The cascade is `findRow`'s, spent rather than repeated:
 *
 * - a row with an id takes the candidate carrying that id, and answers `-1`
 *   when there is none — an id that has left the list says the row has;
 * - an id-less row takes the first candidate holding its content that no
 *   earlier row has claimed, so the copies are paired off in order: the first
 *   ancestor copy with the first surviving one, and so on.
 *
 * In ORDER, and never by absolute position, because this correspondence is
 * drawn twice — against the researcher's list and against the collaborator's —
 * and the merge keeps an ancestor row only where both drawings kept it. Which
 * of three identical copies each side is deemed to have deleted cannot be
 * read off either list, so the two drawings have to agree by construction:
 * pairing in order makes each side keep the FIRST copies, and the two
 * agreements then overlap as far as they possibly can. Honouring a copy's own
 * position instead lets the researcher be deemed to have dropped the first copy
 * and the collaborator the second, and the merge, taking both at their word,
 * deletes two rows where each of them deleted one.
 */
function matchRows(
  before: readonly unknown[],
  list: readonly unknown[],
): number[] {
  const matched = before.map(() => -1);
  const claimed = new Set<number>();
  const claim = (ancestor: number, candidate: number): void => {
    matched[ancestor] = candidate;
    claimed.add(candidate);
  };

  const identities = list.map((row) => rowIdentity(row));
  const contents = list.map((row) => canonicalize(row));

  const idless: number[] = [];
  before.forEach((row, ancestor) => {
    const id = rowIdentity(row);
    if (id === undefined) {
      idless.push(ancestor);
      return;
    }
    const candidate = identities.findIndex(
      (candidateId, index) => candidateId === id && !claimed.has(index),
    );
    if (candidate !== -1) claim(ancestor, candidate);
  });

  for (const ancestor of idless) {
    const content = canonicalize(before[ancestor]);
    const candidate = contents.findIndex(
      (candidateContent, index) =>
        candidateContent === content && !claimed.has(index),
    );
    if (candidate !== -1) claim(ancestor, candidate);
  }

  return matched;
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
 *
 * A row with no `id` of its own is answered by `matchRows` like any other,
 * which means its CONTENT is its identity: rewriting such a row reads as
 * removing it
 * and adding another, because from here those two edits are the same edit and
 * nothing in the document tells them apart. Matching an id-less row by
 * position instead — on the strength of the local list having kept its length,
 * as this did — was right only while the edit changed exactly one row and
 * moved none. A submit that reorders two rows and rewrites one of them is also
 * length-preserving, and there the mapping was wrong for every row at once: it
 * resurrected a row the collaborator had deleted and dropped the researcher's
 * rewrite. `FormFieldSchema.id` is optional by design — Architect started
 * minting one and the schema must tolerate a protocol that predates that — so
 * `form.fields` and `nodeConfig.form` really do hold such rows.
 */
function mergeListArrival(
  before: readonly unknown[],
  arrival: readonly unknown[],
  next: readonly unknown[],
): unknown[] {
  // Where each ancestor row ended up on each side, one row to one position.
  const localOf = matchRows(before, next);
  const remoteOf = matchRows(before, arrival);

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
    // The SAME correspondence the merge draws, so the two agree about a list
    // holding one row twice. `resolveRowIndex` refuses a row it cannot tell
    // from another, which is right when the answer decides which row an edit is
    // written INTO — a guess there writes over content nobody meant to touch —
    // but a removal only says a row goes, and removing either of two identical
    // rows leaves the same list. Refusing over it instead dropped the
    // researcher's deletion outright, and the row they deleted came back the
    // moment a collaborator touched anything else in the list.
    //
    // `-1` still refuses: the copy this command named is already gone, either
    // because the collaborator deleted it too or because they deleted the lot.
    //
    // Which copy it named is read as the LAST of them, whichever one the
    // researcher clicked, because `matchRows` pairs copies off in order and so
    // an edit that leaves one fewer copy behind has, in those terms, dropped
    // the last. Taking the click's own index instead disagreed with the merge
    // about the same list: two collaborators each deleting one of two identical
    // rows would lose both, the removal here landing on the copy the merge had
    // just decided survived.
    if (command.index >= before.length) return null;
    const content = canonicalize(before[command.index]);
    // Explicitly `number`: `before` is `unknown[]`, whose `reduce` resolves to
    // the overload that answers `unknown` unless the accumulator is named.
    const last = before.reduce<number>(
      (latest, candidate, at) =>
        canonicalize(candidate) === content ? at : latest,
      -1,
    );
    const index = matchRows(before, arrival)[last];
    if (index === undefined || index === -1) return null;
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
