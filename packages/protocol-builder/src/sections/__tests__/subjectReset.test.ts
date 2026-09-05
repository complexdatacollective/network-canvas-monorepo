import { describe, expect, it } from 'vitest';

import {
  SUBJECT_INDEPENDENT_FIELDS,
  subjectDependentResets,
} from '../subjectReset.ts';

describe('what a subject change invalidates', () => {
  it('keeps only what does not describe the subject', () => {
    const resets = subjectDependentResets(
      [...SUBJECT_INDEPENDENT_FIELDS, 'prompts', 'form', 'panels'],
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
