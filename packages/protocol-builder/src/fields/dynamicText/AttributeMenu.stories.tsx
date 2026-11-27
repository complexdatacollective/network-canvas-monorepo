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
  title: 'Protocol Builder/Fields/Dynamic text/Attribute menu',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The list of what a text can show, opened from the Attribute button or by typing `{`. Values are grouped by whose they are: the node’s, the participant’s, the stage’s dynamic attributes (with a row that creates one), then the interview’s. A value that cannot be shown here stays in its place, unavailable, with the reason.',
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

/** Opened from the toolbar: each group under its heading. */
export const FromTheToolbar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
    await userEvent.click(editor);
    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    const menu = within(
      await body.findByRole('dialog', { name: 'Insert an attribute' }),
    );
    await expect(menu.getByText('Ego attributes')).toBeVisible();
    await expect(menu.getByText('Dynamic attributes')).toBeVisible();
    await expect(menu.getByText('Interview attributes')).toBeVisible();
    await expect(
      menu.getByRole('option', { name: 'Create dynamic attribute' }),
    ).toBeVisible();

    await userEvent.click(menu.getByRole('option', { name: /^ego_name/ }));
    await waitFor(async () => {
      await expect(
        editor.querySelector('[data-inline-value^="ego_"]'),
      ).not.toBeNull();
    });
  },
};

/** Typing `{` opens the same list where the caret is. */
export const FromABrace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
    await userEvent.click(editor);
    await userEvent.keyboard('{{');
    await expect(
      await body.findByRole('dialog', { name: 'Insert an attribute' }),
    ).toBeVisible();
  },
};
