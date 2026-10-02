import type { RosterCharacterProblem } from '@codaco/protocol-validation';

/**
 * A roster refused because it holds a character no export can carry: the
 * first place it was found, and how many places there are in all.
 *
 * Kept apart from the readers in `assetTools` that throw it, so the import
 * error mapping can recognise it without importing them.
 */
export class RosterCharacterError extends Error {
  readonly code = 'UNSUPPORTED_CHARACTERS';
  readonly problem: RosterCharacterProblem;
  readonly total: number;

  constructor(problem: RosterCharacterProblem, total: number) {
    super('This network file contains characters that cannot be stored.');
    this.problem = problem;
    this.total = total;
  }
}
