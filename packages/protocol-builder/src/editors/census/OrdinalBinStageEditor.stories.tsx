import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { CensusEditorStoryHost } from './censusEditorStoryHost.tsx';
import { OrdinalBinStageEditor } from './OrdinalBinStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Ordinal Bin',
  component: CensusEditorStoryHost,
  args: {
    stageId: 'ordinal-bin-1',
    editor: OrdinalBinStageEditor,
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The Ordinal Bin editor, opened on a configured stage of the shared all-interfaces protocol. The same composition as the Categorical Bin editor, differing only in the prompts: the bins are an ordered scale, shaded along a gradient the prompt chooses.',
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
    await userEvent.type(name, 'How often you see people');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent(
        'How often you see people',
      ),
    );
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
