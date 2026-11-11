/**
 * The review service's paths: RFC 6901 JSON Pointers in which a segment that
 * addresses a member of an array is that member's `id` whenever the members
 * have ids, and an index only where they have none (see `FixOperation` in
 * `@codaco/protocol-review-worker/contract`).
 *
 * Pure: nothing here changes the value it is handed.
 */

export type JsonObject = { [key: string]: unknown };

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Segments that would reach an object's prototype rather than its own data.
 * A protocol never holds them as keys (validation refuses `__proto__` ids), so
 * a path that names one is refused outright.
 */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/** The segments of `path`, unescaped, or null when it is not a pointer. */
export const parsePath = (path: string): string[] | null => {
  if (!path.startsWith('/')) return null;
  const segments = path
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  // `~` followed by anything but 0 or 1 is not a valid escape.
  if (
    path
      .slice(1)
      .split('/')
      .some((raw) => /~(?![01])/u.test(raw))
  ) {
    return null;
  }
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return null;
  return segments;
};

const escapeSegment = (segment: string) =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

export const formatPath = (segments: readonly string[]): string =>
  segments.map((segment) => `/${escapeSegment(segment)}`).join('');

const hasStringId = (value: unknown): value is JsonObject & { id: string } =>
  isJsonObject(value) && typeof value.id === 'string';

/**
 * Whether an array's members are addressed by id: every member is an object
 * with a string id. An empty array has no members to address either way.
 */
export const isIdArray = (array: readonly unknown[]): boolean =>
  array.length > 0 && array.every(hasStringId);

const INDEX_PATTERN = /^(0|[1-9]\d*)$/u;

/**
 * The position of the member `segment` names, or -1: a member whose `id` it
 * is first, and only then a member at that index. Some arrays (a form's
 * `fields`) mix members with and without ids, so both forms are needed.
 */
export const findArrayMember = (
  array: readonly unknown[],
  segment: string,
): number => {
  const byId = array.findIndex(
    (member) => hasStringId(member) && member.id === segment,
  );
  if (byId !== -1) return byId;
  if (!INDEX_PATTERN.test(segment)) return -1;
  const index = Number(segment);
  return index < array.length ? index : -1;
};

/** The segment that addresses the member at `index`: its id, or the index. */
export const memberSegment = (array: readonly unknown[], index: number) => {
  const member = array[index];
  return hasStringId(member) ? member.id : String(index);
};

/**
 * Whether `container` holds `key` as data. A key holding `undefined` counts as
 * absent: removing a top-level key through the protocol's merge-style update
 * leaves it there as `undefined`.
 */
export const hasOwnValue = (container: JsonObject, key: string) =>
  Object.hasOwn(container, key) && container[key] !== undefined;

/** The value the segments lead to, or `{ found: false }`. */
export const readPath = (
  root: unknown,
  segments: readonly string[],
): { found: true; value: unknown } | { found: false } => {
  let node: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(node)) {
      const index = findArrayMember(node, segment);
      if (index === -1) return { found: false };
      node = node[index];
    } else if (isJsonObject(node)) {
      if (!hasOwnValue(node, segment)) return { found: false };
      node = node[segment];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: node };
};

/** Returned by `updatePath` when a segment on the way does not resolve. */
export const UNRESOLVED: unique symbol = Symbol('unresolved');

/**
 * `root` with the value at `segments` replaced by what `update` returns for
 * it. Every container on the way is copied; nothing else is. `update` may
 * itself answer `UNRESOLVED` to refuse.
 */
export const updatePath = (
  root: unknown,
  segments: readonly string[],
  update: (value: unknown) => unknown,
): unknown => {
  const [head, ...rest] = segments;
  if (head === undefined) return update(root);
  if (Array.isArray(root)) {
    const index = findArrayMember(root, head);
    if (index === -1) return UNRESOLVED;
    const next = updatePath(root[index], rest, update);
    if (next === UNRESOLVED) return UNRESOLVED;
    return root.map((member, position) => (position === index ? next : member));
  }
  if (isJsonObject(root)) {
    if (!hasOwnValue(root, head)) return UNRESOLVED;
    const next = updatePath(root[head], rest, update);
    if (next === UNRESOLVED) return UNRESOLVED;
    return { ...root, [head]: next };
  }
  return UNRESOLVED;
};
