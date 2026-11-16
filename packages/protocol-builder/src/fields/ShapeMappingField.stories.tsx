import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import type { OptionMappingValue } from '@codaco/fresco-ui/form/fields/OptionMappingField';

import type { CustomShapes } from '../codebook/customShapes.ts';
import { ProtocolWithShapeImages } from '../testing/ProtocolWithShapeImages.tsx';
import ShapeMappingField from './ShapeMappingField.tsx';

const ROWS = [
  { id: 'home', label: 'Home' },
  { id: 'school', label: 'School' },
  { id: 'work', label: 'Work' },
];

const CUSTOM_SHAPES: CustomShapes = {
  home: { name: 'House', asset: 'home-image' },
  school: { name: 'Schoolhouse', asset: 'school-image' },
};

function ShapeMapping({
  initialValue,
  customShapes,
  readOnly = false,
}: Readonly<{
  initialValue?: OptionMappingValue;
  customShapes?: CustomShapes;
  readOnly?: boolean;
}>) {
  const [value, setValue] = useState(initialValue);
  return (
    <UnconnectedField
      name="shapeMapping"
      label="Shape for each value"
      component={ShapeMappingField}
      rows={ROWS}
      nodeColor="node-color-seq-4"
      {...(customShapes === undefined ? {} : { customShapes })}
      value={value}
      onChange={setValue}
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
    initialValue: [{ id: 'home', value: 'square' }],
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
    initialValue: [
      { id: 'home', value: 'custom:home' },
      { id: 'school', value: 'custom:school' },
    ],
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
    initialValue: [{ id: 'home', value: 'square' }],
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
