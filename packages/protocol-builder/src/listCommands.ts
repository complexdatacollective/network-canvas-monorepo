import {
  canonicalize,
  type Command,
  type CommandTarget,
  type SectionDoc,
} from '@codaco/studio-sync/apply';

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
