import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../storyHost/StageEditorStoryHost.tsx';
import { AnonymisationStageEditor } from './AnonymisationStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Editors/Anonymisation',
  component: StageEditorStoryHost,
  args: {
    stageId: 'anonymisation-1',
    renderEditor: ({ controller, actions }) => (
      <AnonymisationStageEditor
        controller={controller}
        stageType="Anonymisation"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage that asks a participant for the passphrase protecting their answers: what they are told before they choose one, whether it has to meet any requirements, and which codebook attributes it protects. The encrypted attributes are a property of the codebook rather than of this stage, so switching one on is a compound edit the host applies atomically — everything else is an ordinary field the save flushes.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it. The play rewrites the heading
 * the participant reads and saves, which is what carries the draft into the
 * session and on to the host.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const heading = canvas.getByRole('textbox', {
      name: 'Explanation heading',
    });
    await userEvent.clear(heading);
    await userEvent.type(heading, 'Your answers are protected');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByText('Saved “Anonymisation”.'),
      ).toBeInTheDocument();
    });
    await expect(
      canvas.getByText(/Your answers are protected/),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
