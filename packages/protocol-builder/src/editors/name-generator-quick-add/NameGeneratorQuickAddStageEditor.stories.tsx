import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { nameGeneratorQuickAddStageEditor } from './NameGeneratorQuickAddStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator (quick add)',
  component: StageEditorStoryHost,
  args: {
    stageId: 'name-generator-quick-add-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={nameGeneratorQuickAddStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The name generator a participant names people with in a single box. The attribute that box fills in is chosen from the node type’s own codebook, and the stage is qualified by the side panels beside its question.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Choosing what the single box fills in, and saving the stage. */
export const ChoosingTheAttribute: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      await canvas.findByRole('combobox', { name: /Select an attribute/ }),
      'relationship_to_ego',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Name Generator Quick Add”.');
    });
    // The choice itself, in the document the host was handed: a save that
    // reported success while committing the attribute it opened on would look
    // identical above.
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"quickAdd": "relationship_to_ego"');
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
