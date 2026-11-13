import { isEqual } from 'es-toolkit';

import type { FixOperation } from '@codaco/protocol-review-worker/contract';

import {
  findArrayMember,
  formatPath,
  hasOwnValue,
  isAddressedByIds,
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
       * Where everything the operations wrote can be read in `result`: paths
       * made only of object keys and member ids, which name the same place
       * whatever else the operations moved (see `writeLocations`).
       */
      anchors: string[];
    }
  | { ok: false; failure: FixFailure };

type StepResult =
  | {
      ok: true;
      root: unknown;
      inverse: StoredOperation;
      target: TargetSnapshot;
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

/**
 * A value in the form the protocol is stored and validated in, where a key
 * holding `undefined` is no key at all. (The store's merge-style update
 * leaves a removed top-level key as `undefined`; JSON, IndexedDB's copy and
 * validation all read it as absent.) Every comparison in the engine goes
 * through `sameStored`, so the two can never be told apart.
 */
const storedForm = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(storedForm);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .map(([key, member]) => [key, storedForm(member)]),
  );
};

/**
 * Whether two values are the same as stored. False where comparing fails
 * outright (a value nested too deep to walk), never an exception.
 */
const sameStored = (a: unknown, b: unknown): boolean => {
  try {
    return isEqual(storedForm(a), storedForm(b));
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
  };
};

/**
 * The part of `segments` that names one place however members of arrays
 * move: object keys and member ids, up to (and stopping at) the first array
 * whose members have no ids — the array itself, then, since a position in it
 * is not an identity.
 */
const stableLocation = (
  root: unknown,
  segments: readonly string[],
): string[] => {
  let node: unknown = root;
  const location: string[] = [];
  for (const segment of segments) {
    if (Array.isArray(node) && !isAddressedByIds(node)) return location;
    location.push(segment);
    const read = readPath(node, [segment]);
    node = read.found ? read.value : undefined;
  }
  return location;
};

/**
 * Where what `operation` writes to `root` can be read once the whole fix has
 * applied. Each location is made of object keys and member ids only, so later
 * operations of the same fix — inserting before it, removing beside it —
 * cannot move what it names; a write into an array without ids is located by
 * the whole array. A member placed by id is located by its id.
 */
const writeLocations = (
  root: unknown,
  operation: StoredOperation,
): string[][] => {
  const segments = parsePath(operation.path);
  if (segments === null) return [];
  const parentSegments = segments.slice(0, -1);
  const parentLocation = stableLocation(root, parentSegments);
  const parentIsStable = parentLocation.length === parentSegments.length;
  const parent = readPath(root, parentSegments);
  const parsed = parseValue(operation.value);
  const placesMember =
    operation.op !== 'remove' &&
    parentIsStable &&
    parent.found &&
    Array.isArray(parent.value) &&
    parsed.ok &&
    hasStringId(parsed.value);
  const member =
    placesMember && parsed.ok && hasStringId(parsed.value)
      ? [[...parentLocation, parsed.value.id]]
      : [];
  if (operation.op === 'insert') {
    return member.length > 0 ? member : [parentLocation];
  }
  return [stableLocation(root, segments), ...member];
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
  const anchors = new Set<string>();
  for (const [index, operation] of operations.entries()) {
    let step: StepResult;
    try {
      for (const location of writeLocations(current, operation)) {
        anchors.add(formatPath(location));
      }
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
  }
  return { ok: true, result: current, inverse, targets, anchors: [...anchors] };
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
  return applied.ok && sameStored(applied.targets, recorded);
};

const operationInEffect = (
  root: unknown,
  operation: StoredOperation,
): boolean => {
  const segments = parsePath(operation.path);
  if (segments === null) return false;
  if (operation.op === 'remove') return !readPath(root, segments).found;
  const parsed = parseValue(operation.value);
  if (!parsed.ok) return false;
  const target =
    operation.op === 'set'
      ? readPath(root, segments)
      : hasStringId(parsed.value)
        ? readPath(root, [...segments.slice(0, -1), parsed.value.id])
        : { found: false as const };
  return target.found && sameStored(target.value, parsed.value);
};

export const fixInEffect = (
  root: unknown,
  operations: readonly StoredOperation[],
): boolean => {
  if (operations.length === 0) return false;
  try {
    return operations.every((operation) => operationInEffect(root, operation));
  } catch {
    return false;
  }
};

/**
 * What one place in the protocol held just after a fix was applied: the
 * value at `path`, or its absence. Together they are everything the fix
 * wrote, normalisation included (see `editProtocol`).
 */
type ValueSnapshot = {
  path: string;
  present: boolean;
  value: unknown;
};

/**
 * Where a fix left a member of an array that it moved past others: the
 * members it went past, by id, as those that now stand `before` it and
 * `after` it. A member's value does not say where it stands, so a move is
 * written in the order alone and is recorded here. Members the move did not
 * pass are left out: where they stand says nothing about it.
 */
type PlacementSnapshot = {
  path: string;
  before: string[];
  after: string[];
};

export type WrittenSnapshot = ValueSnapshot | PlacementSnapshot;

/** What `root` holds at `path`, as a snapshot. */
const snapshotAt = (root: unknown, path: string): ValueSnapshot => {
  const segments = parsePath(path);
  const read =
    segments === null ? { found: false as const } : readPath(root, segments);
  return read.found
    ? { path, present: true, value: read.value }
    : { path, present: false, value: null };
};

/**
 * The ids of the array `path`'s member stands in, in order (null for a
 * member without one), and the member's position among them; null when
 * `path` names no member of an array by its id.
 */
const siblingsAt = (
  root: unknown,
  path: string,
): { ids: (string | null)[]; at: number } | null => {
  const segments = parsePath(path);
  const id = segments?.at(-1);
  if (!segments || id === undefined) return null;
  const parent = readPath(root, segments.slice(0, -1));
  if (!parent.found || !Array.isArray(parent.value)) return null;
  const ids = parent.value.map((member: unknown) =>
    hasStringId(member) ? member.id : null,
  );
  const at = ids.indexOf(id);
  return at === -1 ? null : { ids, at };
};

/**
 * Where the member at `path` stands in `after` against the members it has
 * passed since `before`; null when it is not in the same array in both, or
 * has passed none.
 */
const placementAt = (
  before: unknown,
  after: unknown,
  path: string,
): PlacementSnapshot | null => {
  const was = siblingsAt(before, path);
  const now = siblingsAt(after, path);
  if (was === null || now === null) return null;
  const passed = (from: number, to: number, side: (index: number) => boolean) =>
    now.ids.slice(from, to).filter((id): id is string => {
      const index = id === null ? -1 : was.ids.indexOf(id);
      return index !== -1 && side(index);
    });
  const placement = {
    path,
    before: passed(0, now.at, (index) => index > was.at),
    after: passed(now.at + 1, now.ids.length, (index) => index < was.at),
  };
  return placement.before.length + placement.after.length > 0
    ? placement
    : null;
};

/** Whether each member `placement` names that is still there is on its side. */
const placementHolds = (root: unknown, placement: PlacementSnapshot) => {
  const now = siblingsAt(root, placement.path);
  if (now === null) return false;
  const stands = (id: string, side: (index: number) => boolean) => {
    const index = now.ids.indexOf(id);
    return index === -1 || side(index);
  };
  return (
    placement.before.every((id) => stands(id, (index) => index < now.at)) &&
    placement.after.every((id) => stands(id, (index) => index > now.at))
  );
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
      'before' in snapshot
        ? placementHolds(root, snapshot)
        : sameStored(snapshotAt(root, snapshot.path), snapshot),
    );
  } catch {
    return false;
  }
};

export type FixPlan =
  | {
      ok: true;
      /** The fixed document, as `normalize` leaves it. */
      result: unknown;
      /** Applied to `result`, these give back the document planned from. */
      inverse: StoredOperation[];
      /** Everything the fix wrote, as `result` holds it (see `writtenHolds`). */
      written: WrittenSnapshot[];
    }
  | { ok: false; reason: 'changed' | 'invalid' };

const topLevel = (key: string) => formatPath([key]);

const isUnderKey = (path: string, key: string) =>
  path === topLevel(key) || path.startsWith(`${topLevel(key)}/`);

/**
 * A fix planned against `root`: applied, passed through `normalize` (what
 * the store does to every document it is given), and paired with what
 * undoes it and what it wrote. Two things hold for any sequence of
 * operations, or the plan is refused:
 *
 * - its inverse, applied to the result and normalised again, gives back
 *   `root` as stored (`sameStored`) — so it also puts back, whole, every
 *   top-level key normalisation changed;
 * - `written` names every place the fix wrote by key and id only, read from
 *   the final result, so any later change to any of it is seen — and, for a
 *   member the fix moved within its array, the order it was moved into.
 *
 * Never throws.
 */
export const planFix = (
  root: unknown,
  operations: readonly StoredOperation[],
  normalize: (raw: unknown) => unknown,
): FixPlan => {
  const applied = applyOperations(root, operations);
  if (!applied.ok) return { ok: false, reason: 'changed' };
  try {
    const raw = applied.result;
    const normalized = normalize(raw);
    if (
      !isJsonObject(root) ||
      !isJsonObject(raw) ||
      !isJsonObject(normalized)
    ) {
      return { ok: false, reason: 'invalid' };
    }
    const keys = [
      ...new Set([...Object.keys(raw), ...Object.keys(normalized)]),
    ].filter((key) => !sameStored(raw[key], normalized[key]));
    const inverse: StoredOperation[] = [
      ...applied.inverse.filter(
        (operation) => !keys.some((key) => isUnderKey(operation.path, key)),
      ),
      ...keys.map((key): StoredOperation =>
        hasOwnValue(root, key)
          ? {
              op: 'set',
              path: topLevel(key),
              value: JSON.stringify(root[key]),
              keyIndex: Object.keys(root).indexOf(key),
            }
          : { op: 'remove', path: topLevel(key), value: null },
      ),
    ];
    const undone = applyOperations(normalized, inverse);
    if (!undone.ok || !sameStored(normalize(undone.result), root)) {
      return { ok: false, reason: 'invalid' };
    }
    const paths = [...new Set([...applied.anchors, ...keys.map(topLevel)])];
    const written: WrittenSnapshot[] = [
      ...paths.map((path) => snapshotAt(normalized, path)),
      ...paths
        .map((path) => placementAt(root, normalized, path))
        .filter((placement) => placement !== null),
    ];
    return { ok: true, result: normalized, inverse, written };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
};
