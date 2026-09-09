import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '../../storybook-support/awaitPassiveEffects';
import Paragraph from '../../typography/Paragraph';
import Field from '../Field/Field';
import UnconnectedField from '../Field/UnconnectedField';
import Form from '../Form';
import SubmitButton from '../SubmitButton';
import ColorPickerField, { type ColorSwatchOption } from './ColorPicker';

const nodePalette: ColorSwatchOption[] = [
  { value: 'node-color-seq-1', label: 'Sea Green' },
  { value: 'node-color-seq-2', label: 'Sea Serpent' },
  { value: 'node-color-seq-3', label: 'Purple Pizazz' },
  { value: 'node-color-seq-4', label: 'Neon Carrot' },
  { value: 'node-color-seq-5', label: 'Barbie Pink' },
  { value: 'node-color-seq-6', label: 'Cerulean Blue' },
  { value: 'node-color-seq-7', label: 'Kiwi' },
  { value: 'node-color-seq-8', label: 'Mustard' },
];

const edgePalette: ColorSwatchOption[] = [
  { value: 'edge-color-seq-1', label: 'Edge Purple' },
  { value: 'edge-color-seq-2', label: 'Edge Teal' },
  { value: 'edge-color-seq-3', label: 'Edge Orange' },
  { value: 'edge-color-seq-4', label: 'Edge Green' },
];

const cssColorPalette: ColorSwatchOption[] = [
  { value: 'rebeccapurple', label: 'Rebecca Purple' },
  { value: '#0f7b6c', label: 'Pine' },
  { value: 'oklch(0.72 0.19 45)', label: 'Ember' },
];

const meta = {
  title: 'Systems/Form/Fields/ColorPicker',
  component: ColorPickerField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
A palette of colour swatches, chosen one at a time.

\`\`\`tsx
import Field from '@codaco/fresco-ui/form/Field/Field';
import ColorPickerField from '@codaco/fresco-ui/form/fields/ColorPicker';

<Field
  name="color"
  label="Node color"
  component={ColorPickerField}
  options={[
    { value: 'node-color-seq-1', label: 'Sea Green' },
    { value: 'node-color-seq-2', label: 'Sea Serpent' },
  ]}
  required
/>;
\`\`\`

- \`options\` — the palette, in the order the swatches are offered. Each entry
  is \`{ value, label }\`: \`value\` is what the form stores AND the colour the
  swatch paints with; \`label\` is the swatch's accessible name.
- A value naming one of the theme's colour sequences
  (\`node-\`/\`edge-\`/\`ord-\`/\`cat-color-seq-N\`) paints with that sequence's
  design token, so it re-resolves inside a themed region. Any other value is
  used as a CSS colour verbatim.
- The chosen swatch is marked by an outline ring standing off it — a change of
  shape, so the selection is legible without perceiving the colour at all.
- Labelling belongs to the surrounding field: use it as the \`component\` of a
  \`<Field>\`, or of an \`UnconnectedField\` when the value is not the form's.
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    'aria-invalid': { control: 'boolean' },
    'disabled': { control: 'boolean' },
    'readOnly': { control: 'boolean' },
    'options': { control: false },
  },
  args: {
    'options': nodePalette,
    'aria-label': 'Node color',
  },
} satisfies Meta<typeof ColorPickerField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelection: Story = {
  args: {
    value: 'node-color-seq-3',
  },
};

/** Any palette the theme publishes as a colour sequence, not only node colours. */
export const EdgePalette: Story = {
  args: {
    'options': edgePalette,
    'value': 'edge-color-seq-2',
    'aria-label': 'Edge color',
  },
};

/** A palette that is not one of the theme's sequences: plain CSS colours. */
export const CssColors: Story = {
  args: {
    'options': cssColorPalette,
    'value': '#0f7b6c',
    'aria-label': 'Brand color',
  },
};

export const Disabled: Story = {
  args: {
    value: 'node-color-seq-2',
    disabled: true,
  },
};

export const ReadOnly: Story = {
  args: {
    value: 'node-color-seq-2',
    readOnly: true,
  },
};

/** A caller with nothing to offer says so, rather than showing an empty box. */
export const EmptyPalette: Story = {
  args: {
    options: [],
  },
};

/** The swatches wrap: the group shrinks with its container, never past it. */
export const NarrowContainer: Story = {
  args: {
    value: 'node-color-seq-5',
  },
  render: (args) => (
    <div className="w-56">
      <ColorPickerField {...args} />
    </div>
  ),
};

function KeyboardSelectionExample() {
  const [color, setColor] = useState<string | undefined>(undefined);

  return (
    <>
      <UnconnectedField
        name="color"
        label="Node color"
        component={ColorPickerField}
        options={nodePalette}
        value={color}
        onChange={setColor}
      />
      <Paragraph margin="none">
        Value:&nbsp;
        <span data-testid="chosen-color">{color ?? 'unset'}</span>
      </Paragraph>
    </>
  );
}

/**
 * The palette is fully operable from the keyboard: Space chooses the focused
 * swatch, and the arrow keys move through the palette, choosing as they go.
 */
export const KeyboardSelection: Story = {
  render: () => <KeyboardSelectionExample />,
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const chosen = canvas.getByTestId('chosen-color');
    const swatch = (name: string) => canvas.getByRole('radio', { name });

    await expect(chosen).toHaveTextContent('unset');

    // Nothing is chosen, so the group's tab stop is its first swatch.
    await userEvent.tab();
    await expect(swatch('Sea Green')).toHaveFocus();

    await userEvent.keyboard(' ');
    await expect(chosen).toHaveTextContent('node-color-seq-1');
    await expect(swatch('Sea Green')).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(chosen).toHaveTextContent('node-color-seq-3');
    await expect(swatch('Purple Pizazz')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await userEvent.keyboard('{ArrowLeft}');
    await expect(chosen).toHaveTextContent('node-color-seq-2');
    await expect(swatch('Sea Serpent')).toHaveAttribute('aria-checked', 'true');

    // Take focus off the palette, so what is left on the chosen swatch is the
    // selection ring and not a focus ring: the selection has to be legible
    // without perceiving the swatch's colour, and an outline is the shape
    // change that makes it so.
    await userEvent.tab();
    await expect(swatch('Sea Serpent')).not.toHaveFocus();
    // `outlineStyle`, not width or offset: an unchosen swatch reports its
    // would-be width with `outline-style: none`, and the chosen one's offset
    // is still easing out of the hover value when the play reads it.
    await expect(getComputedStyle(swatch('Sea Serpent')).outlineStyle).toBe(
      'solid',
    );
    await expect(getComputedStyle(swatch('Kiwi')).outlineStyle).toBe('none');
  },
};

function ErrorStateExample() {
  return (
    <Form onSubmit={() => ({ success: true })}>
      <Field
        name="color"
        label="Node color"
        hint="Interviewers see this color wherever this type appears."
        component={ColorPickerField}
        options={nodePalette}
        required
      />
      <SubmitButton>Save</SubmitButton>
    </Form>
  );
}

/**
 * Left unanswered, the palette reports the same way every other field does:
 * the group is marked invalid and the field's own error region says why.
 */
export const ErrorState: Story = {
  render: () => <ErrorStateExample />,
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: 'Node color' });

    await expect(group).toHaveAttribute('aria-required', 'true');
    await expect(group).not.toHaveAttribute('aria-invalid', 'true');

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    await expect(group).toHaveAttribute('aria-invalid', 'true');
    await expect(
      await canvas.findByText(
        'You must answer this question before continuing.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('radio', { name: 'Kiwi' }));

    await expect(group).not.toHaveAttribute('aria-invalid', 'true');
  },
};
