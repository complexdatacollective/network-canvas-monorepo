import type { Meta, StoryObj } from '@storybook/react-vite';

import { BrandHeader } from './BrandHeader';

// The app logo + "Interviewer" wordmark shown at the top of Home. Pure
// presentation — no props, no context reads — so it's storied directly.

const meta: Meta<typeof BrandHeader> = {
  title: 'Components/BrandHeader',
  component: BrandHeader,
  tags: ['autodocs'],
  render: () => <BrandHeader />,
  parameters: {
    docs: {
      description: {
        component:
          'The Home header brand scales down in tablet landscape to preserve vertical space, then returns to its larger presentation at laptop widths.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};

export const TabletLandscape: Story = {
  globals: {
    viewport: {
      value: 'tablet',
      isRotated: true,
    },
  },
};
