import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import {
  CONTENT_LABEL,
  GREETING_NAME,
  GREETING_WHEN_MET,
  INFORMATION_STAGE,
  pageContentField,
  seedPageWithLogic,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Dynamic attribute popover',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The settings of a dynamic attribute, opened from its pill. A change applies everywhere that the dynamic attribute is used on the stage; the wording is the editing language’s. The pill can also be taken out of this text, which leaves the dynamic attribute for the other places that use it.',
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

const openFromThePill = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await awaitPassiveEffects();
  const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
  const pill = await waitFor(() => {
    const found = editor.querySelector<HTMLElement>(
      `[data-inline-value="${GREETING_NAME}"]`,
    );
    if (found === null) throw new Error('No pill yet');
    return found;
  });
  // The editor finds what was clicked from where the pointer is, so the
  // click is made at the middle of the pill.
  const { left, top, width, height } = pill.getBoundingClientRect();
  await userEvent.pointer({
    keys: '[MouseLeft]',
    target: pill,
    coords: { clientX: left + width / 2, clientY: top + height / 2 },
  });
  const popover = await body.findByRole('dialog', {
    name: 'Dynamic attribute',
  });
  return { editor, popover: within(popover) };
};

/** The popover shows the wording of each case, and edits it in place. */
export const EditingTheWording: Story = {
  play: async ({ canvasElement }) => {
    const { popover } = await openFromThePill(canvasElement);
    const met = popover
      .getAllByRole('textbox')
      .find((box) => (box as HTMLInputElement).value === GREETING_WHEN_MET);
    await expect(met).toBeDefined();
    const otherwise = popover.getByRole('textbox', { name: 'Otherwise' });
    await userEvent.clear(otherwise);
    await userEvent.type(otherwise, 'hello');
    await expect(otherwise).toHaveValue('hello');
  },
};

/** “Remove from this wording” takes the pill out of the wording. */
export const RemovedFromTheWording: Story = {
  play: async ({ canvasElement }) => {
    const { editor, popover } = await openFromThePill(canvasElement);
    await userEvent.click(
      popover.getByRole('button', { name: 'Remove from this wording' }),
    );
    await waitFor(async () => {
      await expect(
        editor.querySelector(`[data-inline-value="${GREETING_NAME}"]`),
      ).toBeNull();
    });
  },
};
