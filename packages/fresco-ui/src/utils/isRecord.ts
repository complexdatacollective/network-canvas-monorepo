/**
 * Narrows an unknown value (parsed JSON, storage, a network response) to an
 * object whose properties can then be checked one by one.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
