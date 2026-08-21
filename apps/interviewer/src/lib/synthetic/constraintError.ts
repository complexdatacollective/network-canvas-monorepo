import type { ConstraintConflict } from '@codaco/protocol-utilities';

/**
 * A refused generation, as this app consumes it: the flat message plus the
 * structured conflicts the failure toast renders as a list.
 */
export type SyntheticConstraintRefusal = Error & {
  conflicts: readonly ConstraintConflict[];
};

/**
 * Recognise a refusal by shape rather than by `instanceof`.
 *
 * The generator refuses with a `SyntheticDataConstraintError`, but "which
 * class" is not a question this app can answer: the error class is defined
 * inside `@codaco/protocol-utilities` and an `instanceof` check compares
 * against whichever copy of that module the app's own import graph resolved.
 * Two copies with the same name — a package boundary, a test that mocks part
 * of the module, or an engine that re-homes the class between versions — make
 * `instanceof` answer "no" for an error that is, in every way the researcher
 * cares about, exactly that refusal.
 *
 * So match the contract instead: the error names itself, and carries the
 * conflicts the toast needs. Anything satisfying both renders as the readable
 * list; anything else falls back to its flat message.
 */
export function isSyntheticConstraintRefusal(
  error: unknown,
): error is SyntheticConstraintRefusal {
  return (
    error instanceof Error &&
    error.name === 'SyntheticDataConstraintError' &&
    Array.isArray((error as { conflicts?: unknown }).conflicts)
  );
}
