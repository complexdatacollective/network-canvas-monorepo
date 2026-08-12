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
  Object.defineProperty(container, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

const createDictionary = (): Record<string, unknown> => ({});

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
    if (!isSafeSegment(key)) continue;
    writeOwnProperty(clone, key, readOwnProperty(existing, key));
  }

  return clone;
};

const writableContainer = (
  existing: unknown,
  createArray: boolean,
): Record<string, unknown> | unknown[] => {
  if (Array.isArray(existing)) return cloneArray(existing);
  if (createArray) return [];

  return existing !== null && typeof existing === 'object'
    ? cloneDictionary(existing)
    : createDictionary();
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
        if (!quoted) return null;
        segments.push(quoted.segment);
        index = quoted.nextIndex;
      } else {
        const closeIndex = path.indexOf(']', index + 1);
        if (closeIndex === -1) return null;
        const encodedIndex = path.slice(index + 1, closeIndex);
        if (!/^\d+$/.test(encodedIndex)) return null;
        segments.push(Number(encodedIndex));
        index = closeIndex + 1;
      }
      expectSegment = false;
      continue;
    }

    const segmentStart = index;
    while (index < path.length && path[index] !== '.' && path[index] !== '[') {
      index += 1;
    }
    segments.push(path.slice(segmentStart, index));
    expectSegment = false;
  }

  if (expectSegment) segments.push('');
  return segments.every(isSafeSegment) ? segments : null;
}

export function isSafeObjectPath(path: ObjectPath): boolean {
  return path.every(isSafeSegment);
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
export function setValue(
  obj: Record<string, unknown>,
  path: string | ObjectPath,
  value: unknown,
): void {
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
    );
    writeOwnProperty(current, segment, nextContainer);
    current = nextContainer;
  }
}
