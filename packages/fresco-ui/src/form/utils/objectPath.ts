export type ObjectPathSegment = string | number;
export type ObjectPath = ObjectPathSegment[];

const unsafePropertyNames = new Set(['__proto__', 'constructor', 'prototype']);

const isSafeSegment = (segment: ObjectPathSegment): boolean =>
  typeof segment === 'number'
    ? Number.isSafeInteger(segment) && segment >= 0
    : !unsafePropertyNames.has(segment);

const readOwnProperty = (container: object, key: PropertyKey): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};

const isPrototypeObject = (value: object): boolean => {
  const constructor = readOwnProperty(value, 'constructor');
  if (typeof constructor !== 'function') return false;

  return readOwnProperty(constructor, 'prototype') === value;
};

const writeOwnProperty = (
  container: object,
  key: PropertyKey,
  value: unknown,
): void => {
  const existingDescriptor = Object.getOwnPropertyDescriptor(container, key);
  if (Array.isArray(container) && key === 'length' && existingDescriptor) {
    Object.defineProperty(container, key, {
      ...existingDescriptor,
      value,
    });
    return;
  }

  Object.defineProperty(container, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

const createDictionary = (): Record<string, unknown> => ({});

const isDictionary = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cloneArray = (existing: unknown[]): unknown[] => {
  const clone: unknown[] = [];
  clone.length = existing.length;

  for (let index = 0; index < existing.length; index += 1) {
    if (!Object.hasOwn(existing, index)) continue;
    writeOwnProperty(clone, index, readOwnProperty(existing, index));
  }

  return clone;
};

const cloneDictionary = (existing: object): Record<string, unknown> => {
  const clone = createDictionary();

  for (const key of Object.keys(existing)) {
    writeOwnProperty(clone, key, readOwnProperty(existing, key));
  }

  return clone;
};

export function parseLegacyObjectPath(path: string): ObjectPath | null {
  const segments: ObjectPath = [];

  for (const part of path.split('.')) {
    const bracketMatch = /^([^[]*)\[(\d+)\]$/.exec(part);
    const key = bracketMatch?.[1];
    const encodedIndex = bracketMatch?.[2];

    if (key === undefined || encodedIndex === undefined) {
      segments.push(part);
      continue;
    }

    segments.push(key, Number(encodedIndex));
  }

  return isSafeObjectPath(segments) ? segments : null;
}

const writableContainer = (
  existing: unknown,
  createArray: boolean,
  ownedContainers?: WeakSet<object>,
): Record<string, unknown> | unknown[] => {
  if (Array.isArray(existing)) {
    if (ownedContainers?.has(existing)) return existing;
    const clone = cloneArray(existing);
    ownedContainers?.add(clone);
    return clone;
  }
  if (createArray) {
    const created: unknown[] = [];
    ownedContainers?.add(created);
    return created;
  }

  if (isDictionary(existing)) {
    if (ownedContainers?.has(existing)) return existing;
    const clone = cloneDictionary(existing);
    ownedContainers?.add(clone);
    return clone;
  }

  const created = createDictionary();
  ownedContainers?.add(created);
  return created;
};

const readQuotedSegment = (
  path: string,
  start: number,
): { segment: string; nextIndex: number } | null => {
  let index = start + 2;
  let escaped = false;

  while (index < path.length) {
    const character = path[index];

    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '"') {
      if (path[index + 1] !== ']') return null;

      const encoded = path.slice(start + 1, index + 1);
      let parsed: unknown;
      try {
        parsed = JSON.parse(encoded);
      } catch {
        return null;
      }

      return typeof parsed === 'string'
        ? { segment: parsed, nextIndex: index + 2 }
        : null;
    }

    index += 1;
  }

  return null;
};

/**
 * Parse a structural dot/bracket path. Quoted bracket segments are supported
 * so an opaque key can be formatted without becoming structural.
 */
export function parseObjectPath(path: string): ObjectPath | null {
  if (path === '') return [];

  const segments: ObjectPathSegment[] = [];
  let index = 0;
  let expectSegment = true;

  while (index < path.length) {
    const character = path[index];

    if (character === '.') {
      if (expectSegment) segments.push('');
      expectSegment = true;
      index += 1;
      continue;
    }

    if (character === '[') {
      if (path[index + 1] === '"') {
        const quoted = readQuotedSegment(path, index);
        if (!quoted) {
          return parseLegacyObjectPath(path);
        }
        segments.push(quoted.segment);
        index = quoted.nextIndex;
      } else {
        const closeIndex = path.indexOf(']', index + 1);
        if (closeIndex === -1) {
          return parseLegacyObjectPath(path);
        }
        const encodedIndex = path.slice(index + 1, closeIndex);
        if (!/^\d+$/.test(encodedIndex)) {
          return parseLegacyObjectPath(path);
        }
        segments.push(Number(encodedIndex));
        index = closeIndex + 1;
      }
      expectSegment = false;
      continue;
    }

    if (!expectSegment) {
      return parseLegacyObjectPath(path);
    }

    const segmentStart = index;
    while (index < path.length && path[index] !== '.' && path[index] !== '[') {
      index += 1;
    }
    segments.push(path.slice(segmentStart, index));
    expectSegment = false;
  }

  if (expectSegment) segments.push('');
  return isSafeObjectPath(segments) ? segments : null;
}

export function isSafeObjectPath(path: ObjectPath): boolean {
  return path.every(
    (segment, index) =>
      isSafeSegment(segment) ||
      (typeof segment === 'string' &&
        unsafePropertyNames.has(segment) &&
        typeof path[index + 1] === 'number') ||
      (index === path.length - 1 &&
        typeof segment === 'string' &&
        unsafePropertyNames.has(segment)),
  );
}

export function isSafeContainerPath(path: ObjectPath): boolean {
  return path.every(
    (segment, index) =>
      isSafeSegment(segment) ||
      (typeof segment === 'string' &&
        unsafePropertyNames.has(segment) &&
        typeof path[index + 1] === 'number'),
  );
}

export function formatObjectPath(path: ObjectPath): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') return `${formatted}[${String(segment)}]`;

    if (/^[a-zA-Z0-9_:-]+$/.test(segment)) {
      return formatted ? `${formatted}.${segment}` : segment;
    }

    return `${formatted}[${JSON.stringify(segment)}]`;
  }, '');
}

const resolveObjectPath = (path: string | ObjectPath): ObjectPath | null =>
  typeof path === 'string'
    ? parseObjectPath(path)
    : isSafeObjectPath(path)
      ? path
      : null;

/**
 * Gets a value at a structural path without traversing inherited properties.
 */
export function getValue(
  obj: Record<string, unknown>,
  path: string | ObjectPath,
): unknown {
  const segments = resolveObjectPath(path);
  if (!segments) return undefined;
  if (segments.length === 0) return obj;

  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.hasOwn(current, segment)) return undefined;
    current = readOwnProperty(current, segment);
  }

  return current;
}

/**
 * Sets a value at a structural path. Unsafe paths are ignored, inherited
 * properties are never read, and traversed containers are copied before use.
 */
const setValueWithOwnedContainers = (
  obj: Record<string, unknown>,
  path: string | ObjectPath,
  value: unknown,
  ownedContainers?: WeakSet<object>,
): void => {
  if (isPrototypeObject(obj)) return;

  const segments = resolveObjectPath(path);
  if (!segments) return;

  if (segments.length === 0) {
    writeOwnProperty(obj, '', value);
    return;
  }

  let current: Record<string, unknown> | unknown[] = obj;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) return;

    const isLast = index === segments.length - 1;
    if (isLast) {
      writeOwnProperty(current, segment, value);
      return;
    }

    const existing = Object.hasOwn(current, segment)
      ? readOwnProperty(current, segment)
      : undefined;
    const nextSegment = segments[index + 1];
    const nextContainer = writableContainer(
      existing,
      typeof nextSegment === 'number',
      ownedContainers,
    );
    writeOwnProperty(current, segment, nextContainer);
    current = nextContainer;
  }
};

export function setValue(
  obj: Record<string, unknown>,
  path: string | ObjectPath,
  value: unknown,
): void {
  setValueWithOwnedContainers(obj, path, value);
}

const omitDictionaryKey = (
  existing: object,
  key: ObjectPathSegment,
): Record<string, unknown> => {
  const omitted = String(key);
  const clone = createDictionary();

  for (const existingKey of Object.keys(existing)) {
    if (existingKey === omitted) continue;
    writeOwnProperty(
      clone,
      existingKey,
      readOwnProperty(existing, existingKey),
    );
  }

  return clone;
};

const omitOwnPath = (container: unknown, segments: ObjectPath): unknown => {
  const [segment, ...rest] = segments;
  if (segment === undefined) return container;
  if (container === null || typeof container !== 'object') return container;
  if (!Object.hasOwn(container, segment)) return container;

  if (rest.length > 0) {
    const existing = readOwnProperty(container, segment);
    const remaining = omitOwnPath(existing, rest);
    if (remaining === existing) return container;

    const clone = Array.isArray(container)
      ? cloneArray(container)
      : cloneDictionary(container);
    writeOwnProperty(clone, segment, remaining);
    return clone;
  }

  if (Array.isArray(container)) {
    if (readOwnProperty(container, segment) === undefined) return container;

    const clone = cloneArray(container);
    writeOwnProperty(clone, segment, undefined);
    return clone;
  }

  return omitDictionaryKey(container, segment);
};

/**
 * A copy of `value` with whatever sits at `path` removed.
 *
 * Returns `value` ITSELF when the path names nothing it holds — an unsafe
 * path, a primitive where the path expects a container, a key that is not
 * there — so a caller can compare by identity to tell a real removal from a
 * no-op. Nothing reachable from `value` is written to: every container along
 * the path is copied, exactly as `setValue` copies the ones it traverses.
 *
 * A removal from a dictionary drops the key, so the value stops appearing in
 * the object's own keys rather than lingering as an `undefined` that
 * serialises into whatever is written from it. A removal from an ARRAY leaves
 * the index in place holding `undefined`: the positions around it are ones
 * other paths address by number, and closing the gap would renumber them.
 */
export function omitValue(value: unknown, path: string | ObjectPath): unknown {
  const segments = resolveObjectPath(path);
  if (!segments || segments.length === 0) return value;

  return omitOwnPath(value, segments);
}

export function createObjectPathWriter(
  obj: Record<string, unknown>,
): (path: string | ObjectPath, value: unknown) => void {
  const ownedContainers = new WeakSet<object>();
  ownedContainers.add(obj);

  return (path, value) => {
    setValueWithOwnedContainers(obj, path, value, ownedContainers);
  };
}
