import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { nameGeneratorStageEditors } from '../nameGeneratorStageEditors.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator',
  component: StageEditorStoryHost,
  args: {
    stageId: 'name-generator-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this family claims the interface its stage is of.
    renderEditor: ({ controller, actions }) => (
      <StageEditor
        controller={controller}
        registry={nameGeneratorStageEditors}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The name generator a participant names people with, one form at a time. Opened on the shared all-interfaces protocol, over a real editing session: the node type comes from that protocol’s codebook, the form’s attributes from the type, and saving hands the whole stage to the host.',
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
      ).toHaveTextContent('Saved “Name Generator (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Name Generator (revised)"');
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
