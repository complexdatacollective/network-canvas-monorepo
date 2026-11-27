/**
 * `compute`, remembering the results for the `limit` keys read most
 * recently. For a pure function of a key, such as reading a message, that is
 * asked for the same keys again and again: validation, an editor and the
 * interview read the same text many times, mostly text that has not changed.
 * Bounded, so that an editor producing a new message with each keystroke
 * cannot grow it without limit. A result must only ever be read, since every
 * caller of a key is given the same one.
 */
export function boundedCache<Key, Value>(
  limit: number,
  compute: (key: Key) => Value,
): (key: Key) => Value {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(
      `A bounded cache keeps at least one result (${limit}).`,
    );
  }
  // Each result is boxed, so that a result that is `undefined` is still known.
  const results = new Map<Key, Readonly<{ value: Value }>>();
  return (key) => {
    const known = results.get(key);
    if (known !== undefined) {
      // Read again: moved to the end, so that it is the last to go.
      results.delete(key);
      results.set(key, known);
      return known.value;
    }
    const value = compute(key);
    if (results.size >= limit) {
      const oldest = results.keys().next();
      if (!oldest.done) results.delete(oldest.value);
    }
    results.set(key, { value });
    return value;
  };
}
