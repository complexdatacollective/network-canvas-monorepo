import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../types';

describe('DEFAULT_SETTINGS security gates', () => {
  it('uses the unified enter gate (on) and exit gate (off)', () => {
    expect(DEFAULT_SETTINGS.requireUnlockOnEnter).toBe(true);
    expect(DEFAULT_SETTINGS.requireUnlockOnExit).toBe(false);
    expect(DEFAULT_SETTINGS.requireUnlockOnExport).toBe(false);
    expect('requireUnlockOnResume' in DEFAULT_SETTINGS).toBe(false);
  });

  it('defaults stage navigation on', () => {
    expect(DEFAULT_SETTINGS.allowStageNavigation).toBe(true);
  });
});
