import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { NodeShapeReference } from '@codaco/protocol-validation';

import type { CustomShapes } from '../codebook/customShapes.ts';
import { ProtocolWithShapeImages } from '../testing/ProtocolWithShapeImages.tsx';
import ShapeMappingField from './ShapeMappingField.tsx';

const ANSWERS = [
  { value: 'home', label: 'Home' },
  { value: 'school', label: 'School' },
  { value: 'work', label: 'Work' },
];

const CUSTOM_SHAPES: CustomShapes = {
  home: { name: 'House', asset: 'home-image' },
  school: { name: 'Schoolhouse', asset: 'school-image' },
};

function ShapeMapping({
  initialValue = {},
  customShapes,
  readOnly = false,
}: Readonly<{
  /** The shape chosen for each answer so far, keyed by answer. */
  initialValue?: Readonly<Record<string, NodeShapeReference>>;
  customShapes?: CustomShapes;
  readOnly?: boolean;
}>) {
  const [value, setValue] = useState(initialValue);
  return (
    <ShapeMappingField
      name="shapeMapping"
      label="Shape for each value"
      answers={ANSWERS}
      shapeFor={(answer) => value[answer]}
      onShapeChange={(answer, shape) =>
        setValue((current) => ({ ...current, [answer]: shape }))
      }
      nodeColor="node-color-seq-4"
      {...(customShapes === undefined ? {} : { customShapes })}
      readOnly={readOnly}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Shape mapping',
  component: ShapeMapping,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The shape a node is drawn as for each value of one of its attributes. Each row offers the built-in shapes and then the node type’s own shapes; a value with no shape chosen uses the default shape.',
      },
    },
  },
  decorators: [
    (Story) => (
      <ProtocolWithShapeImages>
        <main className="mx-auto max-w-3xl p-6">
          <Story />
        </main>
      </ProtocolWithShapeImages>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ShapeMapping>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Built-in shapes only: choosing one for a value marks that row as mapped. */
export const BuiltInShapes: Story = {
  args: {
    initialValue: { home: 'square' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const school = await canvas.findByRole('radiogroup', { name: 'School' });

    await userEvent.click(
      within(school).getByRole('radio', { name: 'Select shape Diamond' }),
    );

    await expect(
      within(school).getByRole('radio', { name: 'Select shape Diamond' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getAllByText('Uses the default shape')).toHaveLength(1);
  },
};

/** With the node type’s own shapes offered after the built-in ones. */
export const WithCustomShapes: Story = {
  args: {
    customShapes: CUSTOM_SHAPES,
    initialValue: { home: 'custom:home', school: 'custom:school' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const home = await canvas.findByRole('radiogroup', { name: 'Home' });

    await expect(
      within(home).getByRole('radio', { name: 'Select shape House' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

/** Somebody else is editing: the mapping is shown and cannot be changed. */
export const ReadOnly: Story = {
  args: {
    readOnly: true,
    initialValue: { home: 'square' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const home = await canvas.findByRole('radiogroup', { name: 'Home' });

    await userEvent.click(
      within(home).getByRole('radio', { name: 'Select shape Circle' }),
    );

    await expect(
      within(home).getByRole('radio', { name: 'Select shape Square' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};
