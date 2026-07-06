import type { Meta, StoryObj } from '@storybook/react-vite';

import { ViewSwitcher } from './ViewSwitcher';

// The Home protocols/data switcher — a route-driven SegmentedSwitcher (size lg)
// whose segments are wouter Links. Active state follows the URL.
const meta: Meta<typeof ViewSwitcher> = {
  title: 'Components/ViewSwitcher',
  component: ViewSwitcher,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ViewSwitcher>;

export const Default: Story = {};
