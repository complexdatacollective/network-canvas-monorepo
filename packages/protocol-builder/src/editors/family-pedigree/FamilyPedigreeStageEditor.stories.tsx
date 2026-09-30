import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { familyPedigreeStageEditor } from './FamilyPedigreeStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Editors/Family Pedigree',
  component: StageEditorStoryHost,
  args: {
    stageId: 'family-pedigree-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={familyPedigreeStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The stage a participant draws their family in. It runs from what the pedigree is — the language it uses, how far it must reach — through the codebook attributes the interface writes the family into, to the introduction screen and the questions asked while it is built. Attributes can be created here without leaving the stage, which commits to the codebook on its own rather than travelling as a stage field.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it. The play tightens a boundary and
 * saves, so the story settles on the document the host was asked to commit.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Grandparent requirement' }),
      'required',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Family Pedigree”.');
    });
    await expect(
      canvas.getByText(/"requireGrandparents": "required"/),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
