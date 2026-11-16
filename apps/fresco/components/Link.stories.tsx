import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';

import Link from './Link';

const meta = {
  title: 'Components/Link',
  component: Link,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/dashboard',
    children: 'Read the deployment guide',
  },
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

// The underline is a background that grows from zero width on hover, so where
// it is anchored is the edge it grows from.
const underlineAnchor = (canvasElement: HTMLElement) => {
  const label = within(canvasElement).getByText('Read the deployment guide');
  return getComputedStyle(label).backgroundPositionX;
};

/** The underline grows from the start of the text: the left, here. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(underlineAnchor(canvasElement)).toBe('0%');
  },
};

/** In a right-to-left language the text starts on the right, and so does the underline. */
export const InARightToLeftLanguage: Story = {
  globals: { appDirection: 'rtl' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.ownerDocument.documentElement.dir).toBe('rtl');
    await expect(underlineAnchor(canvasElement)).toBe('100%');
  },
};
