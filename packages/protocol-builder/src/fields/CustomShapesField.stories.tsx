import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';

import type {
  CustomShapes,
  CustomShapeUsage,
} from '../codebook/customShapes.ts';
import { ResourceClientProvider } from '../resources/client.tsx';
import { ProtocolWithShapeImages } from '../testing/ProtocolWithShapeImages.tsx';
import CustomShapesField from './CustomShapesField.tsx';

const TWO_SHAPES: CustomShapes = {
  home: { name: 'Home', asset: 'home-image' },
  school: { name: 'School', asset: 'school-image' },
};

function CustomShapesEditor({
  initialValue,
  usage,
  disabled = false,
}: Readonly<{
  initialValue?: CustomShapes;
  usage?: Readonly<Record<string, CustomShapeUsage>>;
  disabled?: boolean;
}>) {
  const [value, setValue] = useState(initialValue);
  return (
    <UnconnectedField
      name="customShapes"
      label="Custom shapes"
      component={CustomShapesField}
      value={value}
      onChange={setValue}
      nodeColor="node-color-seq-4"
      {...(usage === undefined ? {} : { usage })}
      disabled={disabled}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Custom shapes',
  component: CustomShapesEditor,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A node type’s own shapes, each drawn from an SVG image in the protocol’s resources. “Add a shape” opens the resource browser; a shape the type uses cannot be removed.',
      },
    },
  },
  decorators: [
    (Story) => (
      <ProtocolWithShapeImages>
        <ResourceClientProvider>
          <main className="mx-auto max-w-3xl p-6">
            <Story />
          </main>
        </ResourceClientProvider>
      </ProtocolWithShapeImages>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof CustomShapesEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A type with no shapes of its own: choosing an image adds one. */
export const NoShapesYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Add a shape' }),
    );

    const browser = within(
      await screen.findByRole('dialog', { name: 'Choose a node shape' }),
    );
    await userEvent.click(
      await browser.findByRole('button', { name: 'school.svg' }),
    );

    await expect(await canvas.findByDisplayValue('school')).toBeVisible();
  },
};

/** Two shapes, one of them the default shape, which cannot be removed. */
export const TwoShapes: Story = {
  args: {
    initialValue: TWO_SHAPES,
    usage: { home: 'default' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('button', { name: 'Remove shape Home' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Remove shape School' }),
    ).toBeEnabled();
  },
};

/** A type that cannot be edited: the shapes are shown and nothing is offered. */
export const Locked: Story = {
  args: {
    initialValue: TWO_SHAPES,
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('button', { name: 'Add a shape' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Remove shape School' }),
    ).toBeDisabled();
  },
};
