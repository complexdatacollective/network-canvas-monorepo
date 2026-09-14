import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import ShapePickerField from './ShapePickerField.tsx';

/**
 * A stage key to hang the control on. The picker belongs to the codebook's
 * entity editor rather than to any stage, and what a story of a field shows is
 * the control: the key only has to be one the form store can hold.
 */
const SHAPE_FIELD = 'shape';

function ShapePicker({
  initialValue,
  nodeColor,
  readOnly = false,
  required = false,
}: Readonly<{
  initialValue?: string;
  nodeColor?: string;
  readOnly?: boolean;
  required?: string;
}>) {
  return (
    <Field<typeof ShapePickerField>
      name={SHAPE_FIELD}
      component={ShapePickerField}
      label="Default shape"
      hint="Choose a default shape for this node type."
      {...(initialValue === undefined ? {} : { initialValue })}
      {...(nodeColor === undefined ? {} : { nodeColor })}
      readOnly={readOnly}
      {...(required === undefined ? {} : { required })}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Shape picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Which shape a node type is drawn as, chosen from the shapes themselves. Architect’s own control, and the reason for it is that the researcher is choosing what a participant will see: a swatch tinted with the type’s live colour answers “what will this look like?” where a list of the words circle, square and diamond does not. Used for the type’s default shape and for every row of its shape mapping, which are the same question asked about different values.',
      },
    },
  },
  args: {
    stageId: 'sociogram-1',
    sectionTitle: 'Node appearance',
    children: <ShapePicker />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A type nobody has chosen a shape for yet: no swatch is the answer. */
export const NothingChosen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the control is drawn
    // a turn after the story mounts.
    await awaitPassiveEffects();

    const group = await canvas.findByRole('radiogroup', {
      name: 'Default shape',
    });
    for (const swatch of within(group).getAllByRole('radio')) {
      await expect(swatch).toHaveAttribute('aria-checked', 'false');
    }
  },
};

/** The type as the protocol holds it, drawn in the type's own colour. */
export const HoldingAShape: Story = {
  args: {
    children: (
      <ShapePicker initialValue="diamond" nodeColor="node-color-seq-4" />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('radio', { name: 'Select shape Diamond' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

/** A type somebody else is editing: the answer is shown and not offered. */
export const ReadOnly: Story = {
  args: {
    children: <ShapePicker initialValue="square" readOnly />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const group = await canvas.findByRole('radiogroup', {
      name: 'Default shape',
    });
    await expect(group).toHaveAttribute('aria-readonly', 'true');
    await expect(
      within(group).getByRole('radio', { name: 'Select shape Square' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

/**
 * Choosing one: the answer moves to the swatch pressed, and only that one is
 * left marked.
 */
export const ChoosingAShape: Story = {
  args: {
    children: <ShapePicker initialValue="circle" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const group = await canvas.findByRole('radiogroup', {
      name: 'Default shape',
    });
    await userEvent.click(
      within(group).getByRole('radio', { name: 'Select shape Square' }),
    );

    await expect(
      within(group).getByRole('radio', { name: 'Select shape Square' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      within(group).getByRole('radio', { name: 'Select shape Circle' }),
    ).toHaveAttribute('aria-checked', 'false');
  },
};
