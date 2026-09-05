import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../storyHost/StageEditorStoryHost.tsx';
import { NarrativePedigreeStageEditor } from './NarrativePedigreeStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Editors/Narrative Pedigree',
  component: StageEditorStoryHost,
  args: {
    // The fixture protocol runs "family-pedigree-1" before this stage, which
    // is what makes it a source this stage may read: without a Family Pedigree
    // earlier in the interview there is no family to draw, and the editor
    // opens on its own empty state instead.
    stageId: 'narrative-pedigree-1',
    renderEditor: ({ controller, actions }) => (
      <NarrativePedigreeStageEditor
        controller={controller}
        stageType="NarrativePedigree"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage that draws conditions onto a family the participant has already built. It has no family of its own: every disease maps an attribute of the node type belonging to the Family Pedigree stage it reads, so the source comes first and everything after it is configured against that stage. A source that is deleted, moved later, or changed to another interface while the editor is open is reported rather than corrected.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it, reading the pedigree that runs
 * before it. The play switches at-risk statuses on and saves.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('switch', {
        name: 'Show possible (at-risk) statuses',
      }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByText('Saved “Narrative Pedigree”.'),
      ).toBeInTheDocument();
    });
    await expect(
      canvas.getByText(/"showAtRiskStatuses": true/),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
