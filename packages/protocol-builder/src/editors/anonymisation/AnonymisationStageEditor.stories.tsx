import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { anonymisationStageEditor } from './AnonymisationStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Anonymisation',
  component: StageEditorStoryHost,
  args: {
    stageId: 'anonymisation-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={anonymisationStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage that asks a participant for the passphrase protecting their answers: what they are told before choosing one, whether it has to meet any requirements, and which attributes it protects. The last of those is not a property of this stage — `encrypted` belongs to a codebook attribute — so ticking a box there commits a codebook change on its own rather than waiting for this stage to be saved.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renaming a stage and saving it: the whole editor, end to end. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Anonymisation (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Anonymisation (revised)"');
  },
};

/**
 * Encryption protects text only, and the offer is read from the codebook.
 *
 * The one part of this editor that is not a stage field at all, so the story
 * proves the codebook reached it: each node type is asked separately, and a
 * number or a boolean is never offered — encrypting one would store it in the
 * clear while telling the researcher otherwise.
 */
export const ChoosingWhatIsProtected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const group = await canvas.findByRole('group', {
      name: 'Encrypted attributes for person',
    });
    await expect(
      within(group).getByRole('checkbox', { name: 'name' }),
    ).toBeInTheDocument();
    await expect(
      within(group).queryByRole('checkbox', { name: 'age' }),
    ).toBeNull();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
