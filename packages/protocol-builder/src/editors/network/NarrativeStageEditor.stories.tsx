import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { NarrativeStageEditor } from './NarrativeStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Editors/Narrative',
  component: StageEditorStoryHost,
  args: {
    stageId: 'narrative-1',
    renderEditor: ({ controller, actions }) => (
      <NarrativeStageEditor
        controller={controller}
        stageType="Narrative"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The canvas a researcher and participant talk over: which people are on it, the saved ways of looking at them that can be switched between during the interview, what sits behind them, and what the participant may do to any of it. The background image is a protocol resource chosen through the package’s resource picker, so no file or URL is ever typed into the stage.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it. The play withdraws permission to
 * draw on the canvas and saves, which is what carries the draft into the
 * session and on to the host.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('switch', { name: 'Allow drawing on the canvas' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Narrative”.');
    });
    await expect(canvas.getByText(/"freeDraw": false/)).toBeInTheDocument();
  },
};
