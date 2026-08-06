import { describe, expect, it } from 'vitest';

import type { GenerationConfig } from '../config';
import { resolveGenerationConfig } from '../config';

describe('resolveGenerationConfig', () => {
  // `GenerationConfig` is exported from the package entry, so a required field
  // on it breaks any consumer that annotates a whole config. This annotation is
  // the guard: make `today` required again and this file stops compiling, which
  // is the signal that the change needs a major release rather than a minor.
  it('accepts a complete config annotated without a date', () => {
    const config: GenerationConfig = {
      dropOutFactor: 0.15,
      inProgressClearRatio: 0.5,
    };

    expect(resolveGenerationConfig(config).today).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('pins the run to a supplied date', () => {
    expect(resolveGenerationConfig({ today: '2001-09-11' }).today).toBe(
      '2001-09-11',
    );
  });

  it('reads the clock when no date is supplied', () => {
    expect(resolveGenerationConfig().today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves a date rather than keeping an explicit undefined', () => {
    expect(resolveGenerationConfig({ today: undefined }).today).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('keeps a supplied tuning value alongside the resolved date', () => {
    const config = resolveGenerationConfig({ dropOutFactor: 0.9 });

    expect(config.dropOutFactor).toBe(0.9);
    expect(config.inProgressClearRatio).toBe(0.5);
  });
});
