import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { OneToManyDyadCensusStageEditor } from './OneToManyDyadCensusStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/One to Many Dyad Census',
  component: StageEditorStoryHost,
  args: {
    stageId: 'one-to-many-dyad-census-1',
    renderEditor: ({ controller, actions }) => (
      <OneToManyDyadCensusStageEditor
        controller={controller}
        stageType="OneToManyDyadCensus"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The One-to-Many Dyad Census editor, opened on a configured stage of the shared all-interfaces protocol. What becomes of a person once they have been considered comes after the prompts: it is behaviour of the task the prompts describe.',
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
    await userEvent.type(name, 'Who each person knows');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Who each person knows”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Who each person knows"');
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
