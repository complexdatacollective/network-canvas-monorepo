import type { VariableValue } from '@codaco/shared-consts';

/**
 * A value as it reads in a message. Layout objects and selections would print
 * as `[object Object]` or a bare comma list through `String`, so they are
 * written as JSON; everything else prints as it would through `String`.
 */
export function describeValue(value: VariableValue | null | undefined): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}
