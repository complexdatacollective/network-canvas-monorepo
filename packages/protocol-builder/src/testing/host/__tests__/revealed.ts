import { Redacted } from 'effect';

export function revealed(value: unknown): unknown {
  if (Redacted.isRedacted(value)) return revealed(Redacted.value(value));
  if (Array.isArray(value)) return value.map(revealed);
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, revealed(item)]),
    );
  }
  return value;
}
