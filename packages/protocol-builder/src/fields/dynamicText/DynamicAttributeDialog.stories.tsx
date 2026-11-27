import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import {
  CONTENT_LABEL,
  INFORMATION_STAGE,
  pageContentField,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Create a dynamic attribute',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The dialog that creates a dynamic attribute: a word or phrase that reads differently in different cases. It is opened from the Attribute menu; once created, the dynamic attribute’s pill is put into the text where the menu was opened.',
      },
    },
  },
  args: {
    stageId: INFORMATION_STAGE,
    sectionTitle: 'Content',
    children: pageContentField,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

const openDialog = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await awaitPassiveEffects();
  const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
  await userEvent.click(editor);
  await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
  await userEvent.click(
    await body.findByRole('option', { name: 'Create dynamic attribute' }),
  );
  const dialog = await body.findByRole('dialog', {
    name: 'Create a dynamic attribute',
  });
  return { editor, dialog: within(dialog) };
};

/**
 * A case without rules is pointed out when the dialog is sent, and nothing is
 * put into the text. Its versions may stay empty: each shows nothing.
 */
export const RefusedWhileIncomplete: Story = {
  play: async ({ canvasElement }) => {
    const { editor, dialog } = await openDialog(canvasElement);
    await userEvent.click(
      dialog.getByRole('button', { name: 'Create dynamic attribute' }),
    );
    await expect(
      await dialog.findByText('Add at least one rule.'),
    ).toBeVisible();
    await expect(dialog.queryByText(/^Write /)).toBeNull();
    await expect(editor.querySelector('[data-inline-value]')).toBeNull();
  },
};

/** Cancelled, nothing is put into the text. */
export const Cancelled: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const { editor, dialog } = await openDialog(canvasElement);
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(async () => {
      await expect(
        body.queryByRole('dialog', { name: 'Create a dynamic attribute' }),
      ).toBeNull();
    });
    await expect(editor.querySelector('[data-inline-value]')).toBeNull();
  },
};
