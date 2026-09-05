import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { CensusEditorStoryHost } from './censusEditorStoryHost.tsx';
import { DyadCensusStageEditor } from './DyadCensusStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Dyad Census',
  component: CensusEditorStoryHost,
  args: {
    stageId: 'dyad-census-1',
    editor: DyadCensusStageEditor,
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
} satisfies Meta<typeof CensusEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renaming the stage and saving it, which is the whole editor in one pass. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole('textbox', { name: 'Stage name' });

    await userEvent.clear(name);
    await userEvent.type(name, 'Who knows whom');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Who knows whom'),
    );
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
