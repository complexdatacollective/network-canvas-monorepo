import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import RangeFilter from './RangeFilter';
import type { RangeFilterValue } from './types';

const meta = {
  title: 'Components/DataTable/RangeFilter',
  component: RangeFilter,
  parameters: { layout: 'centered' },
  args: {
    value: { min: 25, max: 50 },
    config: { type: 'range', min: 0, max: 100 },
    onChange: () => undefined,
  },
  render: function Render(args) {
    const [value, setValue] = useState<RangeFilterValue | undefined>(
      args.value,
    );
    return (
      <div className="w-80">
        <RangeFilter {...args} value={value} onChange={setValue} />
      </div>
    );
  },
} satisfies Meta<typeof RangeFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * A native range input runs from the right in a right-to-left language, so
 * the bar that fills the chosen range has to be measured from the right too.
 * Measured from the left it would sit over the wrong stretch of the track,
 * away from both thumbs.
 */
export const RightToLeft: Story = {
  globals: { appDirection: 'rtl' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.documentElement.dir).toBe('rtl');

    const minimum = canvas.getByRole('slider', { name: 'Minimum' });
    const track = minimum.parentElement!.getBoundingClientRect();
    const filled = minimum.previousElementSibling!.getBoundingClientRect();

    // 25 to 50 of 100: a quarter of the way in from the right, to half-way.
    await expect(
      Math.abs(filled.right - (track.right - track.width * 0.25)),
    ).toBeLessThan(1);
    await expect(
      Math.abs(filled.left - (track.right - track.width * 0.5)),
    ).toBeLessThan(1);
  },
};
