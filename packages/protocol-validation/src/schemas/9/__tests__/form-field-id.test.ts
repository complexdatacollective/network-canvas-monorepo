import { describe, expect, it } from 'vitest';

import { localized } from '../../../utils/test-utils.ts';
import { FormFieldSchema } from '../common/forms.ts';
import { ComposerFormFieldSchema } from '../stages/network-composer.ts';

/**
 * Architect assigns every editable form field a stable `id` (uuid) on creation
 * so the OrderedList / motion Reorder keying survives reorder + delete, and the
 * schema 8 to 9 migration gives one to every field it upgrades. A shared form
 * field must carry one; a NetworkComposer field's id is still optional.
 */
describe('form field id retention', () => {
  it('FormFieldSchema accepts a stable id', () => {
    const result = FormFieldSchema.safeParse({
      id: 'a-stable-uuid',
      variable: 'personName',
      prompt: localized('What is their name?'),
    });

    expect(result.success).toBe(true);
  });

  it('FormFieldSchema requires a non-empty id', () => {
    const field = { variable: 'personName', prompt: localized('Name?') };

    expect(FormFieldSchema.safeParse(field).success).toBe(false);
    expect(FormFieldSchema.safeParse({ ...field, id: '' }).success).toBe(false);
  });

  it('ComposerFormFieldSchema accepts an optional stable id', () => {
    const result = ComposerFormFieldSchema.safeParse({
      id: 'a-stable-uuid',
      variable: 'personName',
      label: localized('Name?'),
      component: 'Text',
    });

    expect(result.success).toBe(true);
  });
});
