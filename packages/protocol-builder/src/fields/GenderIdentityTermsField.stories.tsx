import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import GenderIdentityTermsField from './GenderIdentityTermsField.tsx';

/**
 * A stage key to hang the control on. What a story of a field shows is the
 * control: the key only has to be one the form store can hold.
 */
const TERMS_FIELD = 'genderIdentityTerms';

const OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'transWoman', label: 'Trans woman' },
  { value: 'unknown', label: 'Don’t know' },
];

function GenderIdentityTerms({
  initialValue,
  readOnly = false,
}: Readonly<{
  initialValue?: Record<string, unknown>[];
  readOnly?: boolean;
}>) {
  return (
    <Field<typeof GenderIdentityTermsField>
      name={TERMS_FIELD}
      component={GenderIdentityTermsField}
      label="Words for each gender identity"
      hint="Choose the kinship words each gender identity takes."
      options={OPTIONS}
      {...(initialValue === undefined ? {} : { initialValue })}
      readOnly={readOnly}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Gender identity terms',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Which kinship words each option of a Family Pedigree’s gender identity attribute takes: feminine (mother, sister), masculine (father, brother), neutral (parent, sibling), or not known, where a biological parent is named from their sex assigned at birth. One row per option of the attribute, laid out like the codebook’s shape for each value. An option the stage gives no words reads as neutral.',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'Person attributes',
    children: <GenderIdentityTerms />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing mapped yet: every option reads as neutral words. */
export const NothingMapped: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    for (const { label } of OPTIONS) {
      await expect(
        await canvas.findByRole('combobox', { name: `Words for ${label}` }),
      ).toHaveValue('neutral');
    }
  },
};

/** The mapping as the stage holds it, including an option left out of it. */
export const HoldingAMapping: Story = {
  args: {
    children: (
      <GenderIdentityTerms
        initialValue={[
          { value: 'woman', words: 'feminine' },
          { value: 'man', words: 'masculine' },
          { value: 'unknown', words: 'unknown' },
        ]}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', { name: 'Words for Woman' }),
    ).toHaveValue('feminine');
    await expect(
      canvas.getByRole('combobox', { name: 'Words for Man' }),
    ).toHaveValue('masculine');
    await expect(
      canvas.getByRole('combobox', { name: 'Words for Don’t know' }),
    ).toHaveValue('unknown');
    await expect(
      canvas.getByRole('combobox', { name: 'Words for Trans woman' }),
    ).toHaveValue('neutral');
  },
};

/** Choosing the words for one option leaves the others as they were. */
export const ChoosingWords: Story = {
  args: {
    children: (
      <GenderIdentityTerms
        initialValue={[{ value: 'woman', words: 'feminine' }]}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      await canvas.findByRole('combobox', { name: 'Words for Trans woman' }),
      'feminine',
    );

    await expect(
      canvas.getByRole('combobox', { name: 'Words for Trans woman' }),
    ).toHaveValue('feminine');
    await expect(
      canvas.getByRole('combobox', { name: 'Words for Woman' }),
    ).toHaveValue('feminine');
    await expect(
      canvas.getByRole('combobox', { name: 'Words for Man' }),
    ).toHaveValue('neutral');
  },
};

/** A stage somebody else is editing: the words are shown and not offered. */
export const ReadOnly: Story = {
  args: {
    children: (
      <GenderIdentityTerms
        initialValue={[{ value: 'woman', words: 'feminine' }]}
        readOnly
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', { name: 'Words for Woman' }),
    ).toHaveValue('feminine');
  },
};
