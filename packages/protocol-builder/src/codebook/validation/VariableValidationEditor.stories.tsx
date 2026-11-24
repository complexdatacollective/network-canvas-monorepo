import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import { testVariableId } from '../../testing/testId.ts';
import type { ValidationMap } from '../variableValidation.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

const AGE = testVariableId('age');
const HEIGHT = testVariableId('height');
const NICKNAME = testVariableId('nickname');

const variables = {
  [AGE]: { name: 'Age', type: 'number', component: 'Number' },
  [HEIGHT]: { name: 'Height', type: 'number', component: 'Number' },
  [NICKNAME]: { name: 'Nickname', type: 'text', component: 'Text' },
};

function ValidationEditorProof({
  seed,
  ruleHints,
}: Readonly<{
  seed?: ValidationMap;
  ruleHints?: Readonly<Record<string, string>>;
}>) {
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
        currentVariableId={AGE}
        allVariables={variables}
        value={validation}
        onChange={setValidation}
        {...(ruleHints === undefined ? {} : { ruleHints })}
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

/** The first fill painted behind a control, up to the group it sits in. */
function paintedBehind(control: Element, group: Element): string | null {
  let current = control.parentElement;
  while (current !== null && current !== group) {
    const fill = getComputedStyle(current).backgroundColor;
    if (fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent') return fill;
    current = current.parentElement;
  }
  return null;
}

/** The colour `--rule-bg` paints as, resolved where the rows read it. */
function fillOfRuleRows(group: Element): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = 'var(--rule-bg)';
  group.append(probe);
  const fill = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return fill;
}

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
    seed: { required: true, minValue: 0, sameAs: HEIGHT },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const group of [
      'Requirements',
      'Limits',
      'Compare to another attribute',
    ]) {
      const groupElement = canvas.getByRole('group', { name: group });
      const switches = within(groupElement).getAllByRole('switch');
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
      // `--rule-bg` is the slate-blue Architect fills a live rule row with.
      const ruleFill = fillOfRuleRows(groupElement);
      const [onSwitch] = on;
      const [offSwitch] = off;
      if (onSwitch === undefined || offSwitch === undefined) {
        throw new Error(`the ${group} group lost a switch`);
      }
      await expect(paintedBehind(onSwitch, groupElement)).toBe(ruleFill);
      await expect(paintedBehind(offSwitch, groupElement)).not.toBe(ruleFill);
    }
  },
};

/**
 * A host's own guidance beneath a rule, for something it knows about the rule
 * that the editor cannot: the passphrase rules use it to say what minimum
 * applies when none is set. It is read on the rule it names — switched on or
 * off — and on no other row.
 */
export const GuidanceOnARule: Story = {
  args: {
    seed: { minValue: 0 },
    ruleHints: { maxValue: 'Leave this off to allow any value.' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('switch', { name: 'Maximum value' }),
    ).toHaveAccessibleDescription('Leave this off to allow any value.');
    await expect(
      canvas.getByRole('switch', { name: 'Minimum value' }),
    ).toHaveAccessibleDescription('');
  },
};
