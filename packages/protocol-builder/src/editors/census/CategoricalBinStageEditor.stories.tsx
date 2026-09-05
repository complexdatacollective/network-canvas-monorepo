import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { CategoricalBinStageEditor } from './CategoricalBinStageEditor.tsx';
import { CensusEditorStoryHost } from './censusEditorStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Categorical Bin',
  component: CensusEditorStoryHost,
  args: {
    stageId: 'categorical-bin-1',
    editor: CategoricalBinStageEditor,
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Categorical Bin editor, opened on a configured stage of the shared all-interfaces protocol. It composes the stage header, the node type and its filter, the categorical prompts, skip logic and interviewer guidance into the shared shell; the host supplies only the save button and reads the form id from the action slot.',
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
    await userEvent.type(name, 'Kinds of contact');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent('Kinds of contact'),
    );
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
