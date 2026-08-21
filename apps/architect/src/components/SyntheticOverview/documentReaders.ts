/**
 * Defensive readers over the SAVED protocol document.
 *
 * The overview's authored/default badges are a claim about the FILE — "authored
 * = key present in the protocol; default = key absent" (spec governing rule 4)
 * — and that question can only be asked of the document as stored. A parse is
 * exactly where the difference disappears: prefaults and defaults land in the
 * output looking like values a human wrote, which is why the screen holds the
 * document and the parse side by side rather than deriving one from the other.
 *
 * Redux types the editing buffer as `CurrentProtocol` for the editors'
 * convenience, but what it holds is the stored document — pre-parse. These
 * readers therefore walk it as the untyped data it really is, so a badge can
 * never be decided by a type that describes the parse output instead.
 */

export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The record at `key`, or `undefined` where the document has anything else. */
export const recordAt = (
  source: UnknownRecord | undefined,
  key: string,
): UnknownRecord | undefined => {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
};

/**
 * Whether the document states this key at all.
 *
 * Presence, not truthiness: `responseBurden: 0` is as authored as
 * `responseBurden: 1.5`, and an author who deliberately priced a stage at zero
 * must not be told the schema did it for them.
 */
export const declares = (
  source: UnknownRecord | undefined,
  key: string,
): boolean => source !== undefined && source[key] !== undefined;

export const readNumber = (
  source: UnknownRecord | undefined,
  key: string,
): number | undefined => {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
};

export const readBoolean = (
  source: UnknownRecord | undefined,
  key: string,
): boolean | undefined => {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

/** The array at `key`, as records, dropping anything that is not one. */
export const recordsAt = (
  source: UnknownRecord | undefined,
  key: string,
): UnknownRecord[] => {
  const value = source?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
};
