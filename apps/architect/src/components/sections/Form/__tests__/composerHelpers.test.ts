import { describe, expect, it } from 'vitest';

import {
  buildComposerFieldOverlay,
  composerNormalizeField,
} from '../composerHelpers';

describe('composerNormalizeField', () => {
  it('keeps id, component and parameters on the field but strips codebook + scaffolding props', () => {
    const out = composerNormalizeField({
      id: 'x',
      _createNewVariable: 'Age',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      label: 'Age',
      options: [{ label: 'a', value: 'a' }],
      validation: { required: true },
    });
    expect(out).toEqual({
      id: 'x',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      label: 'Age',
    });
  });

  it('omits a blank label so the variable-name caption fallback applies', () => {
    const out = composerNormalizeField({
      id: 'x',
      variable: 'age',
      component: 'Number',
      label: '   ',
    });
    expect(out).toEqual({
      id: 'x',
      variable: 'age',
      component: 'Number',
    });
  });
});

describe('buildComposerFieldOverlay', () => {
  const fields = [
    { id: 'f0', variable: 'age', component: 'Number', parameters: { min: 0 } },
    {
      variable: 'birth_date',
      component: 'DatePicker',
      parameters: { type: 'year' },
    },
    { component: 'Text' },
  ];

  it('keys each field’s component/parameters by the variable it renders, skipping variable-less rows', () => {
    expect(buildComposerFieldOverlay(fields)).toEqual({
      age: { component: 'Number', parameters: { min: 0 } },
      birth_date: { component: 'DatePicker', parameters: { type: 'year' } },
    });
  });

  // Eleventh-wave Finding 4: the field being edited is excluded at
  // construction time by its array index, so an id-less imported field
  // (ComposerFormFieldSchema.id is optional) is excluded exactly like one
  // Architect created with an id.
  it('excludes the field at excludeIndex, including an id-less field', () => {
    expect(buildComposerFieldOverlay(fields, 1)).toEqual({
      age: { component: 'Number', parameters: { min: 0 } },
    });
    expect(buildComposerFieldOverlay(fields, 0)).toEqual({
      birth_date: { component: 'DatePicker', parameters: { type: 'year' } },
    });
  });

  it('ignores an out-of-range excludeIndex (a not-yet-committed new item)', () => {
    expect(buildComposerFieldOverlay(fields, fields.length)).toEqual(
      buildComposerFieldOverlay(fields),
    );
  });

  it('returns an empty overlay for a non-array value', () => {
    expect(buildComposerFieldOverlay(undefined)).toEqual({});
  });
});
