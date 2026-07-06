import { describe, expect, it } from 'vitest';

import { operatorsAsOptions, operatorsByType, validTypes } from '../options';

describe('rule editor operator options', () => {
  it('offers CONTAINS / DOES_NOT_CONTAIN for text variables', () => {
    expect(operatorsByType.text.has('CONTAINS')).toBe(true);
    expect(operatorsByType.text.has('DOES_NOT_CONTAIN')).toBe(true);
  });

  it('exposes labelled options for CONTAINS / DOES_NOT_CONTAIN', () => {
    const values = operatorsAsOptions.map((option) => option.value);
    expect(values).toContain('CONTAINS');
    expect(values).toContain('DOES_NOT_CONTAIN');
  });

  it('offers NumericOperators for datetime and scalar variables', () => {
    const numericOperators = [
      'EXACTLY',
      'NOT',
      'GREATER_THAN',
      'GREATER_THAN_OR_EQUAL',
      'LESS_THAN',
      'LESS_THAN_OR_EQUAL',
    ];

    for (const operator of numericOperators) {
      expect(operatorsByType.datetime.has(operator)).toBe(true);
      expect(operatorsByType.scalar.has(operator)).toBe(true);
    }
  });

  it('offers BaseOperators for location and layout variables', () => {
    expect(operatorsByType.location.has('EXACTLY')).toBe(true);
    expect(operatorsByType.location.has('NOT')).toBe(true);
    expect(operatorsByType.layout.has('EXACTLY')).toBe(true);
    expect(operatorsByType.layout.has('NOT')).toBe(true);
  });

  it('allows scalar and layout variables to be queried', () => {
    expect(validTypes.has('scalar')).toBe(true);
    expect(validTypes.has('layout')).toBe(true);
  });
});
