import { describe, expect, it } from 'vitest';

import {
  SUBJECT_INDEPENDENT_FIELDS,
  subjectDependentResets,
} from '../subjectReset.ts';

describe('what a subject change invalidates', () => {
  /**
   * Written out rather than derived from the constant. A test that feeds the
   * list back in cannot see a member leave it — deleting `'introductionPanel'`
   * removes it from both sides at once and stays green — and the point of the
   * list is that a protocol edited in Architect and a protocol edited here
   * lose and keep exactly the same things.
   */
  it('keeps what Architect keeps, named one by one', () => {
    expect([...SUBJECT_INDEPENDENT_FIELDS]).toEqual([
      'id',
      'type',
      'label',
      'interviewScript',
      'introductionPanel',
      'subject',
    ]);
  });

  it('keeps only what does not describe the subject', () => {
    const resets = subjectDependentResets(
      [
        'id',
        'type',
        'label',
        'interviewScript',
        'introductionPanel',
        'subject',
        'prompts',
        'form',
        'panels',
      ],
      {},
    );

    expect(resets.map((reset) => reset.key)).toEqual([
      'form',
      'panels',
      'prompts',
    ]);
  });

  it('names a key only the interface template knows about', () => {
    const resets = subjectDependentResets(['prompts'], {
      behaviours: { removeAfterConsideration: true },
    });

    expect(resets).toEqual([
      { key: 'behaviours', value: { removeAfterConsideration: true } },
      { key: 'prompts', value: undefined },
    ]);
  });

  /**
   * A capability the researcher has never opened contributes nothing to the
   * form's values while still holding configuration that belongs to the old
   * subject. Reading only the form would leave it in the saved stage.
   */
  it('names a key the form has but the draft does not, and the reverse', () => {
    const resets = subjectDependentResets(['panels', 'quickAdd'], {});

    expect(resets.map((reset) => reset.key)).toEqual(['panels', 'quickAdd']);
  });
});
