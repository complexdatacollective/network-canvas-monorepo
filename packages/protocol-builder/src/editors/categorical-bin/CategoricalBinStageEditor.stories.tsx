import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { storyDialogVisible } from '../dyad-census/storyDialogVisible.ts';
import { categoricalBinStageEditor } from './CategoricalBinStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Categorical Bin',
  component: StageEditorStoryHost,
  args: {
    stageId: 'categorical-bin-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={categoricalBinStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage a participant sorts every person into named bins in. The same composition as the Ordinal Bin, with one more thing a prompt can hold: a bin for the people none of the attribute’s values describe, and the question asked as soon as someone lands in it.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening a prompt, and adding the bin for everything else. */
export const AddingTheBinForEverythingElse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('button', { name: 'Edit prompt' }));

    // The row dialog is portalled out of the canvas, so it is found on the
    // document rather than inside the editor that opened it.
    const panel = await screen.findByRole('dialog');
    const dialog = within(panel);
    await storyDialogVisible(panel);
    // The picker states what it holds as a typed pill, not as a selected
    // option: the closed control names the attribute, not its id.
    await waitFor(async () => {
      await expect(
        panel.querySelector('[data-attribute-type]'),
      ).toHaveTextContent('contactType');
    });

    // Offered only once the bins themselves are chosen, and off until the
    // researcher asks for it.
    const followUp = dialog.getByRole('switch', {
      name: 'Follow-up other option',
    });
    await expect(followUp).not.toBeChecked();
    await userEvent.click(followUp);
    await expect(
      await dialog.findByRole('textbox', { name: 'Follow-up question' }),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
