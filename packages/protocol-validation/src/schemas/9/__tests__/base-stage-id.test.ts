import { describe, expect, it } from 'vitest';

import { localized } from '../../../utils/test-utils.ts';
import { MAX_STAGE_ID_LENGTH, baseStageSchema } from '../stages/base.ts';

// Hosts store stage ids in bounded columns (Studio's interview records accept
// 1 to 128 characters), so a protocol that validates must never carry an id a
// host would refuse partway through an interview.
describe('baseStageSchema id bounds', () => {
  const stageWithId = (id: string) => ({
    id,
    label: localized('Welcome'),
  });

  const idIssue = (id: string) => {
    const result = baseStageSchema.safeParse(stageWithId(id));
    return result.success
      ? undefined
      : result.error.issues.find((issue) => issue.path[0] === 'id');
  };

  it('accepts ids from 1 to the maximum length', () => {
    expect(idIssue('a')).toBeUndefined();
    expect(idIssue('a'.repeat(MAX_STAGE_ID_LENGTH))).toBeUndefined();
  });

  it('rejects an empty id', () => {
    expect(idIssue('')?.message).toBe('A stage id must not be empty.');
  });

  it('rejects an id longer than the maximum length', () => {
    expect(idIssue('a'.repeat(MAX_STAGE_ID_LENGTH + 1))?.message).toBe(
      'A stage id must be at most 128 characters long.',
    );
  });
});
