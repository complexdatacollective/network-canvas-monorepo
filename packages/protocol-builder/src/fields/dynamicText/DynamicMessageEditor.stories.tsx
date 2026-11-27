import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import {
  CONTENT_LABEL,
  GREETING_NAME,
  INFORMATION_STAGE,
  pageContentField,
  seedPageWithLogic,
  SHOWN_WHEN_MET,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Editor',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor of text that a participant reads, as every field with values the interview fills in draws it. Each value is a pill among the words, each logic block is a frame with one part for each case, and the text is saved as the message that the interview reads.',
      },
    },
  },
  args: {
    stageId: INFORMATION_STAGE,
    sectionTitle: 'Content',
    children: pageContentField,
    seedEdit: seedPageWithLogic,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The page's values are pills, and its logic block is a frame with the
 * content of each case.
 */
export const ValuesAndLogic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
    await waitFor(async () => {
      await expect(
        editor.querySelector('[data-inline-value="now"]'),
      ).not.toBeNull();
    });
    await expect(
      editor.querySelector(`[data-inline-value="${GREETING_NAME}"]`),
    ).not.toBeNull();
    await expect(
      editor.querySelector('[data-logic-block-view]'),
    ).not.toBeNull();
    await expect(editor).toHaveTextContent(SHOWN_WHEN_MET);
  },
};

/** Words typed beside the values are saved with the values kept in place. */
export const EditingAroundTheValues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
    const heading = await waitFor(() => {
      const found = editor.querySelector('h1');
      if (found === null) throw new Error('No heading yet');
      return found;
    });
    await userEvent.click(heading);
    await userEvent.keyboard('Hello');

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    const status = canvas.getByRole('status', { name: 'Save status' });
    await waitFor(async () => {
      await expect(status).toHaveTextContent('Hello');
    });
    await expect(status).toHaveTextContent(`{${GREETING_NAME}}`);
    await expect(status).toHaveTextContent('{now}');
    await expect(status).toHaveTextContent(SHOWN_WHEN_MET);
  },
};
