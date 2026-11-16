import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { PROTOCOL_NAME_MAX_LENGTH } from '~/config';

import ProtocolCard from './ProtocolCard';

const meta = {
  title: 'Protocol Summary/ProtocolCard',
  component: ProtocolCard,
  parameters: { layout: 'padded' },
  args: {
    name: 'All Interfaces',
    lastModified: null,
    schemaVersion: 9,
  },
} satisfies Meta<typeof ProtocolCard>;

export default meta;

type Story = StoryObj<typeof meta>;

const headingOf = async (canvasElement: HTMLElement) => {
  await document.fonts.ready;
  return within(canvasElement).getByRole('heading', { level: 2 });
};

export const WithinTheLimit: Story = {
  play: async ({ canvasElement }) => {
    const heading = await headingOf(canvasElement);

    await expect(getComputedStyle(heading).webkitLineClamp).toBe('none');
  },
};

/** A name from before the cap, cut to three lines with the full value on `title`. */
export const LegacyNameOverTheLimit: Story = {
  args: { name: 'A'.repeat(400) },
  play: async ({ canvasElement }) => {
    const heading = await headingOf(canvasElement);

    await expect(getComputedStyle(heading).webkitLineClamp).toBe('3');
    // The clamp really cuts the name off, rather than sitting unused on a
    // heading that never grew past three lines.
    await expect(heading.scrollHeight).toBeGreaterThan(heading.clientHeight);
  },
};

/** The cap counts graphemes, so a name of emoji at the limit is not clamped. */
export const EmojiNameAtTheLimit: Story = {
  args: { name: '🧑‍🤝‍🧑'.repeat(PROTOCOL_NAME_MAX_LENGTH) },
  play: async ({ canvasElement }) => {
    const heading = await headingOf(canvasElement);

    await expect(getComputedStyle(heading).webkitLineClamp).toBe('none');
  },
};
