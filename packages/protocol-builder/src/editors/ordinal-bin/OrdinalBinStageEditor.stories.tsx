import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { storyDialogVisible } from '../dyad-census/storyDialogVisible.ts';
import { ordinalBinStageEditor } from './OrdinalBinStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Ordinal Bin',
  component: StageEditorStoryHost,
  args: {
    stageId: 'ordinal-bin-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={ordinalBinStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage a participant sorts every person onto a scale in. Each prompt names the attribute whose ordered values become the bins, and the colour gradient those bins are shaded along.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening a prompt: the question, the scale, and the gradient it runs through. */
export const EditingAPrompt: Story = {
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
      ).toHaveTextContent('contactFreq');
    });
    // `ord-color-seq-1` is the first swatch of the schema's own sequence.
    await expect(
      dialog.getByRole('radio', { name: 'Sea Green' }),
    ).toBeChecked();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
