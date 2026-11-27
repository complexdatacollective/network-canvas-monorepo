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
  title: 'Protocol Builder/Fields/Dynamic text/Rules of each case',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The rules of an “If” and of each “Else if” of a dynamic attribute or a logic block. Each “Else if” has its own rules and its own version, and can be removed.',
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

/**
 * An “Else if” adds a second set of rules, and a version for it; removed, the
 * rules of the “If” are the only ones again.
 */
export const AddingAnElseIf: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('textbox', { name: CONTENT_LABEL }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    await userEvent.click(
      await body.findByRole('option', { name: 'Create dynamic attribute' }),
    );
    const dialog = within(
      await body.findByRole('dialog', { name: 'Create a dynamic attribute' }),
    );
    await expect(dialog.getByText('Rules')).toBeVisible();

    await userEvent.click(dialog.getByRole('button', { name: 'Add else if' }));
    await expect(await dialog.findByText('Rules for “If”')).toBeVisible();
    await expect(dialog.getByText('Rules for “Else if” 1')).toBeVisible();
    await expect(
      dialog.getByRole('textbox', { name: 'Else if: (no rules yet)' }),
    ).toBeVisible();

    await userEvent.click(
      dialog.getByRole('button', { name: 'Remove this case' }),
    );
    await waitFor(async () => {
      await expect(dialog.queryByText('Rules for “Else if” 1')).toBeNull();
    });
    await expect(dialog.getByText('Rules')).toBeVisible();
  },
};
