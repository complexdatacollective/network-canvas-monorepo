import type { ConstraintConflict } from '@codaco/protocol-utilities';

/** A refused generation: the flat message plus the engine's structured conflicts. */
export type SyntheticConstraintRefusal = Error & {
  conflicts: readonly ConstraintConflict[];
};

/**
 * Whether generation refused because the protocol declares rules that no value
 * can satisfy — the one failure with something the researcher can act on, which
 * is why every surface that runs the engine gives it a rendering of its own.
 *
 * Recognised by the error's NAME rather than by `instanceof
 * SyntheticDataConstraintError`. "Which class" is not a question an app can
 * answer: the class lives inside `@codaco/protocol-utilities`, and an
 * `instanceof` check compares against whichever copy of that module the app's
 * own import graph resolved. Two copies with the same name — a package
 * boundary, a test that mocks part of the module, an engine that re-homes the
 * class between versions — make `instanceof` answer "no" for an error that is,
 * in every way the researcher cares about, exactly that refusal.
 *
 * So match the contract instead: the error names itself and carries the
 * conflicts a surface needs. Anything satisfying both renders as the refusal;
 * anything else is an ordinary failure with only its message.
 */
export function isSyntheticConstraintRefusal(
  error: unknown,
): error is SyntheticConstraintRefusal {
  if (!(error instanceof Error)) return false;
  if (error.name !== 'SyntheticDataConstraintError') return false;
  const { conflicts } = error as Partial<SyntheticConstraintRefusal>;
  return Array.isArray(conflicts);
}
