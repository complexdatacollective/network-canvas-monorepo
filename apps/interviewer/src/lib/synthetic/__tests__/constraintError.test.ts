import { describe, expect, it } from 'vitest';

import {
  SyntheticDataConstraintError,
  type ConstraintConflict,
} from '@codaco/protocol-utilities';

import { isSyntheticConstraintRefusal } from '../constraintError';

const CONFLICTS: ConstraintConflict[] = [
  {
    entity: 'node',
    entityType: 'person',
    entityTypeName: 'Person',
    variableIds: ['band-var'],
    variableNames: ['Band'],
    rules: ['unique'],
    reason: 'the draw exhausted every remaining distinct value',
  },
];

/**
 * A second class with the same name and shape — what a refusal thrown by a
 * different copy of the generator module looks like from here. `instanceof`
 * says no to this; the researcher's toast must still say yes.
 */
class ForeignConstraintError extends Error {
  readonly conflicts = CONFLICTS;
  constructor() {
    super('Synthetic data cannot be generated: …');
    this.name = 'SyntheticDataConstraintError';
  }
}

describe('isSyntheticConstraintRefusal', () => {
  it('recognises the refusal the generator throws', () => {
    expect(
      isSyntheticConstraintRefusal(new SyntheticDataConstraintError(CONFLICTS)),
    ).toBe(true);
  });

  it('recognises a refusal from another copy of the error class', () => {
    const foreign = new ForeignConstraintError();

    expect(foreign instanceof SyntheticDataConstraintError).toBe(false);
    expect(isSyntheticConstraintRefusal(foreign)).toBe(true);
  });

  it('rejects an ordinary failure, which has no conflicts to render', () => {
    expect(
      isSyntheticConstraintRefusal(new Error('database write failed')),
    ).toBe(false);
  });

  it('rejects an error that names itself but carries no conflicts', () => {
    const impostor = new Error('nothing structured here');
    impostor.name = 'SyntheticDataConstraintError';

    expect(isSyntheticConstraintRefusal(impostor)).toBe(false);
  });

  it('rejects a non-error, so a rejected string cannot reach the list renderer', () => {
    expect(
      isSyntheticConstraintRefusal({
        name: 'SyntheticDataConstraintError',
        conflicts: CONFLICTS,
      }),
    ).toBe(false);
  });
});
