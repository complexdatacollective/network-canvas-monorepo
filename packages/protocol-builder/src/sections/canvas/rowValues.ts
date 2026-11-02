import { useState } from 'react';

/**
 * Reading a row the way a stage editor has to read one: tolerantly.
 *
 * A row arrives as whatever the protocol holds — authored by another tool, by
 * an older version of this one, or half-configured by the researcher a moment
 * ago — so nothing here assumes a shape. A value that is not what the field
 * expects is reported as absent, which is the one thing every control already
 * knows how to render.
 */

export const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** A list of ids the row holds directly. */
export const asIdList = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;

/** A string held inside a container the row may not have at all. */
export const asNestedText = (
  value: unknown,
  key: string,
): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  return asText(Reflect.get(value, key));
};

/** A flag held inside a container the row may not have at all. */
export const asNestedBoolean = (
  value: unknown,
  key: string,
): boolean | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const flag = Reflect.get(value, key);
  return typeof flag === 'boolean' ? flag : undefined;
};

/** A list of ids held inside a container the row may not have at all. */
export const asNestedIdList = (
  value: unknown,
  key: string,
): string[] | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  return asIdList(Reflect.get(value, key));
};

/**
 * The same list, as the same array, for as long as its contents are unchanged.
 *
 * A row editor is handed a freshly built copy of its row on every render, so a
 * list read out of one is a new array every time — and a field's starting
 * value is part of its REGISTRATION: an unstable one re-registers the field on
 * every render, and a field registering while a submit is validating
 * supersedes that validation, so the dialog refuses to save with nothing on
 * screen to say why.
 */
export function useStableIdList(
  value: readonly string[] | undefined,
): string[] | undefined {
  const [held, setHeld] = useState<string[] | undefined>(undefined);
  const unchanged =
    value !== undefined &&
    held !== undefined &&
    held.length === value.length &&
    held.every((entry, index) => entry === value[index]);
  if (unchanged) return held;
  // Stored during render, which React allows for state the component owns:
  // it discards this pass and renders again at once with the new array held,
  // so no render ever returns an array that is not the held one.
  const next = value === undefined ? undefined : [...value];
  if (next !== held) setHeld(next);
  return next;
}
