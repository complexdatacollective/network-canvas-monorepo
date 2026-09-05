import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { NetworkComposerStageEditor } from './NetworkComposerStageEditor.tsx';
import { NetworkStoryHost } from './networkStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Editors/Network composer',
  component: NetworkStoryHost,
  args: {
    stageId: 'network-composer-1',
    renderEditor: ({ controller, actions }) => (
      <NetworkComposerStageEditor
        controller={controller}
        stageType="NetworkComposer"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The canvas the participant builds the network on: what they type to add a person, where their placements and groupings are remembered, which kinds of connection they may draw, and what the canvas looks like behind all of it. Each attribute picker offers only what the codebook can legally supply, and can create one where the protocol has nothing suitable yet.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NetworkStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it. The play lets the participant
 * draw one kind of connection and saves, which is what carries the draft into
 * the session and on to the host.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('checkbox', { name: 'knows' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        'Saved “Network Composer”.',
      );
    });
    await expect(canvas.getByText(/"type": "knows"/)).toBeInTheDocument();
  },
};
