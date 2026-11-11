import { isEqual } from 'es-toolkit';

import type { FixOperation } from '@codaco/protocol-review-worker/contract';

import {
  findArrayMember,
  formatPath,
  hasOwnValue,
  isIdArray,
  isJsonObject,
  type JsonObject,
  memberSegment,
  parsePath,
  readPath,
  UNRESOLVED,
  updatePath,
} from './fixPath';

/**
 * Applies a review's fix — a list of `FixOperation`s — to a protocol, without
 * changing it. Every edit was written by a language model, so nothing here
 * trusts one: an edit that does not fit the document fails with a reason
 * rather than throwing, and the caller validates whatever comes out.
 */

/**
 * An operation as Architect keeps it. `keyIndex` is used only by the inverse
 * of a removed object key: where the key stood, so that undoing puts it back
 * in its place rather than last (codebook variables are shown in key order).
 */
export type StoredOperation = FixOperation & { keyIndex?: number };

export type FixFailureKind =
  /** Not a pointer, or one that would rewrite an id the path addresses by. */
  | 'bad_path'
  /** A segment does not resolve in the document. */
  | 'path_not_found'
  /** `value` is missing, is not JSON, or is a member an id-array cannot hold. */
  | 'bad_value'
  /** The path leads into something that is not an object or array. */
  | 'wrong_container'
  /** An inserted or replaced member's id is already taken in its array. */
  | 'duplicate_id'
  /**
   * The edit applies, but a member it leaves has no path back to it: it has
   * no id, and its index is another member's id. Without one there is no
   * inverse, so the edit is refused rather than made irreversible.
   */
  | 'ambiguous_path'
  /**
   * Working with the edit failed outright: a value nested too deeply to
   * walk, for one. Model-written content can be anything, so whatever goes
   * wrong is a failure of the edit, never an exception.
   */
  | 'unworkable';

export type FixFailure = { kind: FixFailureKind; operation: number };

/**
 * What the document held at an operation's target just before it applied: for
 * `set`, whether the key was there and its value; for `remove`, the value it
 * removed. An `insert` that applies has already shown that its array and anchor
 * exist and that its id is free, so it records nothing more.
 */
export type TargetSnapshot =
  | { op: 'set'; present: boolean; value: unknown }
  | { op: 'remove'; value: unknown }
  | { op: 'insert' };

export type ApplyResult =
  | {
      ok: true;
      result: unknown;
      /** Applied in order to `result`, these give back the original. */
      inverse: StoredOperation[];
      /** One per operation, in order. */
      targets: TargetSnapshot[];
      /**
       * One per operation, in order: where its change can be read just after
       * it applied (an inserted member under its id, or its index).
       */
      placed: string[];
    }
  | { ok: false; failure: FixFailure };

type StepResult =
  | {
      ok: true;
      root: unknown;
      inverse: StoredOperation;
      target: TargetSnapshot;
      placed: string;
    }
  | { ok: false; kind: FixFailureKind };

const fail = (kind: FixFailureKind): StepResult => ({ ok: false, kind });

const parseValue = (
  value: string | null,
): { ok: true; value: unknown } | { ok: false } => {
  if (value === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false };
  }
};

const hasStringId = (value: unknown): value is JsonObject & { id: string } =>
  isJsonObject(value) && typeof value.id === 'string';

/** Structural equality that answers false where comparing fails outright. */
const safeIsEqual = (a: unknown, b: unknown): boolean => {
  try {
    return isEqual(a, b);
  } catch {
    return false;
  }
};

/** `object` with `key` set to `value`, at `keyIndex` when it is new. */
const withKey = (
  object: JsonObject,
  key: string,
  value: unknown,
  keyIndex: number | undefined,
): JsonObject => {
  if (hasOwnValue(object, key) || keyIndex === undefined) {
    return { ...object, [key]: value };
  }
  const entries = Object.entries(object).filter(([k]) => k !== key);
  entries.splice(Math.min(keyIndex, entries.length), 0, [key, value]);
  return Object.fromEntries(entries);
};

const withoutKey = (object: JsonObject, key: string): JsonObject =>
  Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

/**
 * Whether `parentSegments` lead to a member of an id-array: the object whose
 * `id` the path itself is spelled with, so an edit to that `id` would leave
 * every later path (and the inverse) pointing at nothing.
 */
const isAddressedById = (
  root: unknown,
  parentSegments: readonly string[],
): boolean => {
  if (parentSegments.length === 0) return false;
  const container = readPath(root, parentSegments.slice(0, -1));
  const member = readPath(root, parentSegments);
  return (
    container.found &&
    Array.isArray(container.value) &&
    member.found &&
    hasStringId(member.value) &&
    member.value.id === parentSegments.at(-1)
  );
};

/** The segment that leads back to `array[index]`, or null when none does. */
const segmentBackTo = (array: readonly unknown[], index: number) => {
  const segment = memberSegment(array, index);
  return findArrayMember(array, segment) === index ? segment : null;
};

const replaceParent = (
  root: unknown,
  parentSegments: readonly string[],
  parent: unknown,
): unknown => updatePath(root, parentSegments, () => parent);

const applyStep = (root: unknown, operation: StoredOperation): StepResult => {
  const segments = parsePath(operation.path);
  if (segments === null) return fail('bad_path');
  const parentSegments = segments.slice(0, -1);
  const last = segments.at(-1);
  if (last === undefined) return fail('bad_path');
  const parentRead = readPath(root, parentSegments);
  if (!parentRead.found) return fail('path_not_found');
  const parent = parentRead.value;
  const pathOf = (segment: string) => formatPath([...parentSegments, segment]);

  if (operation.op === 'insert') {
    if (!Array.isArray(parent)) return fail('wrong_container');
    const position =
      last === '-' ? parent.length : findArrayMember(parent, last);
    if (position === -1) return fail('path_not_found');
    const parsed = parseValue(operation.value);
    if (!parsed.ok) return fail('bad_value');
    const member = parsed.value;
    if (isIdArray(parent) && !hasStringId(member)) return fail('bad_value');
    if (
      hasStringId(member) &&
      parent.some((m) => hasStringId(m) && m.id === member.id)
    ) {
      return fail('duplicate_id');
    }
    const next = parent.toSpliced(position, 0, member);
    const back = segmentBackTo(next, position);
    if (back === null) return fail('ambiguous_path');
    const nextRoot = replaceParent(root, parentSegments, next);
    if (nextRoot === UNRESOLVED) return fail('path_not_found');
    return {
      ok: true,
      root: nextRoot,
      inverse: {
        op: 'remove',
        path: pathOf(back),
        value: null,
      },
      target: { op: 'insert' },
      placed: pathOf(back),
    };
  }

  if (last === 'id' && isAddressedById(root, parentSegments)) {
    return fail('bad_path');
  }

  if (operation.op === 'set') {
    const parsed = parseValue(operation.value);
    if (!parsed.ok) return fail('bad_value');
    const value = parsed.value;
    if (Array.isArray(parent)) {
      const index = findArrayMember(parent, last);
      if (index === -1) return fail('path_not_found');
      if (isIdArray(parent) && !hasStringId(value)) return fail('bad_value');
      if (
        hasStringId(value) &&
        parent.some(
          (m, position) =>
            position !== index && hasStringId(m) && m.id === value.id,
        )
      ) {
        return fail('duplicate_id');
      }
      const old: unknown = parent[index];
      const next = parent.map((m, position) =>
        position === index ? value : m,
      );
      const back = segmentBackTo(next, index);
      if (back === null) return fail('ambiguous_path');
      const nextRoot = replaceParent(root, parentSegments, next);
      if (nextRoot === UNRESOLVED) return fail('path_not_found');
      return {
        ok: true,
        root: nextRoot,
        inverse: {
          op: 'set',
          path: pathOf(back),
          value: JSON.stringify(old),
        },
        target: { op: 'set', present: true, value: old },
        placed: pathOf(back),
      };
    }
    if (!isJsonObject(parent)) return fail('wrong_container');
    const present = hasOwnValue(parent, last);
    const old = present ? parent[last] : undefined;
    const next = withKey(parent, last, value, operation.keyIndex);
    const nextRoot =
      parentSegments.length === 0
        ? next
        : replaceParent(root, parentSegments, next);
    if (nextRoot === UNRESOLVED) return fail('path_not_found');
    return {
      ok: true,
      root: nextRoot,
      inverse: present
        ? { op: 'set', path: operation.path, value: JSON.stringify(old) }
        : { op: 'remove', path: operation.path, value: null },
      target: present
        ? { op: 'set', present: true, value: old }
        : { op: 'set', present: false, value: null },
      placed: operation.path,
    };
  }

  // remove
  if (Array.isArray(parent)) {
    const index = findArrayMember(parent, last);
    if (index === -1) return fail('path_not_found');
    const old: unknown = parent[index];
    const next = parent.toSpliced(index, 1);
    const nextRoot = replaceParent(root, parentSegments, next);
    if (nextRoot === UNRESOLVED) return fail('path_not_found');
    const anchor = index < next.length ? segmentBackTo(next, index) : '-';
    if (anchor === null) return fail('ambiguous_path');
    return {
      ok: true,
      root: nextRoot,
      inverse: {
        op: 'insert',
        path: pathOf(anchor),
        value: JSON.stringify(old),
      },
      target: { op: 'remove', value: old },
      placed: operation.path,
    };
  }
  if (!isJsonObject(parent)) return fail('wrong_container');
  if (!hasOwnValue(parent, last)) return fail('path_not_found');
  const old = parent[last];
  const next = withoutKey(parent, last);
  const nextRoot =
    parentSegments.length === 0
      ? next
      : replaceParent(root, parentSegments, next);
  if (nextRoot === UNRESOLVED) return fail('path_not_found');
  return {
    ok: true,
    root: nextRoot,
    inverse: {
      op: 'set',
      path: operation.path,
      value: JSON.stringify(old),
      keyIndex: Object.keys(parent).indexOf(last),
    },
    target: { op: 'remove', value: old },
    placed: operation.path,
  };
};

/**
 * `root` with every operation applied in order, the operations that undo
 * them, and what each target held before it applied. `root` is not changed.
 */
export const applyOperations = (
  root: unknown,
  operations: readonly StoredOperation[],
): ApplyResult => {
  let current = root;
  const inverse: StoredOperation[] = [];
  const targets: TargetSnapshot[] = [];
  const placed: string[] = [];
  for (const [index, operation] of operations.entries()) {
    let step: StepResult;
    try {
      step = applyStep(current, operation);
    } catch {
      step = fail('unworkable');
    }
    if (!step.ok) {
      return { ok: false, failure: { kind: step.kind, operation: index } };
    }
    current = step.root;
    inverse.unshift(step.inverse);
    targets.push(step.target);
    placed.push(step.placed);
  }
  return { ok: true, result: current, inverse, targets, placed };
};

/**
 * Whether a fix still fits `root`: every operation applies, and each target
 * holds what it held in the protocol that was reviewed (`recorded`). Any
 * difference means the researcher has changed that place since.
 */
export const fixFits = (
  root: unknown,
  operations: readonly StoredOperation[],
  recorded: readonly TargetSnapshot[],
): boolean => {
  if (operations.length === 0) return false;
  const applied = applyOperations(root, operations);
  return applied.ok && safeIsEqual(applied.targets, recorded);
};

/**
 * What one place in the protocol held just after a fix was applied: the
 * value at `path`, or its absence. Together they are everything the fix
 * wrote, normalisation included (see `editProtocol`).
 */
export type WrittenSnapshot = {
  path: string;
  present: boolean;
  value: unknown;
};

/** What `root` holds at `path`, as a snapshot. */
export const snapshotAt = (root: unknown, path: string): WrittenSnapshot => {
  const segments = parsePath(path);
  const read =
    segments === null ? { found: false as const } : readPath(root, segments);
  return read.found
    ? { path, present: true, value: read.value }
    : { path, present: false, value: null };
};

/**
 * Whether everything a fix wrote is still as the fix left it. Only then does
 * an applied fix count as holding, and only then may its inverse be applied:
 * an inverse applied over the researcher's later edits would take them too.
 */
export const writtenHolds = (
  root: unknown,
  written: readonly WrittenSnapshot[],
): boolean => {
  if (written.length === 0) return false;
  try {
    return written.every((snapshot) =>
      isEqual(snapshotAt(root, snapshot.path), snapshot),
    );
  } catch {
    return false;
  }
};
