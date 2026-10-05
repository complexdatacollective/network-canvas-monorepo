import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { familyPedigreeStageEditor } from './FamilyPedigreeStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Family pedigree',
  component: StageEditorStoryHost,
  args: {
    stageId: 'family-pedigree-1',
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
          'The editor for the stage a participant draws their family on: they select anyone on the canvas and add a parent, sibling, partner or child, describing each new person in a side panel. The researcher chooses the node type people are, binds the attributes the interface records about each person and each relationship, writes the instruction shown on the canvas, and may add further questions about each person.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A configured pedigree, every slot bound. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('heading', { name: 'Person attributes' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: 'Relationships' }),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
