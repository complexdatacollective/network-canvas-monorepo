import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';

import NetworkSummary from './NetworkSummary';

const sequences = Array.from({ length: 9 }, (_, index) => index + 1);

const meta = {
  title: 'Dashboard/InterviewsTable/NetworkSummary',
  component: NetworkSummary,
  parameters: {
    layout: 'centered',
  },
  args: {
    network: {
      nodes: [],
      edges: sequences.map((sequence) => ({
        type: `edge-${String(sequence)}`,
        count: sequence,
        name: `Edge ${String(sequence)}`,
        color: `edge-color-seq-${String(sequence)}`,
      })),
    },
  },
} satisfies Meta<typeof NetworkSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

const BLACK = 'rgb(0, 0, 0)';

// Each glyph draws its links in a darker shade of the edge colour, derived in
// CSS with a relative colour expression. An expression the browser rejects
// leaves the custom property invalid, and the links fall back to black.
export const EveryEdgeColor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const sequence of sequences) {
      const label = canvas.getByText(
        `Edge ${String(sequence)} (${String(sequence)})`,
      );
      const glyph = label.parentElement?.querySelector('svg');
      const link = glyph?.querySelector('circle');
      const end = glyph?.querySelector('path');
      if (!link || !end) {
        throw new Error(`Edge ${String(sequence)} has no glyph`);
      }

      const dark = getComputedStyle(link).fill;
      const light = getComputedStyle(end).fill;
      await expect({ sequence, light }).not.toEqual({ sequence, light: BLACK });
      await expect({ sequence, dark }).not.toEqual({ sequence, dark: BLACK });
      await expect({ sequence, dark }).not.toEqual({ sequence, dark: light });
    }
  },
};
