import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { unsupportedResourceKindMessage } from '../resources/components/resourceKinds.ts';
import { ResourceRefusal } from './ResourceRefusal.tsx';

// What a refusal is held as until it is drawn: a message error, encoded.
const ENCODED = '@codaco/app-i18n/error/v1:';

const meta = {
  title: 'Protocol Builder/Fields/Resource refusal',
  component: ResourceRefusal,
  args: { message: unsupportedResourceKindMessage('image') },
} satisfies Meta<typeof ResourceRefusal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A file of a kind the field cannot hold, chosen anyway: announced as it
 * appears, in words, with the kinds the field does take.
 */
export const AKindTheFieldCannotHold: Story = {
  play: async ({ canvasElement }) => {
    const refusal = within(canvasElement).getByRole('alert');
    await expect(refusal).toHaveTextContent(
      'That resource cannot be used in this field. It accepts: Image.',
    );
    await expect(refusal).toBeVisible();
  },
};

/**
 * The same refusal on screen once the interface is in another language: it
 * is held encoded and read as it is drawn, so it says the language chosen
 * now, not the one it was refused in.
 */
export const InTheLanguageNowChosen: Story = {
  globals: { appLocale: 'de' },
  play: async ({ canvasElement }) => {
    const refusal = within(canvasElement).getByRole('alert');
    // Not the English, and not the encoded message the field holds.
    await expect(refusal.textContent).not.toMatch(
      /That resource cannot be used/,
    );
    await expect(refusal.textContent).not.toContain(ENCODED);
    await expect(refusal.textContent?.trim()).not.toBe('');
  },
};

/** A reason the host gave in words of its own, shown as it came. */
export const AReasonInTheHostsOwnWords: Story = {
  args: { message: 'The file is still being uploaded.' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'The file is still being uploaded.',
    );
  },
};
