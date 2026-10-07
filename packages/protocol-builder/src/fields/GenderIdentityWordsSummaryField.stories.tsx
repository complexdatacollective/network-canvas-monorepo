import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import GenderIdentityWordsSummaryField from './GenderIdentityWordsSummaryField.tsx';

/**
 * A stage key to hang the control on. What a story of a field shows is the
 * control: the key only has to be one the form store can hold.
 */
const TERMS_FIELD = 'genderIdentityTerms';

const OPTIONS = [
  { value: 'woman', label: { en: 'Woman' } },
  { value: 'man', label: { en: 'Man' } },
  { value: 'transWoman', label: { en: 'Trans woman' } },
  { value: 'unknown', label: { en: 'Don’t know' } },
];

const LABEL = 'Words for each gender identity';

function GenderIdentityWordsSummary({
  initialValue,
}: Readonly<{ initialValue?: Record<string, unknown>[] }>) {
  return (
    <Field<typeof GenderIdentityWordsSummaryField>
      name={TERMS_FIELD}
      component={GenderIdentityWordsSummaryField}
      label={LABEL}
      hint="The kinship words each gender identity takes. Change them, and the options, with Edit options."
      tableLabel={LABEL}
      options={OPTIONS}
      reconcile
      {...(initialValue === undefined ? {} : { initialValue })}
    />
  );
}

/** The words shown for each row, as `[option, words]` pairs. */
const rowsOf = async (canvasElement: HTMLElement) => {
  const table = await within(canvasElement).findByRole('table', {
    name: LABEL,
  });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );
};

const meta = {
  title: 'Protocol Builder/Fields/Gender identity words summary',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Which kinship words each option of a Family Pedigree’s gender identity attribute takes, shown read-only on the stage beside the button that edits them. The words are chosen in the options dialog, on each option’s own row, so the options and their words are only ever edited together. An option the stage gives no words reads as neutral, and an entry for a value the attribute no longer has is dropped from the mapping.',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'Person attributes',
    children: <GenderIdentityWordsSummary />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing mapped yet: every option reads as neutral words. */
export const NothingMapped: Story = {
  globals: { appLocale: 'en' },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();

    await expect(await rowsOf(canvasElement)).toEqual(
      OPTIONS.map(({ label }) => [label.en, 'Neutral words (parent, sibling)']),
    );
  },
};

/** The mapping as the stage holds it, including an option left out of it. */
export const HoldingAMapping: Story = {
  globals: { appLocale: 'en' },
  args: {
    children: (
      <GenderIdentityWordsSummary
        initialValue={[
          { value: 'woman', words: 'feminine' },
          { value: 'man', words: 'masculine' },
          { value: 'unknown', words: 'unknown' },
        ]}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();

    await expect(await rowsOf(canvasElement)).toEqual([
      ['Woman', 'Feminine words (mother, sister)'],
      ['Man', 'Masculine words (father, brother)'],
      ['Trans woman', 'Neutral words (parent, sibling)'],
      [
        'Don’t know',
        'Not known (neutral words; biological mother or father for a biological parent)',
      ],
    ]);
    // Read-only: nothing on it to change.
    await expect(within(canvasElement).queryByRole('combobox')).toBeNull();
  },
};
