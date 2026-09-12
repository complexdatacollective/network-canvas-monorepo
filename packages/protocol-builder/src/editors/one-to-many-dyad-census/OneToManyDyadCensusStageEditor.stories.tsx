import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { oneToManyDyadCensusStageEditor } from './OneToManyDyadCensusStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/One-to-Many Dyad Census',
  component: StageEditorStoryHost,
  args: {
    stageId: 'one-to-many-dyad-census-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={oneToManyDyadCensusStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage a participant is shown one person and the group around them in. It has no introduction screen — the whole network is on screen from the first question — and it does have a decision the two pairwise censuses do not: what becomes of a person once they have been considered, which is asked after the prompts that describe the task.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What the researcher reads down the side of the stage. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Where this interface differs, in the order it is asked: the availability
    // question comes after the prompts whose task it is about.
    await expect(
      canvas.getByRole('radio', { name: 'Remove them from the list' }),
    ).toBeChecked();
    await expect(canvas.queryByRole('textbox', { name: 'Title' })).toBeNull();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
