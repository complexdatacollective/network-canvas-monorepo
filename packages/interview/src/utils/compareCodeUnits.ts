/**
 * Orders two strings by their UTF-16 code units, whatever the language.
 *
 * For orders the participant never sees: a cache key, or an assignment (such as
 * which colour a value gets) that must come out the same on every device and in
 * every interface language. `localeCompare` and `Intl.Collator` depend on the
 * runtime's locale, so the same data would key differently on two machines and a
 * colour would change when the participant switched language. An order the
 * participant reads goes through the content locale's collator instead
 * (`useContentFormat`).
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** `compareCodeUnits` on the text of two values, such as option values. */
export function compareAsText(a: unknown, b: unknown): number {
  return compareCodeUnits(String(a), String(b));
}
