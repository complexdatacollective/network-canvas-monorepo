import { describe, expect, it } from 'vitest';

import type { FieldValue } from '../../store/types';
import { getComparisonValue } from './getComparisonValue';

describe('getComparisonValue', () => {
  it('does not resolve an inherited form value', () => {
    const formValues: Record<string, FieldValue> = {
      __proto__: { compared: 'inherited' },
    };

    expect(getComparisonValue(formValues, 'compared')).toEqual({
      present: false,
      value: undefined,
    });
    expect(Object.hasOwn(Object.prototype, 'compared')).toBe(false);
  });

  it('treats a dotted comparison variable as one own key', () => {
    const formValues = { 'favorite.color': 'blue' };

    expect(getComparisonValue(formValues, 'favorite.color')).toEqual({
      present: true,
      value: 'blue',
    });
  });

  it.each(['__proto__', 'prototype', 'constructor'])(
    'does not resolve dangerous own property %s',
    (attribute) => {
      const formValues: Record<string, FieldValue> = {};
      Object.defineProperty(formValues, attribute, {
        enumerable: true,
        value: 'unsafe',
      });

      expect(getComparisonValue(formValues, attribute)).toEqual({
        present: false,
        value: undefined,
      });
      expect(Object.hasOwn(Object.prototype, 'unsafe')).toBe(false);
    },
  );
});
