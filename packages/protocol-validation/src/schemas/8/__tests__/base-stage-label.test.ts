import { describe, expect, it } from 'vitest';

import { baseStageSchema } from '../stages/base.ts';

/**
 * Guard test locking the intentional divergence documented in #663.
 *
 * Stage `label` (and `interviewScript`) are author-facing only — the
 * human-readable stage title / authoring guidance shown in Architect. They are
 * deliberately NOT rendered in the interview chrome (see Navigation.tsx).
 *
 * To keep that divergence explicit and self-documenting, `label` must remain a
 * REQUIRED field on the stage base schema so it cannot be silently dropped from
 * a protocol. This test fails if `label` ever becomes optional.
 */
describe('baseStageSchema label requirement (#663)', () => {
  const validBase = {
    id: 's1',
    label: 'Welcome and consent',
  };

  it('requires label on every stage', () => {
    const { label: _label, ...withoutLabel } = validBase;
    const result = baseStageSchema.safeParse(withoutLabel);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes('label')),
      ).toBe(true);
    }
  });

  it('rejects an empty label', () => {
    const result = baseStageSchema.safeParse({ ...validBase, label: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes('label')),
      ).toBe(true);
    }
  });

  it('accepts a stage that provides a label', () => {
    const result = baseStageSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });
});
