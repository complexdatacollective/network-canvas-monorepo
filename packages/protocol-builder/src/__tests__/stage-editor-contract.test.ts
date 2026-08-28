import { describe, expect, it } from 'vitest';

import { missingStageEditors, STAGE_TYPES } from '../stage-editor-contract.ts';

describe('stage editor contract', () => {
  it('tracks every current schema stage type', () => {
    expect(STAGE_TYPES.length).toBeGreaterThan(0);
    expect(new Set(STAGE_TYPES).size).toBe(STAGE_TYPES.length);
    expect(missingStageEditors({})).toEqual(STAGE_TYPES);
  });
});
