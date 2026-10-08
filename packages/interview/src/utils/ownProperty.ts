/**
 * Reading and writing an object's OWN property by a key that came from the
 * protocol, such as a codebook attribute id.
 *
 * An attribute id may legally be `__proto__` (`CodebookIdSchema` admits it).
 * On a plain object, assigning that key calls the inherited setter, which
 * changes the object's prototype and records nothing, and reading it while
 * the object has no such own property returns `Object.prototype` rather than
 * `undefined`. Define and read the property as the object's own instead.
 */

/** The object's own value under `key`, or `undefined` when it has none. */
export function readOwnProperty<Value>(
  target: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(target, key) ? target[key] : undefined;
}

/** Sets `key` as the object's own property, whatever the key. */
export function writeOwnProperty<Value>(
  target: Record<string, Value>,
  key: string,
  value: Value,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
