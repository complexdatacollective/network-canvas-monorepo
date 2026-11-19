import { describe, expect, it } from 'vitest';

import { testId } from '../../../__tests__/testIds.ts';
import { DUPLICATE_OBJECT_ID } from '../../../utils/protocolObjectIds.ts';
import { localized } from '../../../utils/test-utils.ts';
import { FormFieldSchema } from '../common/forms.ts';
import {
  ComposerFormFieldSchema,
  networkComposerStage,
} from '../stages/network-composer.ts';

/**
 * Architect assigns every editable form field a stable `id` (uuid) on creation
 * so the OrderedList / motion Reorder keying survives reorder + delete, and the
 * schema 8 to 9 migration gives one to every field it upgrades. A shared form
 * field and a NetworkComposer field must each carry one.
 */
describe('form field id retention', () => {
  it('FormFieldSchema accepts a stable id', () => {
    const result = FormFieldSchema.safeParse({
      id: testId('a-stable-uuid'),
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

  it('ComposerFormFieldSchema accepts a stable id', () => {
    const result = ComposerFormFieldSchema.safeParse({
      id: testId('a-stable-uuid'),
      variable: 'personName',
      label: localized('Name?'),
      component: 'Text',
    });

    expect(result.success).toBe(true);
  });

  it('ComposerFormFieldSchema requires a non-empty id', () => {
    const field = {
      variable: 'personName',
      label: localized('Name?'),
      component: 'Text',
    };

    expect(ComposerFormFieldSchema.safeParse(field).success).toBe(false);
    expect(
      ComposerFormFieldSchema.safeParse({ ...field, id: '' }).success,
    ).toBe(false);
  });

  it('a Network Composer stage refuses two node form fields with one id', () => {
    const field = (id: string, variable: string) => ({
      id,
      variable,
      label: localized('Label'),
      component: 'Text',
    });
    const result = networkComposerStage.safeParse({
      id: testId('nc1'),
      label: localized('Build the network'),
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      layoutVariable: 'layoutPosition',
      background: { concentricCircles: 4 },
      nodeForm: {
        fields: [
          field(testId('same'), 'a'),
          field(testId('other'), 'b'),
          field(testId('same'), 'c'),
        ],
      },
    });

    expect(result.success).toBe(false);
    const duplicatePaths = result.error?.issues
      .filter(
        (issue) =>
          issue.code === 'custom' && issue.params?.rule === DUPLICATE_OBJECT_ID,
      )
      .map(({ path }) => path);
    expect(duplicatePaths).toEqual([
      ['nodeForm', 'fields', 0, 'id'],
      ['nodeForm', 'fields', 2, 'id'],
    ]);
  });
});
