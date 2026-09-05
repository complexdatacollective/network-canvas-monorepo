/**
 * A row as the researcher left it, with everything they did not answer gone.
 *
 * Every "absent" a form can produce is spelled the same way in the protocol
 * schema: the key is not there. A cleared control submits an empty string, a
 * picker that was never used can hand back `null`, and a group of controls
 * whose every part is empty assembles an object of nothing — and none of those
 * are values the schema accepts where it accepts a value at all. Left in, they
 * reach a save as `"negativeLabel": ""` and are refused in the schema's own
 * words against a path, rather than simply not being there.
 *
 * Empty ARRAYS survive. A list the researcher emptied is a list they emptied,
 * and the rules that decide whether that is allowed belong to the field that
 * owns the list, not here.
 */
export function withoutAbsentValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAbsentValues);
  if (typeof value !== 'object' || value === null) return value;

  const kept: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const cleaned = withoutAbsentValues(entry);
    if (isAbsent(cleaned)) continue;
    kept[key] = cleaned;
  }
  return kept;
}

/**
 * `false` and `0` are answers. An empty object is not: it is what a group of
 * unanswered controls assembles into, and it is never a value in its own
 * right.
 */
function isAbsent(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
