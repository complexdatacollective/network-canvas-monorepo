import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';

import { selectFieldMetadataFromVariables } from '../../selectors/forms';
import { buildVariableLabels } from '../buildVariableLabels';

/**
 * A field's `variable` is a branded reference. `asEntityAttributeReference`
 * is the one way to make one from a plain string, so the fixtures below read
 * as ordinary data.
 */
const metadataFor = (
  variables: Record<string, Variable>,
  fields: { variable: string; prompt?: string; label?: string }[],
) =>
  selectFieldMetadataFromVariables(
    variables,
    fields.map((field) => ({
      ...field,
      variable: asEntityAttributeReference(field.variable),
    })) as Parameters<typeof selectFieldMetadataFromVariables>[1],
  );

/**
 * What a field is called has one rule, `authoredFieldLabel`, and two outputs:
 * the caption the participant reads, and the name a comparison validator may
 * use for the same variable in an error message. They are derived from one
 * computation so a participant can never be sent to fix "your answer to X"
 * when nothing on the screen is called X — and so the caption's last-resort
 * fallback, the codebook variable's researcher-facing `name`, cannot leak into
 * a message the way it leaks into a caption.
 */
describe('the caption and the validator name come from one rule', () => {
  it('trims the authored caption the participant reads', () => {
    const [meta] = metadataFor(
      { age: { name: 'age', type: 'number' as const, component: 'Number' } },
      [{ variable: 'age', prompt: '  How old are you?  ' }],
    );

    expect(meta?.label).toBe('How old are you?');
    expect(meta?.authoredLabel).toBe('How old are you?');
  });

  it('captions a field whose authored prompt is only whitespace', () => {
    // A blank caption leaves the control unnamed on screen. The codebook
    // variable's name is the last resort a rendered field has.
    const [meta] = metadataFor(
      { age: { name: 'Age', type: 'number' as const, component: 'Number' } },
      [{ variable: 'age', prompt: '   ' }],
    );

    expect(meta?.label).toBe('Age');
  });

  it('does not offer that fallback caption to a validator', () => {
    // The same field: the participant sees "Age" because something has to name
    // the control, but "Age" is a researcher's column identifier, so no error
    // message may repeat it back as though the researcher had written it.
    const [meta] = metadataFor(
      { age: { name: 'Age', type: 'number' as const, component: 'Number' } },
      [{ variable: 'age', prompt: '   ' }],
    );

    expect(meta?.authoredLabel).toBeUndefined();
    expect(
      buildVariableLabels([{ variable: 'age', label: meta?.authoredLabel }]),
    ).toEqual({});
  });

  it('names a variable in an error exactly as the field captions it', () => {
    const fields = [
      { variable: 'age', prompt: '  How old are you?  ' },
      { variable: 'siblings', prompt: 'How many siblings?' },
    ];
    const metadata = metadataFor(
      {
        age: { name: 'age', type: 'number' as const, component: 'Number' },
        siblings: {
          name: 'siblings',
          type: 'number' as const,
          component: 'Number',
        },
      },
      fields,
    );

    const labels = buildVariableLabels(
      metadata.map((field) => ({
        variable: field.variable,
        label: field.authoredLabel,
      })),
    );

    // Every name a validator can produce is a caption rendered on this screen.
    for (const [variable, label] of Object.entries(labels)) {
      const rendered = metadata.find((field) => field.variable === variable);
      expect(rendered?.label).toBe(label);
    }
    expect(labels).toEqual({
      age: 'How old are you?',
      siblings: 'How many siblings?',
    });
  });
});
