import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { tieStrengthCensusStageEditor } from './TieStrengthCensusStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Tie-Strength Census',
  component: StageEditorStoryHost,
  args: {
    stageId: 'tie-strength-census-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={tieStrengthCensusStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage a participant rates every pair of people in. The same composition as the Dyad Census, and a prompt that records one more thing: the attribute of the connection whose ordered values are the scale the answer is given on.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening a prompt: the question, the connection it rates, and the scale. */
export const EditingAPrompt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('button', { name: 'Edit prompt' }));

    // The row dialog is portalled out of the canvas, so it is found on the
    // document rather than inside the editor that opened it.
    const dialog = within(await screen.findByRole('dialog'));
    await waitFor(async () => {
      await expect(dialog.getByRole('radio', { name: 'knows' })).toBeChecked();
    });
    // The scale is the CONNECTION's attribute, not the person's.
    await expect(
      dialog.getByRole('combobox', { name: 'Attribute' }),
    ).toHaveValue('closeness');
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
