import { describe, expect, it } from 'vitest';

import { VariableNameSchema } from '../variables';

describe('VariableNameSchema', () => {
  it.each(['__proto__', 'prototype', 'constructor'])(
    'rejects the dangerous property name %s',
    (name) => {
      const result = VariableNameSchema.safeParse(name);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          'Variable name cannot be "__proto__", "prototype", or "constructor"',
        );
      }
    },
  );

  it.each(['favorite.color', 'safe.__proto__.polluted', 'survey:wave_1-item'])(
    'preserves compatible variable identifier %s',
    (name) => {
      expect(VariableNameSchema.safeParse(name).success).toBe(true);
    },
  );
});
