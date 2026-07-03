import type { Meta, StoryObj } from '@storybook/react-vite';

import { BrandHeader } from './BrandHeader';

// The app logo + "Interviewer" wordmark shown at the top of Home. Pure
// presentation — no props, no context reads — so it's storied directly.

const meta: Meta = {
  title: 'Components/BrandHeader',
  render: () => <BrandHeader />,
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};
