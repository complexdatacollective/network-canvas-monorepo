import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import {
  CONTENT_LABEL,
  INFORMATION_STAGE,
  pageContentField,
  seedPageWithLogic,
  SHOWN_WHEN_MET,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Logic block',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Content of a page that is shown only in some cases. The frame names its logic and has a part for each case, labelled with the rules or the answer for which that part is shown; the last part is shown otherwise.',
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

/** Each part of the block is labelled with the case in which it is shown. */
export const ABlockOfThePage: Story = {
  args: { seedEdit: seedPageWithLogic },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
    await waitFor(async () => {
      await expect(
        editor.querySelectorAll('[data-logic-branch-view]'),
      ).toHaveLength(2);
    });
    const frame = editor.querySelector<HTMLElement>('[data-logic-block-view]');
    await expect(frame).toHaveTextContent(/If: .*ego_name/);
    await expect(frame).toHaveTextContent('Otherwise');
    await expect(frame).toHaveTextContent(SHOWN_WHEN_MET);
  },
};

/**
 * A logic block put in from the toolbar opens its settings at once, with one
 * part for when its rules are met and one for otherwise.
 */
export const PutInFromTheToolbar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
    await userEvent.click(editor);
    await userEvent.click(canvas.getByRole('button', { name: 'Logic block' }));

    const settings = await body.findByRole('dialog', {
      name: 'Logic block settings',
    });
    await expect(within(settings).getByText('Logic')).toBeVisible();
    await waitFor(async () => {
      await expect(editor).toHaveTextContent('Otherwise');
    });
    await expect(
      editor.querySelectorAll('[data-logic-branch-view]').length,
    ).toBeGreaterThanOrEqual(2);
  },
};
