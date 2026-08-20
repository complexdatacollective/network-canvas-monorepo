import { describe, expect, it } from 'vitest';

import { CurrentProtocolSchema } from '../schemas/index.ts';

// Datetime DatePicker with a declared field floor of 2000-01-01 and a
// zero-variance normal whose descriptor floor (1900-01-01) is WIDER than the
// field's. The generator draws from the intersection [2000-01-01, today], so
// the authored mean 1950-06-15 can never appear — every draw clamps to
// 2000-01-01.
const datetimeVariable = {
  name: 'Date_Met',
  type: 'datetime',
  component: 'DatePicker',
  parameters: { min: '2000-01-01' },
  synthetic: {
    distribution: 'normal',
    mean: '1950-06-15',
    sdDays: 0,
    min: '1900-01-01',
  },
} as const;

const protocol = {
  name: 'Test Protocol',
  schemaVersion: 8 as const,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'Name', type: 'text', component: 'Text' },
          dateMet: datetimeVariable,
        },
      },
    },
  },
  stages: [
    {
      id: 'nameGenerator1',
      type: 'NameGenerator',
      label: 'Generate Names',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add person',
        fields: [{ variable: 'name', prompt: 'Enter name' }],
      },
      prompts: [{ id: 'prompt1', text: 'Who do you know?' }],
    },
  ],
};

describe('zero-variance datetime mean vs field-window intersection', () => {
  it('schema rejects a zero-sd mean below the field floor even when the descriptor floor is wider', () => {
    // CORRECT behaviour (parity with rejectDisjointNumberSynthetic, which
    // takes innerLower = max(validation lower, synthetic.min)): the mean must
    // lie inside the INTERSECTION of the descriptor window and the field
    // window. 1950-06-15 < max('1900-01-01', '2000-01-01') = '2000-01-01', so
    // this protocol must be rejected. Today floor = syntheticMin ?? windowMin
    // lets the wider descriptor floor shadow the field floor entirely.
    const result = CurrentProtocolSchema.safeParse(protocol);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain(
        'standard deviation of 0 days',
      );
    }
  });
});
