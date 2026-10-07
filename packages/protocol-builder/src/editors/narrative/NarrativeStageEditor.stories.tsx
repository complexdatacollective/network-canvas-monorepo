import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { storyDialogVisible } from '../dyad-census/storyDialogVisible.ts';
import { narrativeStageEditor } from './NarrativeStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Narrative',
  component: StageEditorStoryHost,
  args: {
    stageId: 'narrative-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={narrativeStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The canvas a participant is shown their own network on and asked to talk about it. Opened on the shared all-interfaces protocol: the node type and the attributes each preset positions, groups and highlights by come from that protocol’s codebook, and saving hands the whole stage to the host.',
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
      ).toHaveTextContent('Saved “Narrative (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": { "en-US": "Narrative (revised)" }');
  },
};

/**
 * Each attribute a preset highlights carries the label a participant reads for
 * it, written in every language the protocol is in. A newly ticked attribute's
 * label starts as the attribute's name.
 */
export const HighlightLabels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const [editPreset] = canvas.getAllByRole('button', { name: 'Edit preset' });
    if (editPreset === undefined) throw new Error('the stage has no preset');
    await userEvent.click(editPreset);

    const panel = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
    );
    await storyDialogVisible(panel);
    const preset = within(panel);
    await expect(
      preset.getByRole('textbox', { name: 'Label for “flagged”' }),
    ).toHaveValue('Flagged');
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
