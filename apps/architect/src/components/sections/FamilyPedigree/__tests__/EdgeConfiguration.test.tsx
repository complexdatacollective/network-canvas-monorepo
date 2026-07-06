import { describe, expect, it } from 'vitest';

import type { VariableOptions } from '@codaco/protocol-validation';
import {
  RELATIONSHIP_TYPE_OPTIONS,
  RELATIONSHIP_TYPES,
} from '@codaco/shared-consts';
import { optionsMatch } from '~/utils/variables';

describe('EdgeConfiguration RELATIONSHIP_TYPE_OPTIONS', () => {
  it('locks the option set to the shared canonical relationship types', () => {
    expect(RELATIONSHIP_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      ...RELATIONSHIP_TYPES,
    ]);
  });

  it('matches a categorical variable carrying exactly the interview values', () => {
    const variableOptions: VariableOptions = RELATIONSHIP_TYPE_OPTIONS.map(
      ({ value, label }) => ({ value, label }),
    );

    expect(optionsMatch(variableOptions, RELATIONSHIP_TYPE_OPTIONS)).toBe(true);
  });
});
