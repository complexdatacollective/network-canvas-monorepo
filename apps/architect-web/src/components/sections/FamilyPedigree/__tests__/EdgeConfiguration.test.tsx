import { describe, expect, it } from 'vitest';

import type { VariableOptions } from '@codaco/protocol-validation';
import { optionsMatch } from '~/utils/variables';

import { RELATIONSHIP_TYPE_OPTIONS } from '../EdgeConfiguration';

// The FamilyPedigree interview writes these relationshipType values to edges
// (ParentEdgeType union plus 'partner'). Architect must lock the categorical
// edge variable to exactly this set so recorded data matches the codebook.
const INTERVIEW_RELATIONSHIP_TYPE_VALUES = [
  'biological',
  'social',
  'donor',
  'surrogate',
  'adoptive',
  'partner',
];

describe('EdgeConfiguration RELATIONSHIP_TYPE_OPTIONS', () => {
  it('locks the option set to the values the interview writes', () => {
    expect(RELATIONSHIP_TYPE_OPTIONS.map((option) => option.value)).toEqual(
      INTERVIEW_RELATIONSHIP_TYPE_VALUES,
    );
  });

  it('matches a categorical variable carrying exactly the interview values', () => {
    const variableOptions: VariableOptions = RELATIONSHIP_TYPE_OPTIONS.map(
      ({ value, label }) => ({ value, label }),
    );

    expect(optionsMatch(variableOptions, RELATIONSHIP_TYPE_OPTIONS)).toBe(true);
  });
});
