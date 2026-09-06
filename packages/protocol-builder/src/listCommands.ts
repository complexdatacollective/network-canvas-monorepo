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
  matchRows,
  reseatEditedRow,
  resolveInsertIndex,
  resolveMove,
  rowIdentity,
  rowPathFor,
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
/**
 * What a document HOLDS at a path, exactly as the apply engine reads it, and
 * whether something on the way stopped the walk.
 *
 * A key a document merely inherits — `toString`, `valueOf` — is not a container
 * it has, so it is never followed: reading the inherited function would answer
 * for a place the apply engine reads as empty. `blocked` is the other reading a
 * caller needs: a segment that is PRESENT and is not a dictionary is a place
 * the apply engine throws on rather than one that is simply not there.
 */
function heldAt(
  doc: SectionDoc,
  path: readonly string[],
): Readonly<{ value: unknown; blocked: boolean }> {
  let cursor: unknown = doc;
  for (const segment of path) {
    if (cursor === undefined) return { value: undefined, blocked: false };
    if (!isDictionary(cursor)) return { value: undefined, blocked: true };
    cursor = Object.hasOwn(cursor, segment) ? cursor[segment] : undefined;
  }
  return { value: cursor, blocked: false };
}

function listAt(doc: SectionDoc, target: CommandTarget): unknown[] | null {
  const { value, blocked } = heldAt(doc, targetPath(target));
  if (blocked) return null;
  if (value === undefined) return [];
  return Array.isArray(value) ? [...value] : null;
}

/**
 * Whether a container this command would write THROUGH has been taken away.
 *
 * A `set` writes the containers on the way to its key, so replaying one whose
 * container the arrival has dropped puts that container back — holding only the
 * leaf this command carries. For an optional container with required members
 * that is not merely unwanted but invalid: a stage's skip logic needs both an
 * action and the filter it applies to, so replaying a `set` of
 * `skipLogic.action` after a collaborator switched skip logic off leaves half a
 * rule, which is a draft the researcher cannot save and neither of them asked
 * for.
 *
 * The removal wins. A write into a capability that has been switched off says
 * nothing about whether it should be on; only the switch says that, and the
 * switch has been thrown. It is the same answer the whole-list `set` gives when
 * the arrival has taken away every row it was about, and the same rule this
 * module already applies in the other direction — a container the DRAFT removed
 * goes whole, taking the leaf the arrival wrote inside it.
 *
 * A container NEITHER side had is not this: the arrival cannot have removed
 * what it never held, so a write that creates one goes through as it always
 * did. Nor is an `insertItem`, which carries a row the arrival never saw and
 * puts its container back with it.
 */
function containerRemoved(
  basis: SectionDoc,
  current: SectionDoc,
  path: readonly string[],
): boolean {
  for (let depth = 1; depth < path.length; depth += 1) {
    const ancestor = path.slice(0, depth);
    if (heldAt(basis, ancestor).value === undefined) continue;
    if (heldAt(current, ancestor).value === undefined) return true;
  }
  return false;
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
 * - a row the edit changed keeps the researcher's version of what it changed,
 *   LEAF by leaf against the row as the edit found it, so a collaborator's
 *   edit to another property of that same row stands too and the researcher
 *   wins only the leaves they decided. Both sides on one leaf is the
 *   whole-list rule said one level down: the researcher at the keyboard wins.
 *   `reseatEditedRow` is that merge, and it is the same one a list editor's
 *   own commit goes through — a `set` composed from a form's values is a
 *   revision behind whether it is being committed or replayed;
 * - a row the edit removed goes, and a row the arrival added appears;
 * - a row the edit added is put back beside the rows it was written beside —
 *   after the nearest one it followed that is still here, else in front of the
 *   nearest one it preceded.
 *
 * The arrival's order stands wherever the researcher's submit left the rows
 * where it found them: an edit about a row's CONTENTS says nothing about where
 * the rows are, so a collaborator's reorder of them survives it. A submit that
 * moved a row is the case a `set` hides. A reorder reaches the wire as a
 * `moveItem` only while it is the whole of one submit, and one that moves a row
 * and adds another — "put this question first, and ask this one too" — is a
 * `set` like any other; taking the arrival's order for it discarded the move
 * outright the moment a collaborator inserted a row before the batch was
 * acknowledged, with every row carrying an id. So when the researcher's list
 * holds the rows both sides kept in an order the ancestor did not, those rows
 * are dealt back into their own positions in the researcher's order, which
 * leaves every row the arrival added exactly where the arrival put it. Where
 * both sides reordered, the researcher's order wins, as their rewrite of a row
 * does.
 *
 * Replacing a row WHOLESALE is answered by the same two rules, and which one
 * answers is decided by whether the row has an id. A row that keeps its id has
 * had every leaf decided by the researcher, so they win every leaf and the
 * only thing of the arrival's that survives is a property they never had —
 * one the collaborator added. A row with no id was not replaced at all: it was
 * removed and another was added, and both sides' rows stand side by side.
 *
 * That is because a row with no `id` of its own is answered by `matchRows`
 * like any other, which means its CONTENT is its identity: rewriting such a
 * row reads as removing it and adding another, because from here those two
 * edits are the same edit and nothing in the document tells them apart. There
 * is no leaf merge to do for one, either — a matched id-less row is one whose
 * content BOTH sides left alone. Matching an id-less row by
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
  rowPath: readonly string[],
): unknown[] {
  // Where each ancestor row ended up on each side, one row to one position.
  //
  // Drawn TWICE — against the researcher's list and against the
  // collaborator's — and an ancestor row is kept only where both drawings kept
  // it, so the two have to agree by construction. Which of three identical
  // copies each side is deemed to have deleted cannot be read off either list;
  // pairing them off in order makes each side keep the FIRST copies, and the
  // two agreements then overlap as far as they possibly can. Honouring a
  // copy's own position instead lets the researcher be deemed to have dropped
  // the first copy and the collaborator the second, and the merge, taking both
  // at their word, deletes two rows where each of them deleted one.
  const localOf = matchRows(before, next);
  const remoteOf = matchRows(before, arrival);

  // A row of the answer, carrying WHICH of the researcher's rows it is — `-1`
  // for one only the arrival has. Two copies of an id-less row are two rows
  // nothing tells apart, but they are still at two different places, and the
  // row a re-inserted one follows is one of them and not the other.
  const merged: Readonly<{ row: unknown; local: number }>[] = [];
  // An ancestor row both sides kept: where it came from, and the place in
  // `merged` the arrival's order gave it.
  const survivors: Readonly<{
    ancestor: number;
    local: number;
    slot: number;
  }>[] = [];
  arrival.forEach((row, index) => {
    const ancestor = remoteOf.indexOf(index);
    if (ancestor === -1) {
      merged.push({ row, local: -1 });
      return;
    }
    const local = localOf[ancestor];
    if (local === undefined || local === -1) return;
    const localRow = next[local];
    survivors.push({ ancestor, local, slot: merged.length });
    merged.push({
      row:
        canonicalize(localRow) === canonicalize(before[ancestor])
          ? row
          : reseatEditedRow(before[ancestor], localRow, row, rowPath),
      local,
    });
  });

  // The researcher's own order for those rows, when their submit gave them one
  // the ancestor did not. Only the survivors move, and only among the places
  // they already occupy, so a row the arrival added keeps its own. The whole
  // entry moves, so which of the researcher's rows a place holds travels with
  // the row itself.
  const byLocal = survivors.toSorted((one, other) => one.local - other.local);
  const reordered = survivors
    .toSorted((one, other) => one.ancestor - other.ancestor)
    .some((survivor, at) => byLocal[at] !== survivor);
  if (reordered) {
    const entryOf = new Map(
      survivors.map((survivor) => [survivor, merged[survivor.slot]] as const),
    );
    survivors.forEach((survivor, at) => {
      const wanted = byLocal[at];
      const entry = wanted === undefined ? undefined : entryOf.get(wanted);
      if (entry !== undefined) merged[survivor.slot] = entry;
    });
  }

  // Where one of the researcher's rows sits in the answer, or `-1`: the same
  // row, not merely one that looks like it. Read by CONTENT, a list holding
  // that row twice answered with the first copy wherever the researcher had
  // written after the second, and a new row was put back several places from
  // where they left it.
  const slotOf = (local: number) =>
    merged.findIndex((entry) => entry.local === local);

  // Where a row the researcher added goes: after the nearest row it followed
  // that is still here, else in front of the nearest row it preceded that is.
  //
  // Its immediate neighbour is the first answer and usually the only one
  // needed, but the arrival may have deleted that row — and the rows further
  // out still say where this one belongs. Falling back to the position the
  // researcher left it at the moment the nearest neighbour was gone sent it
  // PAST rows that had survived: `[a, b, c]` submitted as `[a, x, c]` and
  // rebased onto an arrival that had deleted `a` put `x` after `c`, which is
  // the row the researcher wrote it in front of.
  //
  // A row added later in the researcher's list is not looked for on the way
  // forward, because it is not placed yet — these are dealt in order, so it
  // will anchor on THIS row when its turn comes.
  //
  // An index is what is left when no row of theirs survived at all.
  const placeFor = (index: number): number => {
    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      const slot = slotOf(earlier);
      if (slot !== -1) return slot + 1;
    }
    for (let later = index + 1; later < next.length; later += 1) {
      const slot = slotOf(later);
      if (slot !== -1) return slot;
    }
    return Math.min(index, merged.length);
  };

  next.forEach((row, index) => {
    if (localOf.includes(index)) return;
    merged.splice(placeFor(index), 0, { row, local: index });
  });

  return merged.map((entry) => entry.row);
}

/**
 * One command, re-expressed against a document whose list has moved.
 *
 * `null` refuses the command outright. That is the only right answer when the
 * row it named has left the list — applying it to whatever has moved into that
 * position would remove or reorder a row the researcher never touched — and it
 * is the answer for a rebase that leaves nothing to do as well: a command that
 * writes the list already there is no command, and a `set` of one is not even
 * inert, because it writes the containers on the way to its key.
 */
function rebaseCommand(
  basis: SectionDoc,
  current: SectionDoc,
  command: Command,
): Command | null {
  // An `unset` says what it says wherever it lands: it addresses no row, and
  // it creates no container on its way — a removal into a container that has
  // gone is a removal with nothing to remove.
  if (command.op === 'unset') return command;
  // A `set` of anything but a list addresses no row either, so it says what it
  // says wherever it lands — unless the container it would write THROUGH has
  // been taken away, which is the one thing that makes where it lands a
  // question.
  const written = command.op === 'set' ? command.value : undefined;
  if (command.op === 'set' && !Array.isArray(written)) {
    return containerRemoved(basis, current, targetPath(command.key))
      ? null
      : command;
  }

  const before = listAt(basis, command.key);
  const arrival = listAt(current, command.key);
  if (before === null || arrival === null) return command;
  // Nothing moved under this command, so it means exactly what it meant — and
  // the command object itself is kept, so a batch that needs no rebasing stays
  // byte-identical on the wire and in the command log.
  if (canonicalize(before) === canonicalize(arrival)) return command;

  if (command.op === 'set') {
    if (!Array.isArray(written)) return command;
    const value = mergeListArrival(
      before,
      arrival,
      written,
      rowPathFor(command.key),
    );
    // A merge that answers with the list already there is a command with
    // nothing left to say, and saying it anyway is not free: a `set` WRITES
    // the containers on the way to its key, so replaying one whose rows the
    // arrival has all taken away put the container itself back. A collaborator
    // switching the introduction screen off while the researcher rewrites its
    // only block left `{ introScreen: { items: [] } }` — the screen back on,
    // empty, and neither of them having asked for that.
    //
    // Refusing it is the same answer `removeItem` gives when the row it named
    // has gone, and `rebasePending` drops a batch these leave empty along with
    // its undo entry. Rows of the researcher's that survive the merge are
    // written as they always were, container and all: a row the arrival never
    // saw is one their edit said nothing about, which is why an `insertItem`
    // into a dropped container puts the container back too.
    if (canonicalize(value) === canonicalize(arrival)) return null;
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
    // The command names one OCCURRENCE — the k-th copy — and that is what it
    // is rebased onto: the position `matchRows` paired that same copy with.
    // Rebasing it onto the last copy instead put the removal on the wrong side
    // of whatever sits between them: deleting the first of `[a, b, a]` left
    // `[a, b]`, when the row the researcher kept was the one after `b`.
    //
    // Whether the removal still applies at all is a question about the copies
    // as a GROUP, and is asked of the last of them, because `matchRows` pairs
    // copies off in order: an arrival holding one fewer copy leaves that last
    // one unmatched. Refusing there is what keeps two collaborators who each
    // delete one of two identical rows from losing both — the arrival has
    // already dropped a copy, and this command would drop the copy the merge
    // has just decided survived. Asking it of the named copy instead would say
    // yes for every copy but the last.
    if (command.index >= before.length) return null;
    const content = canonicalize(before[command.index]);
    // Explicitly `number`: `before` is `unknown[]`, whose `reduce` resolves to
    // the overload that answers `unknown` unless the accumulator is named.
    const last = before.reduce<number>(
      (latest, candidate, at) =>
        canonicalize(candidate) === content ? at : latest,
      -1,
    );
    const matched = matchRows(before, arrival);
    if (matched[last] === undefined || matched[last] === -1) return null;
    const index = matched[command.index];
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
