import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { DyadCensusStageEditor } from './DyadCensusStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Dyad Census',
  component: StageEditorStoryHost,
  args: {
    stageId: 'dyad-census-1',
    renderEditor: ({ controller, actions }) => (
      <DyadCensusStageEditor
        controller={controller}
        stageType="DyadCensus"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Dyad Census editor, opened on a configured stage of the shared all-interfaces protocol. The introduction sits between the node type and the prompts, in the order the participant meets them: a census walks through every pair in the network, so the schema requires the screen that explains it.',
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
    await userEvent.type(name, 'Who knows whom');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Who knows whom”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Who knows whom"');
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
