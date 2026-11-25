/**
 * Reading and writing an object's OWN property by a key that came from the
 * protocol, such as a codebook attribute id.
 *
 * A codebook variable id is a UUID, but an entity's attributes can hold other
 * keys: a roster column that matches no variable keeps its heading as its
 * key, and a heading may be `__proto__`. On a plain object, assigning that key calls the inherited setter, which
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
export function writeOwnProperty<Target extends Record<string, unknown>>(
  target: Target,
  key: string,
  value: Target[string],
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
