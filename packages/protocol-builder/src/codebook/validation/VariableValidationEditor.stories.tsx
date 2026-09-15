import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import type { ValidationMap } from '../variableValidation.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

const variables = {
  age: { name: 'Age', type: 'number', component: 'Number' },
  height: { name: 'Height', type: 'number', component: 'Number' },
  nickname: { name: 'Nickname', type: 'text', component: 'Text' },
};

function ValidationEditorProof({ seed }: Readonly<{ seed?: ValidationMap }>) {
  const [validation, setValidation] = useState<ValidationMap>(
    seed ?? { required: true, minValue: 0 },
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      {/* The ladder the editor really sits in: a row dialog's title, then the
          nested Validation section's own heading, then each rule group's
          legend — which is a `Heading level="label"`, an `h4`. Without the two
          rungs above it a standalone host jumps from `h1` to `h4`, which is a
          heading-order violation in a page nothing else is wrong with. */}
      <h2 className="mb-4 text-2xl font-bold text-current">Edit form field</h2>
      <h3 className="mb-4 text-xl font-bold text-current">Validation</h3>
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={validation}
        onChange={setValidation}
      />
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Variable validation editor',
  component: ValidationEditorProof,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ValidationEditorProof>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * One rule on and one off in each of the three groups — the state the styling
 * is about.
 *
 * Architect gave each group a fieldset with a floating legend tab, and marked
 * a rule that is ON by filling its whole row
 * (`Validations/ValidationRule.tsx`'s `ROW_ON`, the same slate-blue rule row
 * the multi-select array field uses). A researcher reads which rules apply
 * from that fill rather than from the switches alone, so a story that shows
 * both states side by side in every group is what a reader — and Chromatic,
 * where this package has no project — checks the look against.
 */
export const OneOnOneOffInEachGroup: Story = {
  args: {
    seed: { required: true, minValue: 0, sameAs: 'height' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const group of [
      'Requirements',
      'Limits',
      'Compare to another attribute',
    ]) {
      const rows = within(canvas.getByRole('group', { name: group }));
      const switches = rows.getAllByRole('switch');
      const on = switches.filter(
        (control) => control.getAttribute('aria-checked') === 'true',
      );
      const off = switches.filter(
        (control) => control.getAttribute('aria-checked') !== 'true',
      );
      // Both states present, so the fill below is being compared against a
      // row that does not have it rather than against nothing.
      await expect(on).toHaveLength(1);
      await expect(off.length).toBeGreaterThan(0);

      // The row carrying an enabled rule is filled; the row beside it is not.
      // `--rule-bg` is the slate-blue Architect fills a live rule row with,
      // and the nearest ancestor carrying it IS that row.
      await expect(on[0]?.closest('[class*="bg-(--rule-bg)"]')).not.toBeNull();
      await expect(off[0]?.closest('[class*="bg-(--rule-bg)"]')).toBeNull();
    }
  },
};
