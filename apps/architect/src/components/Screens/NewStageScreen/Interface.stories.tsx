import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';

import Interface from './Interface';

const PHONE_WIDTH = 390;

const meta = {
  title: 'Components/NewStageScreen/Interface',
  component: Interface,
  parameters: { layout: 'fullscreen' },
  args: {
    type: 'NameGenerator',
    onClick: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: PHONE_WIDTH }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Interface>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AtPhoneWidth: Story = {
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('button');
    const cardRight = card.getBoundingClientRect().right;

    const ids = [
      ...(card.getAttribute('aria-labelledby') ?? '').split(' '),
      ...(card.getAttribute('aria-describedby') ?? '').split(' '),
    ].filter(Boolean);

    expect(ids).toHaveLength(3);

    for (const id of ids) {
      const region = document.getElementById(id);
      if (!region) throw new Error(`card region ${id} not rendered`);

      expect(region.getBoundingClientRect().right).toBeLessThanOrEqual(
        cardRight,
      );
      expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth + 1);
    }

    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  },
};
