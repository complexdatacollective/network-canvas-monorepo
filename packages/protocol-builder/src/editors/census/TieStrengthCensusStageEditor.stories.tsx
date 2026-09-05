import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { TieStrengthCensusStageEditor } from './TieStrengthCensusStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Tie-Strength Census',
  component: StageEditorStoryHost,
  args: {
    stageId: 'tie-strength-census-1',
    renderEditor: ({ controller, actions }) => (
      <TieStrengthCensusStageEditor
        controller={controller}
        stageType="TieStrengthCensus"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Tie-Strength Census editor, opened on a configured stage of the shared all-interfaces protocol. The same composition as the Dyad Census editor — both walk the participant through every pair in the network — differing only in what an answer records: a connection, and how strong it is.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renaming the stage and saving it, which is the whole editor in one pass. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'How close each pair is');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “How close each pair is”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "How close each pair is"');
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
