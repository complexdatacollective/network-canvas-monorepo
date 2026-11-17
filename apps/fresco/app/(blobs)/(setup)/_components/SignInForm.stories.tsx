import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';

import { SignInForm } from './SignInForm';

const meta = {
  title: 'Setup/SignInForm',
  component: SignInForm,
  parameters: {
    layout: 'centered',
    nextjs: { appDirectory: true },
  },
} satisfies Meta<typeof SignInForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// A "back" arrow points at where the reader came from: left, or right in a
// right-to-left language. The icon is drawn pointing left.
async function backArrowRotation(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    canvas.getByRole('button', { name: /Trouble signing in/ }),
  );
  const arrow = (
    await canvas.findByRole('button', { name: 'Back to sign in' })
  ).querySelector('svg');
  if (!arrow) {
    throw new Error('The back button has no arrow');
  }
  return getComputedStyle(arrow).rotate;
}

export const RecoveryCodeStep: Story = {
  play: async ({ canvasElement }) => {
    await expect(await backArrowRotation(canvasElement)).toBe('none');
  },
};

export const RecoveryCodeStepRightToLeft: Story = {
  globals: { appDirection: 'rtl' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.ownerDocument.documentElement.dir).toBe('rtl');
    await expect(await backArrowRotation(canvasElement)).toBe('180deg');
  },
};
