import { describe, expect, it } from 'vitest';

import { FormFieldSchema } from '../common/forms.ts';
import { ComposerFormFieldSchema } from '../stages/network-composer.ts';

/**
 * Architect assigns every editable form field a stable `id` (uuid) on creation
 * so the OrderedList / motion Reorder keying survives reorder + delete. That id
 * is persisted into the protocol, so the field schemas must tolerate it rather
 * than rejecting the whole protocol as invalid.
 */
describe('form field id retention', () => {
  it('FormFieldSchema accepts an optional stable id', () => {
    const result = FormFieldSchema.safeParse({
      id: 'a-stable-uuid',
      variable: 'personName',
      prompt: 'What is their name?',
    });

    expect(result.success).toBe(true);
  });

  it('ComposerFormFieldSchema accepts an optional stable id', () => {
    const result = ComposerFormFieldSchema.safeParse({
      id: 'a-stable-uuid',
      variable: 'personName',
      component: 'Text',
    });

    expect(result.success).toBe(true);
  });
});
