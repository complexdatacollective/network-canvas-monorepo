import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../storyHost/StageEditorStoryHost.tsx';
import { SociogramStageEditor } from './SociogramStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Editors/Sociogram',
  component: StageEditorStoryHost,
  args: {
    stageId: 'sociogram-1',
    renderEditor: ({ controller, actions }) => (
      <SociogramStageEditor
        controller={controller}
        stageType="Sociogram"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The tasks a participant works through on a canvas, in order: each prompt decides what the canvas shows, which connections are drawn, and what tapping a node does. The two decisions about the canvas itself — what is drawn behind the nodes, and how they are arranged when the stage opens — follow the prompts they are performed on.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it. The play hands the arranging
 * back to the participant and saves, which is what carries the draft into the
 * session and on to the host.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(canvas.getByRole('option', { name: /Manual mode/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        'Saved “Sociogram”.',
      );
    });
    await expect(
      canvas.getByText(/"automaticLayout": false/),
    ).toBeInTheDocument();
  },
};
