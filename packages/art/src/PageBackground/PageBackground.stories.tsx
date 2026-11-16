import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { PageBackground } from './PageBackground';

const meta: Meta<typeof PageBackground> = {
  title: 'PageBackground/Overview',
  component: PageBackground,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const layer = canvasElement.querySelector('[aria-hidden="true"]');
    await expect(layer).toBeInstanceOf(HTMLElement);
    if (!(layer instanceof HTMLElement)) return;

    const style = getComputedStyle(layer);
    await expect(style.position).toBe('fixed');
    await expect(style.pointerEvents).toBe('none');
    await expect(style.overflow).toBe('hidden');
    await expect([style.top, style.right, style.bottom, style.left]).toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ]);
  },
};
