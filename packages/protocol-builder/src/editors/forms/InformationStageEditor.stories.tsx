import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import FormStageEditorStoryHost from './FormStageEditorStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Information',
  component: FormStageEditorStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor for a page the participant reads rather than a task they do: a heading and an ordered list of blocks of text and media, plus the skip logic and interviewer guidance every stage carries. It is opened here over a real editing session holding the shared all-interfaces protocol.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FormStageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The editor as the researcher meets it, on a page that already has content. */
export const Editing: Story = {
  args: {
    stageId: 'information-1',
    access: { mode: 'editable', leaseOwner: 'storybook', leaseEpoch: 1n },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Welcome screen');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(canvas.getByText('Welcome screen')).toBeInTheDocument();
    });
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: {
    stageId: 'information-1',
    access: { mode: 'readOnly', reason: 'spectator' },
  },
};
