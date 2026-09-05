import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import FormStageEditorStoryHost from './FormStageEditorStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Per alter edge form',
  component: FormStageEditorStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor for a form the participant fills in once for each relationship in their network. Identical in shape to the per-alter form, and different in what it is about: its subject is an edge type, so its fields collect against the codebook of a relationship.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FormStageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The editor as the researcher meets it, on a form that already collects an attribute. */
export const Editing: Story = {
  args: {
    stageId: 'alter-edge-form-1',
    access: { mode: 'editable', leaseOwner: 'storybook', leaseEpoch: 1n },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'About each relationship');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByText('About each relationship'),
      ).toBeInTheDocument();
    });
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: {
    stageId: 'alter-edge-form-1',
    access: { mode: 'readOnly', reason: 'spectator' },
  },
};
