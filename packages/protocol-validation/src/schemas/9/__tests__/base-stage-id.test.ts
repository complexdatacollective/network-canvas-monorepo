import { describe, expect, it } from 'vitest';

import { testId } from '../../../__tests__/testIds.ts';
import { localized } from '../../../utils/test-utils.ts';
import { baseStageSchema } from '../stages/base.ts';

// Hosts store stage ids in bounded columns (Studio's interview records accept
// 1 to 128 characters); a UUID always fits.
describe('baseStageSchema id', () => {
  const idIssue = (id: unknown) => {
    const result = baseStageSchema.safeParse({
      id,
      label: localized('Welcome'),
    });
    return result.success
      ? undefined
      : result.error.issues.find((issue) => issue.path[0] === 'id');
  };

  it('accepts a UUID', () => {
    expect(idIssue(testId('welcome'))).toBeUndefined();
  });

  it.each(['', 'welcome', 'finish', '-introduction'])(
    'rejects the id %j, which is not a UUID',
    (id) => {
      expect(idIssue(id)?.message).toBe('An id must be a UUID.');
    },
  );

  it('rejects a missing id', () => {
    expect(idIssue(undefined)).toBeDefined();
  });
});
